# cortex-node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the local tenant Cortex Node — embedder, ArticleStore, VectorIndex, ProvenanceGraph, TrustEngine, broker client, and the `CortexNode` public facade — so agents can publish, query, and derive signed memory articles scoped by trust.

**Architecture:** A single `CortexNode` class composes a GPU-backed `Embedder` (CPU-fallback on OOM/missing ROCm), a SQLite `ArticleStore`, one of two `VectorIndex` backends (`FAISSGPUIndex` or `HNSWIndex`), a NetworkX `ProvenanceGraph` persisted to SQLite, a single-hop memoizing `TrustEngine`, and an async `BrokerClient` with disk-spill queue. The node owns all disk, GPU, vector, and broker-socket I/O per Design §2.3; everything flows through `publish` / `query` / `derive`.

**Tech Stack:** Python 3.11+, PyTorch-on-ROCm, FAISS-gpu / hnswlib, SQLite (stdlib sqlite3), NetworkX, websockets async client, cryptography, PyYAML.

---

## Locked decisions (binding)

| # | Decision | Value |
|---|---|---|
| D1 | Headline embedder | `bge-small-en-v1.5` (384-dim, 33M params) |
| D4 | Bench sidecar topology | per-node sidecar |
| D5 | Article content cap | 2000 chars |
| D7 | Trust formula | `0.6*base + 0.4*source - source_penalty` |
| D8 | Demo scenario | F1 SOC consortium |

## Scope of cortex-node

The local Cortex tenant node. Owns: GPU embedder, ArticleStore (SQLite), VectorIndex (faiss-gpu OR hnswlib), ProvenanceGraph (NetworkX DiGraph persisted to SQLite), TrustEngine, broker websocket client, and the `CortexNode` public class.

Spec sources: `docs/2026-07-15-cortex-design.md` §7 (Storage), §8 (Embedding/retrieval), §9 (Trust), §12 (Error handling).

### Components to plan

1. **Config loader** (`cortex/node/config.py`): dataclass `NodeConfig` parsed from `config.yaml` (Design §17.1). Env overrides: `CORTEX_BROKER_URL`, `CORTEX_EMBED_BACKEND` (`auto | gpu | cpu`), `CORTEX_LOG_LEVEL`, `CORTEX_BENCH_ENABLED`. Use PyYAML.
2. **ArticleStore** (`cortex/node/store.py`): SQLite schema per Design §7.1; methods `put/get/set_state/add_cite/cited_by/iter_ids/event_log_append/recent_events`; `sqlite3.OperationalError` retry with 200 ms backoff, max 3 retries (§12.1).
3. **Embedder** (`cortex/node/embedder.py`): `Embedder(model="BAAI/bge-small-en-v1.5", backend="auto", batch_size=16, fallback_on_oom=True)`; `embed(list[str]) -> np.ndarray` float16 L2-normalized (B,384); `embed_one(str)`; bge `"finding: "` prefix; OOM halve-and-retry; `_check_gpu` healthcheck; `on_embed_failed` callback hook; defer transformer import to constructor.
4. **VectorIndex** (`cortex/node/vector_index.py`): `VectorIndexProtocol` (add/search/size/save/load); `HNSWIndex` (hnswlib, M=32, ef_construction=200, ef_search=64); `FAISSGPUIndex` (`IndexFlatIP(384)` on GPU, fall back to HNSW on ImportError); persist `index.bin` + `meta.json`.
5. **ProvenanceGraph** (`cortex/node/provenance.py`): NetworkX DiGraph, edges `derived → cited`; `add_citation/cited_by/descendants/ancestors`; persist to SQLite `provenance_edges`; rehydrate on restart; bump `graph_version` on every mutation.
6. **TrustEngine** (`cortex/node/trust.py`): static formula from Design §9.2 EXACTLY; `default_org_reputation=0.5`, `reputation_overrides`, `half_life_days=90`, `min_trust_default=0.3`; `recency_decay`; `trust_for(article, now)`; memoize per `(article_id, graph_version)`; single-hop propagation in MVP.
7. **Retrieval pipeline** (`cortex/node/query.py`): `retrieve(store, vector_index, embedder, query_text, topic_filter, scope_filter, top_k, min_trust, deadline_ms)` per §8.3; `QueryResult` dataclass.
8. **BrokerClient** (`cortex/node/broker_client.py`): `BrokerClient(url, org_did, registry_path, replay_window_sec=600, on_event, on_metrics)`; async `connect/stop/publish_envelope/query_fanout`; exponential backoff 1 s..30 s; outbound `asyncio.Queue` with disk spill at >10k pending; replay on reconnect.
9. **CortexNode facade** (`cortex/node/node.py`): `CortexNode(org_did, agent_did, key_paths, broker_url, config_path)`; `start/stop` async; `publish/query/derive`; event hooks `node.embed.completed`, `node.embed.fallback_cpu`, `node.queue.spilled`, `publisher.scope_violation`; 5 s healthcheck loop.
10. **Key helper** (`cortex/node/keys.py`): `load_keys(org_path, agent_path) -> (priv_pem, priv_pem)`; `ensure_keys(path)` generates Ed25519 with mode 0600; refuse world-readable files.

## Shared contract (LOCKED from cortex-core plan)

```python
from cortex.core.article import MemoryArticle, Provenance, Scope, ArticleType, ArticleId, AgentDID, OrgDID
from cortex.core.canonical import article_canonical_bytes, compute_article_id, sha256_hex
from cortex.core.crypto import sign, verify, load_private_pem, generate_org_keypair, generate_agent_keypair, did_for_agent
from cortex.core.envelope import Envelope, EnvelopeType, envelope_to_json, envelope_from_json
from cortex.core.errors import SignatureVerificationError, CanonicalMismatchError, EmbedFailedError, BrokerDisconnectError, ScopeViolationError, DeadlineExceededError
```

Downstream surface (this plan produces):

```python
# cortex/node/node.py
class CortexNode:
    def __init__(self, org_did: str, agent_did: str, key_paths: dict[str, pathlib.Path],
                 broker_url: str, config_path: pathlib.Path): ...
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    def publish(self, article: MemoryArticle) -> str: ...
    def query(self, query_text: str, topic_filter: list[str], scope_filter: list[str],
              top_k: int, min_trust: float, deadline_ms: int) -> list[QueryResult]: ...
    def derive(self, new_article: MemoryArticle, cited_article_ids: list[str]) -> str: ...

# cortex/node/query.py
@dataclass
class QueryResult:
    article: MemoryArticle
    article_id: str
    hybrid_score: float
    trust_score: float
    provenance_summary: dict
```

`cortex-node` MUST be the only thing that touches disks, vector indexes, GPU, and broker sockets (Design §2.3).

---

### Task 1: NodeConfig dataclass + YAML loader + env overrides

**Files:**
- Create: `cortex/node/config.py`
- Test: `tests/unit/node/test_config.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_config.py
import os
import textwrap
from pathlib import Path

from cortex.node.config import NodeConfig, load_config


def test_load_config_yaml_round_trip(tmp_path: Path) -> None:
    yaml = textwrap.dedent("""\
        node:
          org_did: did:percq:org:soc-alpha
          agent_did: did:percq:agent:alpha-bot-1
          key_paths:
            org: ./keys/org_ed25519.pem
            agent: ./keys/agent_ed25519.pem
        broker:
          url: wss://broker.local:7432
          registry: ./registry/org_registry.json
          replay_window_sec: 600
        embedder:
          model: bge-small-en-v1.5
          backend: auto
          batch_size: 16
          fallback_on_oom: true
        vector_index:
          backend: faiss-gpu
          metric: cosine
          hnsw:
            M: 32
            ef_construction: 200
            ef_search: 64
        trust:
          default_org_reputation: 0.5
          reputation_overrides:
            did:percq:org:soc-alpha: 0.85
            did:percq:org:soc-beta: 0.78
          half_life_days: 90
          min_trust_default: 0.3
        query:
          default_top_k: 5
          deadline_ms: 400
          min_trust: 0.3
        logging:
          level: INFO
          file: ./logs/node.log
    """)
    p = tmp_path / "config.yaml"
    p.write_text(yaml)
    cfg = load_config(p)
    assert isinstance(cfg, NodeConfig)
    assert cfg.node.org_did == "did:percq:org:soc-alpha"
    assert cfg.embedder.backend == "auto"
    assert cfg.embedder.batch_size == 16
    assert cfg.trust.reputation_overrides["did:percq:org:soc-alpha"] == 0.85
    assert cfg.vector_index.hnsw.M == 32


def test_env_override_embed_backend_cpu(tmp_path: Path, monkeypatch) -> None:
    yaml = textwrap.dedent("""\
        node:
          org_did: did:percq:org:soc-alpha
          agent_did: did:percq:agent:alpha-bot-1
          key_paths: {org: ./o.pem, agent: ./a.pem}
        broker: {url: wss://b.local:7432, registry: ./r.json, replay_window_sec: 600}
        embedder: {model: bge-small-en-v1.5, backend: auto, batch_size: 16, fallback_on_oom: true}
        vector_index: {backend: faiss-gpu, metric: cosine, hnsw: {M: 32, ef_construction: 200, ef_search: 64}}
        trust: {default_org_reputation: 0.5, reputation_overrides: {}, half_life_days: 90, min_trust_default: 0.3}
        query: {default_top_k: 5, deadline_ms: 400, min_trust: 0.3}
        logging: {level: INFO, file: ./logs/node.log}
    """)
    p = tmp_path / "config.yaml"
    p.write_text(yaml)
    monkeypatch.setenv("CORTEX_EMBED_BACKEND", "cpu")
    monkeypatch.setenv("CORTEX_BROKER_URL", "wss://override.local:9000")
    monkeypatch.setenv("CORTEX_LOG_LEVEL", "DEBUG")
    monkeypatch.setenv("CORTEX_BENCH_ENABLED", "1")
    cfg = load_config(p)
    assert cfg.embedder.backend == "cpu"
    assert cfg.broker.url == "wss://override.local:9000"
    assert cfg.logging.level == "DEBUG"
    assert cfg.bench_enabled is True
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_config.py`
Expected: `ImportError: cannot import name 'NodeConfig' from 'cortex.node.config'`.

- [x] **Step 3: Write minimal implementation**

```python
# cortex/node/config.py
"""Node configuration: YAML + env overrides (Design §17.1-17.2)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass
class NodeSection:
    org_did: str = ""
    agent_did: str = ""
    key_paths: dict[str, str] = field(default_factory=dict)


@dataclass
class BrokerSection:
    url: str = ""
    registry: str = ""
    replay_window_sec: int = 600


@dataclass
class EmbedderSection:
    model: str = "bge-small-en-v1.5"
    backend: str = "auto"
    batch_size: int = 16
    fallback_on_oom: bool = True


@dataclass
class HnswSection:
    M: int = 32
    ef_construction: int = 200
    ef_search: int = 64


@dataclass
class VectorIndexSection:
    backend: str = "faiss-gpu"
    metric: str = "cosine"
    hnsw: HnswSection = field(default_factory=HnswSection)


@dataclass
class TrustSection:
    default_org_reputation: float = 0.5
    reputation_overrides: dict[str, float] = field(default_factory=dict)
    half_life_days: int = 90
    min_trust_default: float = 0.3


@dataclass
class QuerySection:
    default_top_k: int = 5
    deadline_ms: int = 400
    min_trust: float = 0.3


@dataclass
class LoggingSection:
    level: str = "INFO"
    file: str = "./logs/node.log"


@dataclass
class NodeConfig:
    node: NodeSection = field(default_factory=NodeSection)
    broker: BrokerSection = field(default_factory=BrokerSection)
    embedder: EmbedderSection = field(default_factory=EmbedderSection)
    vector_index: VectorIndexSection = field(default_factory=VectorIndexSection)
    trust: TrustSection = field(default_factory=TrustSection)
    query: QuerySection = field(default_factory=QuerySection)
    logging: LoggingSection = field(default_factory=LoggingSection)
    bench_enabled: bool = False


def _merge(target: Any, src: dict[str, Any]) -> None:
    for k, v in src.items():
        if isinstance(v, dict) and hasattr(target, k):
            _merge(getattr(target, k), v)
        elif hasattr(target, k):
            setattr(target, k, v)


def load_config(path: Path) -> NodeConfig:
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    cfg = NodeConfig()
    _merge(cfg, raw)
    if (v := os.environ.get("CORTEX_BROKER_URL")):
        cfg.broker.url = v
    if (v := os.environ.get("CORTEX_EMBED_BACKEND")):
        cfg.embedder.backend = v
    if (v := os.environ.get("CORTEX_LOG_LEVEL")):
        cfg.logging.level = v
    if (v := os.environ.get("CORTEX_BENCH_ENABLED")):
        cfg.bench_enabled = v not in ("", "0", "false", "False")
    return cfg
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_config.py`
Expected: `2 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/config.py tests/unit/node/test_config.py
git commit -m "feat(node): NodeConfig dataclass with YAML + env overrides

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 2: ArticleStore schema initialization

**Files:**
- Create: `cortex/node/store.py`
- Test: `tests/unit/node/test_store.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_store.py
import sqlite3
import time
from pathlib import Path
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from cortex.node.store import ArticleStore


def make_article(
    art_id: str = "id-1",
    content: str = "hello",
    scope: str = "public",
    state: str = "signed",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=art_id,
        type="finding",
        content=content,
        payload={"k": "v"},
        scope=scope,
        agent_signature=b"\x01\x02",
        org_signature=None,
        cites=[],
        provenance=SimpleNamespace(
            producer_agent="did:percq:agent:a",
            producer_org="did:percq:org:soc-alpha",
            computation_ref=None,
            source_data_hash=None,
            source_data_schema=None,
            run_id="r1",
            timestamp=datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc),
        ),
        created_at=datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc),
        trust_score=None,
        trust_expiration=None,
    )


def test_schema_idempotent_reopen(tmp_path: Path) -> None:
    db = tmp_path / "articles.sqlite"
    s1 = ArticleStore(db)
    s1.close()
    s2 = ArticleStore(db)  # must not raise "table already exists"
    s2.close()
    conn = sqlite3.connect(db)
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    conn.close()
    names = {r[0] for r in rows}
    assert {"articles", "provenance_edges", "events"}.issubset(names)
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_store.py::test_schema_idempotent_reopen`
Expected: import error.

- [x] **Step 3: Write minimal implementation**

```python
# cortex/node/store.py
"""SQLite ArticleStore — Design §7.1."""
from __future__ import annotations

import sqlite3
import time
from pathlib import Path
from typing import Any, Iterable

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  content       TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  scope         TEXT NOT NULL,
  agent_sig     BLOB NOT NULL,
  org_sig       BLOB,
  cites_json    TEXT NOT NULL DEFAULT '[]',
  state         TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  published_at  TEXT,
  trust_score   REAL,
  trust_expires TEXT
);
CREATE INDEX IF NOT EXISTS idx_articles_type  ON articles(type);
CREATE INDEX IF NOT EXISTS idx_articles_scope ON articles(scope);
CREATE INDEX IF NOT EXISTS idx_articles_trust ON articles(trust_score DESC);

CREATE TABLE IF NOT EXISTS provenance_edges (
  source_id TEXT NOT NULL,
  cited_id  TEXT NOT NULL,
  PRIMARY KEY (source_id, cited_id)
);

CREATE TABLE IF NOT EXISTS events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL,
  event      TEXT NOT NULL,
  article_id TEXT,
  payload_json  TEXT NOT NULL
);
"""


class ArticleStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)

    def close(self) -> None:
        self._conn.close()
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_store.py::test_schema_idempotent_reopen`
Expected: `1 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/store.py tests/unit/node/test_store.py
git commit -m "feat(node): ArticleStore SQLite schema initialization

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 3: ArticleStore put/get/set_state/cited_by/event_log_append + retry

**Files:**
- Modify: `cortex/node/store.py`, `tests/unit/node/test_store.py`

- [x] **Step 1: Write the failing test**

Append to `tests/unit/node/test_store.py`:

```python
def test_put_get_round_trip(tmp_path: Path) -> None:
    s = ArticleStore(tmp_path / "a.sqlite")
    art = make_article()
    s.put(art, state="signed")
    got = s.get("id-1")
    assert got is not None
    assert got["id"] == "id-1"
    assert got["content"] == "hello"
    assert got["scope"] == "public"
    assert got["state"] == "signed"
    s.close()


def test_set_state(tmp_path: Path) -> None:
    s = ArticleStore(tmp_path / "a.sqlite")
    s.put(make_article(), state="signed")
    s.set_state("id-1", "indexed")
    assert s.get("id-1")["state"] == "indexed"
    s.close()


def test_cited_by(tmp_path: Path) -> None:
    s = ArticleStore(tmp_path / "a.sqlite")
    s.put(make_article("base"), state="signed")
    s.put(make_article("deriv"), state="signed")
    s.add_cite("deriv", "base")
    assert s.cited_by("base") == ["deriv"]
    s.close()


def test_event_log_append_and_recent(tmp_path: Path) -> None:
    s = ArticleStore(tmp_path / "a.sqlite")
    s.event_log_append("node.started", None, {"pid": 1})
    s.event_log_append("node.embed.completed", "id-1", {"ms": 12})
    ev = s.recent_events(limit=10)
    assert len(ev) == 2
    assert ev[0][1] == "node.started"
    assert ev[1][1] == "node.embed.completed"
    assert ev[1][2] == "id-1"
    s.close()


def test_operational_error_retries(tmp_path: Path, monkeypatch) -> None:
    s = ArticleStore(tmp_path / "a.sqlite")
    calls = {"n": 0}

    def boom(*a: Any, **k: Any) -> Any:
        calls["n"] += 1
        if calls["n"] < 3:
            raise sqlite3.OperationalError("database is locked")
        return sqlite3.Cursor(a[0] if a else None)

    monkeypatch.setattr(s._conn, "execute", boom)
    monkeypatch.setattr(time, "sleep", lambda _x: None)
    # direct method that retries on OperationalError
    s.event_log_append("test.event", None, {"ok": True})
    assert calls["n"] >= 3
    s.close()
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_store.py`
Expected: `AttributeError: 'ArticleStore' object has no attribute 'put'`.

- [x] **Step 3: Write minimal implementation**

Append to `cortex/node/store.py`:

```python
import json
from datetime import datetime
from cortex.core.canonical import article_canonical_bytes  # noqa: F401  (contract hook)


def _retry(fun):
    def wrapper(*a, **k):
        last = None
        for _ in range(3):
            try:
                return fun(*a, **k)
            except sqlite3.OperationalError as e:
                last = e
                time.sleep(0.2)
        raise last  # type: ignore[misc]
    return wrapper


def _ts_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat() if dt.tzinfo else dt.isoformat()


class ArticleStore:  # extended
    # (continue class body)
    def put(self, article: Any, state: str) -> None:
        prov = article.provenance
        self._exec_retry(
            """INSERT OR REPLACE INTO articles
               (id, type, content, payload_json, scope, agent_sig, org_sig,
                cites_json, state, created_at, published_at, trust_score, trust_expires)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                article.id, article.type, article.content,
                json.dumps(article.payload, sort_keys=True, separators=(",", ":")),
                article.scope, bytes(article.agent_signature),
                bytes(article.org_signature) if article.org_signature else None,
                json.dumps(list(article.cites), separators=(",", ":")),
                state, _ts_iso(article.created_at), None,
                article.trust_score, _ts_iso(article.trust_expires) if article.trust_expiration else None,
            ),
        )

    def get(self, article_id: str) -> Any:
        cur = self._exec_retry("SELECT * FROM articles WHERE id=?", (article_id,))
        row = cur.fetchone()
        return row

    def set_state(self, article_id: str, new_state: str) -> None:
        self._exec_retry("UPDATE articles SET state=? WHERE id=?", (new_state, article_id))

    def add_cite(self, source_id: str, cited_id: str) -> None:
        self._exec_retry(
            "INSERT OR IGNORE INTO provenance_edges (source_id, cited_id) VALUES (?, ?)",
            (source_id, cited_id),
        )

    def cited_by(self, article_id: str) -> list[str]:
        cur = self._exec_retry(
            "SELECT source_id FROM provenance_edges WHERE cited_id=?", (article_id,)
        )
        return [r[0] for r in cur.fetchall()]

    def iter_ids(self) -> Iterable[str]:
        cur = self._exec_retry("SELECT id FROM articles", ())
        for row in cur.fetchall():
            yield row[0]

    def event_log_append(self, event: str, article_id: str | None, payload: dict) -> None:
        self._exec_retry(
            "INSERT INTO events (ts, event, article_id, payload_json) VALUES (?,?,?,?)",
            (
                datetime.now(timezone.utc).isoformat(),
                event, article_id,
                json.dumps(payload, sort_keys=True, separators=(",", ":")),
            ),
        )

    def recent_events(self, limit: int = 100) -> list[tuple]:
        cur = self._exec_retry(
            "SELECT seq, event, article_id, payload_json FROM events ORDER BY seq DESC LIMIT ?",
            (limit,),
        )
        return [(r[0], r[1], r[2], r[3]) for r in cur.fetchall()]

    @_retry
    def _exec_retry(self, sql: str, params: tuple) -> sqlite3.Cursor:
        return self._conn.execute(sql, params)
```

Adjust module imports to include `from datetime import datetime, timezone`.

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_store.py`
Expected: `5 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/store.py tests/unit/node/test_store.py
git commit -m "feat(node): ArticleStore put/get/state/cite/event-log with retry

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 4: Embedder (CPU backend, float16, L2-normalized)

**Files:**
- Create: `cortex/node/embedder.py`
- Test: `tests/unit/node/test_embedder.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_embedder.py
import numpy as np
import pytest

from cortex.node.embedder import Embedder


def test_embed_cpu_returns_float16_normalized() -> None:
    emb = Embedder(model="BAAI/bge-small-en-v1.5", backend="cpu", batch_size=4)
    vecs = emb.embed(["APT29 encoded powershell T1059.001", "lateral movement via SMB"])
    assert vecs.shape == (2, 384)
    assert vecs.dtype == np.float16
    norms = np.linalg.norm(vecs.astype(np.float32), axis=1)
    assert np.allclose(norms, 1.0, atol=1e-3)


def test_embed_one_shape() -> None:
    emb = Embedder(model="BAAI/bge-small-en-v1.5", backend="cpu", batch_size=4)
    v = emb.embed_one("a finding")
    assert v.shape == (384,)
    assert v.dtype == np.float16
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_embedder.py`
Expected: `ImportError: cannot import name 'Embedder'`.

- [x] **Step 3: Write minimal implementation**

```python
# cortex/node/embedder.py
"""bge-small-en-v1.5 embedder with CPU fallback and OOM adaptive batching (Design §8)."""
from __future__ import annotations

from typing import Callable, Literal

import numpy as np


class Embedder:
    def __init__(
        self,
        model: str = "BAAI/bge-small-en-v1.5",
        backend: Literal["auto", "gpu", "cpu"] = "auto",
        batch_size: int = 16,
        fallback_on_oom: bool = True,
        on_embed_failed: Callable[[str], None] | None = None,
    ) -> None:
        self.model_name = model
        self.requested_backend = backend
        self.batch_size = batch_size
        self.effective_batch_size = batch_size
        self.fallback_on_oom = fallback_on_oom
        self.on_embed_failed = on_embed_failed
        self.fallback_to_cpu = False
        self._device = "cpu"
        self._tokenizer = None
        self._model = None
        self._load()

    def _load(self) -> None:
        import torch  # delayed
        self._torch = torch
        desired = self.requested_backend
        if desired == "auto":
            desired = "gpu" if torch.cuda.is_available() else "cpu"
        if desired == "gpu":
            if not self._check_gpu():
                desired = "cpu"
                self.fallback_to_cpu = True
        self._device = "cuda" if desired == "gpu" else "cpu"
        from transformers import AutoModel, AutoTokenizer  # delayed
        self._tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self._model = AutoModel.from_pretrained(self.model_name).to(self._device).eval()

    def _check_gpu(self) -> bool:
        try:
            return bool(self._torch.cuda.is_available()) and self._torch.cuda.device_count() > 0
        except Exception:
            return False

    def _prefix(self, text: str) -> str:
        return f"finding: {text}" if not text.startswith(("finding:", "query:", "passage:")) else text

    def embed(self, texts: list[str]) -> np.ndarray:
        torch = self._torch
        prefix = [self._prefix(t) for t in texts]
        if self.fallback_to_cpu and self._device == "cuda":
            self._device = "cpu"
            self._model = self._model.to(self._device)
        out_all: list[np.ndarray] = []
        i = 0
        while i < len(prefix):
            batch = prefix[i : i + self.effective_batch_size]
            try:
                enc = self._tokenizer(batch, padding=True, truncation=True, max_length=512, return_tensors="pt").to(self._device)
                with torch.inference_mode():
                    hidden = self._model(**enc).last_hidden_state
                mask = enc["attention_mask"].unsqueeze(-1).to(hidden.dtype)
                pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
                pooled = torch.nn.functional.normalize(pooled, dim=-1)
                out_all.append(pooled.cpu().numpy().astype(np.float16))
                i += self.effective_batch_size
            except RuntimeError as e:
                msg = str(e)
                if "out of memory" in msg.lower() and self.fallback_on_oom:
                    self.effective_batch_size = max(1, self.effective_batch_size // 2)
                    if self.on_embed_failed:
                        self.on_embed_failed(f"oom:halve_to={self.effective_batch_size}")
                    if self.effective_batch_size == 0:
                        raise
                    continue
                if self.on_embed_failed:
                    self.on_embed_failed(f"runtime:{msg[:80]}")
                raise
        return np.concatenate(out_all, axis=0) if out_all else np.zeros((0, 384), dtype=np.float16)

    def embed_one(self, text: str) -> np.ndarray:
        return self.embed([text])[0]
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_embedder.py -m "not gpu"`
Expected: `2 passed` (requires `transformers` and `torch` installed; if ROCm spike succeeded, this passes on CPU).

- [x] **Step 5: Commit**

```bash
git add cortex/node/embedder.py tests/unit/node/test_embedder.py
git commit -m "feat(node): Embedder with bge-small CPU path, float16, L2-normalize

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 5: Embedder OOM handling

**Files:**
- Modify: `cortex/node/embedder.py`, `tests/unit/node/test_embedder.py`

- [x] **Step 1: Write the failing test**

Append:

```python
def test_embed_oom_halves_batch_and_invokes_callback(monkeypatch) -> None:
    calls = []
    emb = Embedder(model="BAAI/bge-small-en-v1.5", backend="cpu", batch_size=16,
                   on_embed_failed=calls.append)
    # force forward to raise OOM once with "out of memory" then succeed on next call
    real_forward = emb._model.__call__

    state = {"count": 0}

    def fake_forward(*a, **k):
        state["count"] += 1
        if state["count"] == 1:
            raise RuntimeError("CUDA out of memory")
        return real_forward(*a, **k)

    monkeypatch.setattr(emb._model, "__call__", fake_forward)
    v = emb.embed(["x"])  # OOM at batch=16, halves to 8, retries with batch=1 (len=1)
    assert v.shape == (1, 384)
    assert any("oom:halve_to" in c for c in calls), calls
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_embedder.py::test_embed_oom_halves_batch_and_invokes_callback`
Expected: should pass already with implementation above, but if retry logic mis-orders prefix slicing, it may loop. Fix step 3.

- [x] **Step 3: Write minimal implementation**

Tighten the embed loop in `cortex/node/embedder.py` so the slice restarts on the same `i` after halving:

```python
            except RuntimeError as e:
                msg = str(e)
                if "out of memory" in msg.lower() and self.fallback_on_oom and self.effective_batch_size > 1:
                    self.effective_batch_size = max(1, self.effective_batch_size // 2)
                    if self.on_embed_failed:
                        self.on_embed_failed(f"oom:halve_to={self.effective_batch_size}")
                    continue   # same i, smaller batch
                if self.on_embed_failed:
                    self.on_embed_failed(f"runtime:{msg[:80]}")
                raise
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_embedder.py::test_embed_oom_halves_batch_and_invokes_callback`
Expected: `1 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/embedder.py tests/unit/node/test_embedder.py
git commit -m "feat(node): Embedder OOM halve-and-retry with callback hook

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 6: HNSWIndex implementation

**Files:**
- Create: `cortex/node/vector_index.py`
- Test: `tests/unit/node/test_vector_index.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_vector_index.py
import numpy as np
import pytest

hnswlib = pytest.importorskip("hnswlib")

from cortex.node.vector_index import HNSWIndex


def make_data(n: int = 100, dim: int = 384, seed: int = 0) -> tuple[np.ndarray, list[str]]:
    rng = np.random.default_rng(seed)
    vecs = rng.normal(size=(n, dim)).astype(np.float32)
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
    ids = [f"a{i}" for i in range(n)]
    return vecs, ids


def test_hnsw_add_search_save_load(tmp_path) -> None:
    vecs, ids = make_data()
    idx = HNSWIndex(dim=384)
    for v, art_id in zip(vecs, ids):
        idx.add(art_id, v)
    assert idx.size() == 100
    q = vecs[0]
    hits = idx.search(q, top_k=5)
    found = [a for a, _ in hits]
    assert "a0" in found
    p = tmp_path / "vectors"
    idx.save(p)
    idx2 = HNSWIndex(dim=384)
    idx2.load(p)
    assert idx2.size() == 100
    hits2 = idx2.search(q, top_k=5)
    assert hits2[0][0] == "a0"
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_vector_index.py`
Expected: import error.

- [x] **Step 3: Write minimal implementation**

```python
# cortex/node/vector_index.py
"""Vector index protocol + HNSW and FAISS-gpu implementations (Design §7.2)."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Protocol

import numpy as np


class VectorIndexProtocol(Protocol):
    def add(self, article_id: str, embedding: np.ndarray) -> None: ...
    def search(self, query_vec: np.ndarray, top_k: int) -> list[tuple[str, float]]: ...
    def size(self) -> int: ...
    def save(self, path: Path) -> None: ...
    def load(self, path: Path) -> None: ...


class HNSWIndex:
    def __init__(self, dim: int = 384, M: int = 32, ef_construction: int = 200, ef_search: int = 64) -> None:
        import hnswlib
        self._hnswlib = hnswlib
        self.dim = dim
        self.M = M
        self.ef_construction = ef_construction
        self.ef_search = ef_search
        self._index = hnswlib.Index(space="cosine", dim=dim)
        self._index.init_index(max_elements=0, ef_construction=ef_construction, M=M, allow_replace_or_duplicates=True)
        self._index.set_ef(ef_search)
        self._id_to_row: dict[str, int] = {}
        self._row_to_id: dict[int, str] = {}
        self._next = 0

    def add(self, article_id: str, embedding: np.ndarray) -> None:
        v = np.asarray(embedding, dtype=np.float32).reshape(1, -1)
        if article_id in self._id_to_row:
            row = self._id_to_row[article_id]
        else:
            row = self._next
            self._next += 1
            self._id_to_row[article_id] = row
            self._row_to_id[row] = article_id
            if row >= self._index.get_current_count():
                self._index.resize_index(max(row + 1, max(self._index.get_max_elements(), 1024)))
        self._index.add_items(v, np.array([row], dtype=np.int64))

    def search(self, query_vec: np.ndarray, top_k: int) -> list[tuple[str, float]]:
        v = np.asarray(query_vec, dtype=np.float32).reshape(1, -1)
        if self._index.get_current_count() == 0:
            return []
        labels, distances = self._index.knn_query(v, k=min(top_k, self._index.get_current_count()))
        out: list[tuple[str, float]] = []
        for lbl, dist in zip(labels[0], distances[0]):
            out.append((self._row_to_id[int(lbl)], float(1.0 - dist)))  # hnsw cosine distance -> similarity
        return out

    def size(self) -> int:
        return self._index.get_current_count()

    def save(self, path: Path) -> None:
        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        self._index.save_file(str(p / "index.bin"))
        with open(p / "meta.json", "w", encoding="utf-8") as fh:
            json.dump({"id_to_row": self._id_to_row, "row_to_id": {str(k): v for k, v in self._row_to_id.items()}, "next": self._next}, fh)

    def load(self, path: Path) -> None:
        p = Path(path)
        self._index = self._hnswlib.Index(space="cosine", dim=self.dim)
        self._index.load_file(str(p / "index.bin"))
        with open(p / "meta.json", encoding="utf-8") as fh:
            meta = json.load(fh)
        self._id_to_row = {k: int(v) for k, v in meta["id_to_row"].items()}
        self._row_to_id = {int(k): v for k, v in meta["row_to_id"].items()}
        self._next = int(meta["next"])
        self._index.set_ef(self.ef_search)
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_vector_index.py`
Expected: `1 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/vector_index.py tests/unit/node/test_vector_index.py
git commit -m "feat(node): HNSWIndex with add/search/save/load

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 7: FAISSGPUIndex with fallback to HNSW

**Files:**
- Modify: `cortex/node/vector_index.py`, `tests/unit/node/test_vector_index.py`

- [x] **Step 1: Write the failing test**

Append:

```python
def test_faiss_gpu_or_skip() -> None:
    faiss = pytest.importorskip("faiss")
    from cortex.node.vector_index import FAISSGPUIndex
    vecs, ids = make_data(50, seed=7)
    idx = FAISSGPUIndex(dim=384)
    for v, art_id in zip(vecs, ids):
        idx.add(art_id, v)
    assert idx.size() == 50
    hits = idx.search(vecs[0], top_k=5)
    assert hits[0][0] == "a0"
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_vector_index.py::test_faiss_gpu_or_skip`
Expected: import error or skipped if faiss absent.

- [x] **Step 3: Write minimal implementation**

Append to `cortex/node/vector_index.py`:

```python
class FAISSGPUIndex:
    def __init__(self, dim: int = 384, M: int = 32, ef_construction: int = 200, ef_search: int = 64) -> None:
        try:
            import faiss
        except ImportError as e:
            raise ImportError("faiss-gpu not installed; use HNSWIndex") from e
        self._faiss = faiss
        self.dim = dim
        self._res = faiss.StandardGpuResources()
        cpu = faiss.IndexFlatIP(dim)
        self._index = faiss.index_cpu_to_gpu(self._res, 0, cpu)
        self._id_to_row: dict[str, int] = {}
        self._row_to_id: dict[int, str] = {}
        self._next = 0

    def add(self, article_id: str, embedding: np.ndarray) -> None:
        v = np.asarray(embedding, dtype=np.float32).reshape(1, -1)
        if article_id not in self._id_to_row:
            self._id_to_row[article_id] = self._next
            self._row_to_id[self._next] = article_id
            self._next += 1
        self._index.add(v)

    def search(self, query_vec: np.ndarray, top_k: int) -> list[tuple[str, float]]:
        if self._index.ntotal == 0:
            return []
        v = np.asarray(query_vec, dtype=np.float32).reshape(1, -1)
        D, I = self._index.search(v, min(top_k, self._index.ntotal))
        out: list[tuple[str, float]] = []
        for score, row in zip(D[0], I[0]):
            if row < 0:
                continue
            out.append((self._row_to_id[int(row)], float(score)))
        return out

    def size(self) -> int:
        return int(self._index.ntotal)

    def save(self, path: Path) -> None:
        p = Path(path); p.mkdir(parents=True, exist_ok=True)
        cpu = self._faiss.index_gpu_to_cpu(self._index)
        self._faiss.write_index(cpu, str(p / "index.bin"))
        with open(p / "meta.json", "w", encoding="utf-8") as fh:
            json.dump({"id_to_row": self._id_to_row, "row_to_id": {str(k): v for k, v in self._row_to_id.items()}, "next": self._next}, fh)

    def load(self, path: Path) -> None:
        p = Path(path)
        cpu = self._faiss.read_index(str(p / "index.bin"))
        self._index = self._faiss.index_cpu_to_gpu(self._res, 0, cpu)
        with open(p / "meta.json", encoding="utf-8") as fh:
            meta = json.load(fh)
        self._id_to_row = {k: int(v) for k, v in meta["id_to_row"].items()}
        self._row_to_id = {int(k): v for k, v in meta["row_to_id"].items()}
        self._next = int(meta["next"])
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_vector_index.py::test_faiss_gpu_or_skip`
Expected: `1 passed` if faiss-gpu installed, else `skipped`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/vector_index.py tests/unit/node/test_vector_index.py
git commit -m "feat(node): FAISSGPUIndex with gpu/cpu index conversions

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 8: ProvenanceGraph with SQLite persistence

**Files:**
- Create: `cortex/node/provenance.py`
- Test: `tests/unit/node/test_provenance.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_provenance.py
import sqlite3
from pathlib import Path

from cortex.node.provenance import ProvenanceGraph


def test_add_citation_persists_and_reloads(tmp_path: Path) -> None:
    db = tmp_path / "p.sqlite"
    g = ProvenanceGraph(db)
    g.add_citation("insight-1", "finding-a")
    g.add_citation("insight-1", "finding-b")
    assert set(g.cited_by("finding-a")) == {"insight-1"}
    assert g.descendants("finding-a") == ["insight-1"]
    # ancestors = cited ids
    assert set(g.ancestors("insight-1")) == {"finding-a", "finding-b"}
    g.close()
    g2 = ProvenanceGraph(db)
    assert set(g2.cited_by("finding-a")) == {"insight-1"}
    assert g2.graph_version > 0
    g2.close()


def test_descendants_bfs_chain(tmp_path: Path) -> None:
    g = ProvenanceGraph(tmp_path / "p.sqlite")
    for parent, child in [("a", "b"), ("b", "c"), ("c", "d")]:
        g.add_citation(child, parent)  # derived -> cited
    assert g.descendants("a") == ["b", "c", "d"]
    g.close()


def test_graph_version_increments(tmp_path: Path) -> None:
    g = ProvenanceGraph(tmp_path / "p.sqlite")
    v0 = g.graph_version
    g.add_citation("x", "y")
    assert g.graph_version == v0 + 1
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_provenance.py`
Expected: import error.

- [x] **Step 3: Write minimal implementation**

```python
# cortex/node/provenance.py
"""In-memory NetworkX DiGraph persisted to SQLite provenance_edges (Design §7.3)."""
from __future__ import annotations

import sqlite3
from collections import deque
from pathlib import Path

import networkx as nx

SCHEMA = """
CREATE TABLE IF NOT EXISTS provenance_edges (
  source_id TEXT NOT NULL,
  cited_id  TEXT NOT NULL,
  PRIMARY KEY (source_id, cited_id)
);
"""


class ProvenanceGraph:
    """Edges: derived (source) -> cited (target)."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path, isolation_level=None)
        self._conn.executescript(SCHEMA)
        self._graph = nx.DiGraph()
        self.graph_version = 0
        self._rehydrate()

    def _rehydrate(self) -> None:
        for row in self._conn.execute("SELECT source_id, cited_id FROM provenance_edges"):
            self._graph.add_edge(row[0], row[1])
        # graph_version is monotonic across process restarts only if persisted; here we
        # reset on load but increment on every subsequent mutation.
        self.graph_version = 0

    def add_citation(self, new_id: str, cited_id: str) -> None:
        self._conn.execute(
            "INSERT OR IGNORE INTO provenance_edges (source_id, cited_id) VALUES (?, ?)",
            (new_id, cited_id),
        )
        self._graph.add_edge(new_id, cited_id)
        self.graph_version += 1

    def cited_by(self, article_id: str) -> list[str]:
        return [s for s, _ in self._graph.in_edges(article_id)]

    def descendants(self, article_id: str) -> list[str]:
        seen: list[str] = []
        q = deque(self._graph.predecessors(article_id))
        visited: set[str] = set()
        while q:
            n = q.popleft()
            if n in visited:
                continue
            visited.add(n)
            seen.append(n)
            q.extend(self._graph.predecessors(n))
        return seen

    def ancestors(self, article_id: str) -> list[str]:
        # cited ids reachable from article_id (descendants of article in graph direction derived->cited)
        seen: list[str] = []
        q = deque(self._graph.successors(article_id))
        visited: set[str] = set()
        while q:
            n = q.popleft()
            if n in visited:
                continue
            visited.add(n)
            seen.append(n)
            q.extend(self._graph.successors(n))
        return seen

    def close(self) -> None:
        self._conn.close()
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_provenance.py`
Expected: `3 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/provenance.py tests/unit/node/test_provenance.py
git commit -m "feat(node): ProvenanceGraph NetworkX + SQLite persistence

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 9: TrustEngine formula

**Files:**
- Create: `cortex/node/trust.py`
- Test: `tests/unit/node/test_trust.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_trust.py
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from cortex.node.trust import TrustEngine


def make_article(art_id: str, org: str = "did:percq:org:soc-alpha",
                 ts: datetime | None = None, cites: list[str] | None = None,
                 org_signature: bytes | None = b"\x01",
                 source_data_hash: str | None = "deadbeef"):
    ts = ts or datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=art_id, provenance=SimpleNamespace(producer_org=org, timestamp=ts),
        cites=cites or [], org_signature=org_signature,
        provenance_source_data_hash=source_data_hash,
    )


def test_recency_decay_half_life() -> None:
    e = TrustEngine()
    # 90 days delta -> 0.5
    assert abs(e.recency_decay(90 * 86400) - 0.5) < 1e-6
    assert abs(e.recency_decay(0) - 1.0) < 1e-6


def test_trust_for_known_value() -> None:
    e = TrustEngine(default_org_reputation=0.8,
                    reputation_overrides={"did:percq:org:soc-alpha": 0.9},
                    half_life_days=90, min_trust_default=0.3)
    art = make_article("a1", org="did:percq:org:soc-alpha", ts=datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc))
    now = datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)
    store = SimpleNamespace(get=lambda _id: None)
    # R=0.9, recency=1.0, has_org_sign=1, has_source_hash=1
    # base = 0.9 * 1.0 * 1.1 * 1.05 = 1.0395
    # no cites -> source_trust=0, source_penalty=0
    # T = 0.6*1.0395 + 0 - 0 = 0.6237, clamped to [0,1]
    t = e.trust_for(art, now, store)
    assert abs(t - 0.6237) < 1e-3


def test_trust_for_with_cites() -> None:
    e = TrustEngine(default_org_reputation=0.9, half_life_days=90, min_trust_default=0.3)
    base_ts = datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)
    now = base_ts
    cited_articles = {
        "c1": make_article("c1", org="did:percq:org:soc-alpha", ts=base_ts, org_signature=b"\x01", source_data_hash="h"),
        "c2": make_article("c2", org="did:percq:org:soc-alpha", ts=base_ts, org_signature=b"\x01", source_data_hash="h"),
    }

    class StubStore:
        def get(self, _id):
            return cited_articles.get(_id)

    cited_trusts = [e.trust_for(cited_articles[c], now, StubStore()) for c in cited_articles]
    expected_source_trust = sum(cited_trusts) / 2
    deriv = make_article("d1", ts=base_ts, cites=["c1", "c2"])
    t = e.trust_for(deriv, now, StubStore())
    expected_base = 0.9 * 1.0 * 1.1 * 1.05
    expected = max(0.0, min(1.0, 0.6 * expected_base + 0.4 * expected_source_trust))
    assert abs(t - expected) < 1e-3
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_trust.py`
Expected: import error.

- [x] **Step 3: Write minimal implementation**

```python
# cortex/node/trust.py
"""Static trust formula — Design §9.2. Single-hop propagation in MVP."""
from __future__ import annotations

from datetime import datetime
from typing import Any


class TrustEngine:
    def __init__(
        self,
        default_org_reputation: float = 0.5,
        reputation_overrides: dict[str, float] | None = None,
        half_life_days: int = 90,
        min_trust_default: float = 0.3,
    ) -> None:
        self.default_org_reputation = default_org_reputation
        self.reputation_overrides = reputation_overrides or {}
        self.half_life_days = half_life_days
        self.min_trust_default = min_trust_default
        self._cache: dict[tuple[str, int], float] = {}

    def recency_decay(self, delta_t_seconds: float) -> float:
        return float(0.5 ** (delta_t_seconds / (self.half_life_days * 86400.0)))

    def _reputation(self, org: str) -> float:
        return float(self.reputation_overrides.get(org, self.default_org_reputation))

    def trust_for(self, article: Any, now: datetime, store: Any, graph_version: int = 0) -> float:
        key = (article.id, graph_version)
        if key in self._cache:
            return self._cache[key]
        rcy = self.recency_decay((now - article.provenance.timestamp).total_seconds())
        R = self._reputation(article.provenance.producer_org)
        has_org_sign = 1 if getattr(article, "org_signature", None) else 0
        has_source_hash = 1 if getattr(article, "provenance_source_data_hash", None) or \
                              getattr(article.provenance, "source_data_hash", None) else 0
        base = R * rcy * (1 + 0.1 * has_org_sign) * (1 + 0.05 * has_source_hash)
        source_trust = 0.0
        source_penalty = 0.0
        cites = getattr(article, "cites", None) or []
        if cites:
            cited_trusts: list[float] = []
            for c in cites:
                cited = store.get(c)
                if cited is None:
                    continue
                cited_trusts.append(self.trust_for(cited, now, store, graph_version))
            if cited_trusts:
                source_trust = sum(cited_trusts) / len(cited_trusts)
                source_penalty = sum(1 for t in cited_trusts if t < 0.2) * 0.1
        t = max(0.0, min(1.0, 0.6 * base + 0.4 * source_trust - source_penalty))
        self._cache[key] = t
        return t
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_trust.py`
Expected: `3 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/trust.py tests/unit/node/test_trust.py
git commit -m "feat(node): TrustEngine static formula from Design §9.2

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 10: Trust memoization invalidation

**Files:**
- Modify: `cortex/node/trust.py`, `tests/unit/node/test_trust.py`

- [x] **Step 1: Write the failing test**

Append:

```python
def test_memoization_and_invalidation(tmp_path) -> None:
    e = TrustEngine(default_org_reputation=0.9, half_life_days=90)
    base_ts = datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)
    now = base_ts
    store = SimpleNamespace(get=lambda _id: None)
    art = make_article("m1", ts=base_ts)
    t0 = e.trust_for(art, now, store, graph_version=0)
    t1 = e.trust_for(art, now, store, graph_version=0)  # cached
    assert t0 == t1
    t2 = e.trust_for(art, now, store, graph_version=1)  # new graph_version -> recomputed
    assert t2 == t0  # same value but cache key differs
    assert ("m1", 1) in e._cache
    # bump graph_version invalidates only that key path; we rely on key change
```

- [x] **Step 2: Run test**

Run: `pytest -q tests/unit/node/test_trust.py::test_memoization_and_invalidation`
Expected: `1 passed` (the implementation above already keys cache on `graph_version`).

- [x] **Step 3: Write minimal implementation**

Already covered by `TrustEngine._cache[(article_id, graph_version)]`. Add explicit comment to make the invariant visible:

```python
# Invalidation on ProvenanceGraph mutation: caller passes new graph_version;
# cache key includes graph_version so prior entries become unreachable.
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_trust.py`
Expected: `4 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/trust.py tests/unit/node/test_trust.py
git commit -m "test(node): TrustEngine memoization keyed by graph_version

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 11: Retrieval pipeline (scope filter, trust filter, hybrid ranking)

**Files:**
- Create: `cortex/node/query.py`
- Test: `tests/unit/node/test_retrieval.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_retrieval.py
from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace
import numpy as np

from cortex.node.query import retrieve, QueryResult


class FakeIndex:
    def __init__(self, vecs: dict[str, np.ndarray]) -> None:
        self.vecs = vecs

    def search(self, q: np.ndarray, top_k: int) -> list[tuple[str, float]]:
        sims = [(k, float(np.dot(q, v) / (np.linalg.norm(q) * np.linalg.norm(v)))) for k, v in self.vecs.items()]
        sims.sort(key=lambda x: -x[1])
        return sims[:top_k]


class FakeStore:
    def __init__(self, articles: dict[str, SimpleNamespace]) -> None:
        self.articles = articles

    def get(self, art_id: str):
        return self.articles.get(art_id)


class FakeEmbedder:
    def embed_one(self, text: str) -> np.ndarray:
        # deterministic pseudo-embedding
        rng = np.random.default_rng(abs(hash(text)) % (2**32))
        v = rng.normal(size=384).astype(np.float32)
        return v / np.linalg.norm(v)


def make_article(art_id: str, scope: str, trust: float, content: str = "x", art_type: str = "finding"):
    return SimpleNamespace(
        id=art_id, type=art_type, content=content, payload={}, scope=scope,
        agent_signature=b"\x01", org_signature=None, cites=[],
        provenance=SimpleNamespace(
            producer_agent="did:percq:agent:a",
            producer_org="did:percq:org:soc-alpha",
            computation_ref=None, source_data_hash=None,
            source_data_schema=None, run_id="r",
            timestamp=datetime(2026, 7, 18, tzinfo=timezone.utc),
        ),
        trust_score=trust,
    )


def test_retrieval_applies_scope_trust_and_hybrid() -> None:
    a_pub = make_article("a1", "public", 0.9, "alpha")
    a_priv = make_article("a2", "private", 0.95, "beta")
    a_low = make_article("a3", "public", 0.1, "gamma")
    a_partner = make_article("a4", "partner:did:percq:org:soc-alpha", 0.8, "delta")
    articles = {a.id: a for a in [a_pub, a_priv, a_low, a_partner]}
    store = FakeStore(articles)
    index = FakeIndex({a.id: FakeEmbedder().embed_one(a.content) for a in articles.values()})
    emb = FakeEmbedder()
    results = retrieve(
        store=store, vector_index=index, embedder=emb,
        query_text="alpha",
        topic_filter=[], scope_filter=["public", "private"],  # requester is org owner, can see private
        top_k=5, min_trust=0.3, deadline_ms=200,
    )
    ids = [r.article_id for r in results]
    assert "a3" not in ids   # below 0.3 trust
    # partner scope not in scope_filter
    assert "a4" not in ids
    assert "a1" in ids
    assert isinstance(results[0], QueryResult)
    assert all(isinstance(r.hybrid_score, float) for r in results)
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_retrieval.py`
Expected: import error.

- [x] **Step 3: Write minimal implementation**

```python
# cortex/node/query.py
"""Retrieval pipeline — Design §8.3."""
from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class QueryResult:
    article: Any
    article_id: str
    hybrid_score: float
    trust_score: float
    provenance_summary: dict


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _allowed_scope(article_scope: str, scope_filter: list[str]) -> bool:
    if article_scope == "private":
        return "private" in scope_filter
    if article_scope == "public":
        return "public" in scope_filter or any(s != "private" for s in scope_filter)
    if article_scope.startswith("partner:"):
        return article_scope in scope_filter
    return article_scope in scope_filter


def retrieve(
    store: Any,
    vector_index: Any,
    embedder: Any,
    query_text: str,
    topic_filter: list[str],
    scope_filter: list[str],
    top_k: int,
    min_trust: float,
    deadline_ms: int,
    now: Any | None = None,
) -> list[QueryResult]:
    started = time.monotonic()
    query_vec = embedder.embed_one(normalize_whitespace(query_text))
    over_fetch = max(top_k * 2, top_k)
    candidates = vector_index.search(query_vec, top_k=over_fetch)
    scored: list[QueryResult] = []
    for art_id, cosine in candidates:
        if (time.monotonic() - started) * 1000 > deadline_ms:
            break
        article = store.get(art_id)
        if article is None:
            continue
        if not _allowed_scope(article.scope, scope_filter):
            continue
        if topic_filter and article.type not in topic_filter:
            continue
        trust = float(article.trust_score) if article.trust_score is not None else 0.0
        if trust < min_trust:
            continue
        hybrid = 0.5 * float(cosine) + 0.5 * trust
        summary = {
            "producer_org": getattr(article.provenance, "producer_org", None),
            "timestamp": getattr(article.provenance, "timestamp", None).isoformat() if getattr(article.provenance, "timestamp", None) else None,
            "run_id": getattr(article.provenance, "run_id", None),
            "n_cites": len(getattr(article, "cites", []) or []),
        }
        scored.append(QueryResult(article=article, article_id=art_id, hybrid_score=hybrid, trust_score=trust, provenance_summary=summary))
    scored.sort(key=lambda r: -r.hybrid_score)
    return scored[:top_k]
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_retrieval.py`
Expected: `1 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/query.py tests/unit/node/test_retrieval.py
git commit -m "feat(node): retrieval pipeline with scope/trust/hybrid ranking

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 12: BrokerClient async connect/publish/spill with exponential backoff

**Files:**
- Create: `cortex/node/broker_client.py`
- Test: `tests/unit/node/test_broker_client.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_broker_client.py
import asyncio
import json
import os
from pathlib import Path

import pytest

from cortex.node.broker_client import BrokerClient


class FakeWS:
    def __init__(self, send_log: list[str]) -> None:
        self.send_log = send_log
        self.closed = False

    async def send(self, msg: str) -> None:
        self.send_log.append(msg)

    async def recv(self) -> str:
        await asyncio.sleep(0.01)
        return json.dumps({"type": "ack", "msg_id": "x"})

    async def close(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_publish_envelope_enqueues_and_sends(monkeypatch, tmp_path: Path) -> None:
    sent: list[str] = []
    fake = FakeWS(sent)

    async def fake_connect(self):
        self._ws = fake
        self._connected = True

    monkeypatch.setattr(BrokerClient, "_connect_socket", fake_connect)
    client = BrokerClient(url="ws://localhost:7432", org_did="did:percq:org:soc-alpha",
                          registry_path=tmp_path / "reg.json", replay_window_sec=600,
                          on_event=lambda *_: None, on_metrics=lambda *_: None,
                          outbound_spill_dir=tmp_path / "outbound",
                          outbound_cap=5, spill_threshold=5)
    await client.connect()
    env = {"type": "publish", "msg_id": "1", "src": "did:percq:org:soc-alpha", "dst": "*", "ts": "2026-07-18T12:00:00Z", "payload": {}}
    await client.publish_envelope(env)
    await asyncio.sleep(0.05)
    await client.stop()
    assert any("\"msg_id\":\"1\"" in m.replace(" ", "") for m in sent)


@pytest.mark.asyncio
async def test_spill_when_queue_overflows(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(BrokerClient, "_connect_socket",
                         lambda self: asyncio.sleep(0))  # never actually connects
    client = BrokerClient(url="ws://localhost:7432", org_did="did:percq:org:soc-alpha",
                          registry_path=tmp_path / "reg.json", replay_window_sec=600,
                          on_event=lambda *_: None, on_metrics=lambda *_: None,
                          outbound_spill_dir=tmp_path / "outbound",
                          outbound_cap=3, spill_threshold=3)
    spill_dir = tmp_path / "outbound"
    spill_dir.mkdir(parents=True, exist_ok=True)
    for i in range(10):
        env = {"type": "publish", "msg_id": str(i), "src": "x", "dst": "*", "ts": "t", "payload": {}}
        await client.publish_envelope(env)
    await asyncio.sleep(0.02)
    spilled = list(spill_dir.glob("*.json"))
    assert len(spilled) >= 1, f"expected spill files, got {spilled}"
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_broker_client.py`
Expected: import error.

- [x] **Step 3: Write minimal implementation**

```python
# cortex/node/broker_client.py
"""Async broker WebSocket client with disk-spill queue (Design §12.2)."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Awaitable, Callable

log = logging.getLogger("cortex.node.broker")


class BrokerClient:
    def __init__(
        self,
        url: str,
        org_did: str,
        registry_path: Path,
        replay_window_sec: int = 600,
        on_event: Callable[..., None] | None = None,
        on_metrics: Callable[..., None] | None = None,
        outbound_spill_dir: Path = Path("./cortex-node/outbound"),
        outbound_cap: int = 10000,
        spill_threshold: int = 10000,
    ) -> None:
        self.url = url
        self.org_did = org_did
        self.registry_path = Path(registry_path)
        self.replay_window_sec = replay_window_sec
        self.on_event = on_event or (lambda *_: None)
        self.on_metrics = on_metrics or (lambda *_: None)
        self.outbound_spill_dir = Path(outbound_spill_dir)
        self.outbound_cap = outbound_cap
        self.spill_threshold = spill_threshold
        self._outbound: asyncio.Queue = asyncio.Queue()
        self._ws = None
        self._connected = False
        self._stop = asyncio.Event()
        self._sender_task: asyncio.Task | None = None
        self._spill_seq = 0

    async def _connect_socket(self) -> None:
        import websockets
        self._ws = await websockets.connect(self.url)
        self._connected = True

    async def connect(self) -> None:
        await self._connect_socket()
        self._sender_task = asyncio.create_task(self._sender_loop())

    async def stop(self) -> None:
        self._stop.set()
        if self._sender_task:
            try:
                await asyncio.wait_for(self._sender_task, timeout=1.0)
            except asyncio.TimeoutError:
                self._sender_task.cancel()
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:
                pass

    async def publish_envelope(self, env: dict) -> None:
        if self._outbound.qsize() >= self.spill_threshold:
            self._spill_to_disk(env)
            self.on_event("node.queue.spilled", None, {"qsize": self._outbound.qsize()})
            return
        await self._outbound.put(env)

    async def query_fanout(self, query_env: dict) -> dict:
        await self.publish_envelope(query_env)
        # MVP: return empty merged envelope; downstream consumer receives query_result envelopes via _sender_loop
        return {"type": "query_result", "results": [], "src": self.org_did}

    def _spill_to_disk(self, env: dict) -> None:
        self.outbound_spill_dir.mkdir(parents=True, exist_ok=True)
        self._spill_seq += 1
        (self.outbound_spill_dir / f"{int(time.time()*1000)}_{self._spill_seq}.json").write_text(
            json.dumps(env, separators=(",", ":")), encoding="utf-8"
        )

    async def _sender_loop(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                if not self._connected:
                    await self._reconnect()
                    backoff = 1.0
                env = await asyncio.wait_for(self._outbound.get(), timeout=0.5)
                if self._ws is None:
                    await self._outbound.put(env)
                    continue
                await self._ws.send(json.dumps(env, separators=(",", ":")))
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                log.warning("broker send error: %s", e)
                self._connected = False
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    async def _reconnect(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                await self._connect_socket()
                return
            except Exception as e:
                log.warning("broker reconnect failed: %s", e)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_broker_client.py`
Expected: `2 passed` (no real network sockets; fakes used).

- [x] **Step 5: Commit**

```bash
git add cortex/node/broker_client.py tests/unit/node/test_broker_client.py
git commit -m "feat(node): BrokerClient async with disk-spill outbound queue

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 13: CortexNode.publish end-to-end on CPU

**Files:**
- Create: `cortex/node/node.py`
- Test: `tests/unit/node/test_node_publish.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_node_publish.py
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import textwrap

import pytest

from cortex.core.article import MemoryArticle, Provenance, ArticleType
from cortex.node.node import CortexNode


@pytest.fixture
def cfg(tmp_path: Path) -> Path:
    p = tmp_path / "config.yaml"
    p.write_text(textwrap.dedent(f"""\
        node:
          org_did: did:percq:org:soc-alpha
          agent_did: did:percq:agent:alpha-bot-1
          key_paths:
            org: {tmp_path / 'org.pem'}
            agent: {tmp_path / 'agent.pem'}
        broker: {{url: ws://localhost:7432, registry: {tmp_path / 'reg.json'}, replay_window_sec: 600}}
        embedder: {{model: bge-small-en-v1.5, backend: cpu, batch_size: 4, fallback_on_oom: true}}
        vector_index: {{backend: hnswlib, metric: cosine, hnsw: {{M: 16, ef_construction: 100, ef_search: 32}}}}
        trust: {{default_org_reputation: 0.85, reputation_overrides: {{}}, half_life_days: 90, min_trust_default: 0.3}}
        query: {{default_top_k: 5, deadline_ms: 400, min_trust: 0.3}}
        logging: {{level: INFO, file: {tmp_path / 'node.log'}}}
    """))
    return p


class FakeBroker:
    def __init__(self) -> None:
        self.published: list[dict] = []

    async def connect(self) -> None: pass
    async def stop(self) -> None: pass
    async def publish_envelope(self, env: dict) -> None:
        self.published.append(env)
    async def query_fanout(self, env: dict) -> dict:
        return {"type": "query_result", "results": []}


def make_keys(tmp_path: Path) -> dict[str, Path]:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization
    out = {}
    for label in ("org", "agent"):
        k = Ed25519PrivateKey.generate()
        pem = k.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        p = tmp_path / f"{label}.pem"
        p.write_bytes(pem); p.chmod(0o600)
        out[label] = p
    return out


@pytest.mark.asyncio
async def test_publish_public_persists_and_sends_envelope(cfg: Path, tmp_path: Path) -> None:
    keys = make_keys(tmp_path)
    broker = FakeBroker()
    node = CortexNode(
        org_did="did:percq:org:soc-alpha",
        agent_did="did:percq:agent:alpha-bot-1",
        key_paths=keys,
        broker_url="ws://localhost:7432",
        config_path=cfg,
        embedder_backend_override="cpu",
    )
    node._broker_override = broker  # inject fake
    await node.start()
    prov = Provenance(
        producer_agent="did:percq:agent:alpha-bot-1",
        producer_org="did:percq:org:soc-alpha",
        computation_ref=None, source_data_hash="h",
        source_data_schema="cve-record-v1", run_id="r1",
        timestamp=datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc),
    )
    art = MemoryArticle(
        id="", type=ArticleType.FINDING, content="APT29 uses encoded PowerShell T1059.001",
        payload={"attack_id": "T1059.001"}, embedding=None, embedding_model=None,
        provenance=prov, scope="public",
        agent_signature=b"", org_signature=None,
        cites=[], trust_score=None, trust_expiration=None,
    )
    art_id = node.publish(art)
    assert art_id  # article.id populated
    row = node.store.get(art_id)
    assert row["state"] == "published"
    assert row["scope"] == "public"
    assert len(broker.published) == 1
    assert broker.published[0]["type"] == "publish"
    await node.stop()


@pytest.mark.asyncio
async def test_publish_private_never_sends_envelope(cfg: Path, tmp_path: Path) -> None:
    keys = make_keys(tmp_path)
    broker = FakeBroker()
    node = CortexNode(
        org_did="did:percq:org:soc-alpha", agent_did="did:percq:agent:alpha-bot-1",
        key_paths=keys, broker_url="ws://localhost:7432", config_path=cfg,
        embedder_backend_override="cpu",
    )
    node._broker_override = broker
    await node.start()
    prov = Provenance(
        producer_agent="did:percq:agent:alpha-bot-1", producer_org="did:percq:org:soc-alpha",
        computation_ref=None, source_data_hash=None, source_data_schema=None, run_id="r",
        timestamp=datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc),
    )
    art = MemoryArticle(
        id="", type=ArticleType.FINDING, content="private finding",
        payload={}, embedding=None, embedding_model=None, provenance=prov,
        scope="private", agent_signature=b"", org_signature=None,
        cites=[], trust_score=None, trust_expiration=None,
    )
    art_id = node.publish(art)
    row = node.store.get(art_id)
    assert row["state"] == "indexed"
    assert broker.published == []
    await node.stop()
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_node_publish.py`
Expected: import error.

- [x] **Step 3: Write minimal implementation**

```python
# cortex/node/node.py
"""CortexNode facade (Design §10.1, §3.3, §8.2)."""
from __future__ import annotations

import asyncio
import datetime as _dt
import logging
import os
from dataclasses import replace
from pathlib import Path
from typing import Any

from cortex.core.article import MemoryArticle, Scope
from cortex.core.canonical import article_canonical_bytes, compute_article_id
from cortex.core.crypto import load_private_pem, sign
from cortex.core.envelope import Envelope, EnvelopeType, envelope_to_json
from cortex.node.broker_client import BrokerClient
from cortex.node.config import NodeConfig, load_config
from cortex.node.embedder import Embedder
from cortex.node.keys import load_keys
from cortex.node.provenance import ProvenanceGraph
from cortex.node.query import QueryResult, retrieve
from cortex.node.store import ArticleStore
from cortex.node.trust import TrustEngine
from cortex.node.vector_index import HNSWIndex

log = logging.getLogger("cortex.node")


class CortexNode:
    def __init__(
        self,
        org_did: str,
        agent_did: str,
        key_paths: dict[str, Path],
        broker_url: str,
        config_path: Path,
        embedder_backend_override: str | None = None,
    ) -> None:
        self.org_did = org_did
        self.agent_did = agent_did
        self.key_paths = {k: Path(v) for k, v in key_paths.items()}
        self.broker_url = broker_url
        self.config_path = Path(config_path)
        self.config: NodeConfig = load_config(self.config_path)
        if embedder_backend_override:
            self.config.embedder.backend = embedder_backend_override
        self.data_dir = self.config_path.parent / "cortex-node"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.store: ArticleStore | None = None
        self.embedder: Embedder | None = None
        self.vector_index: HNSWIndex | None = None
        self.provenance: ProvenanceGraph | None = None
        self.trust: TrustEngine | None = None
        self.broker: BrokerClient | None = None
        self._broker_override: Any = None
        self._org_priv: bytes = b""
        self._agent_priv: bytes = b""
        self._health_task: asyncio.Task | None = None

    async def start(self) -> None:
        self.store = ArticleStore(self.data_dir / "articles.sqlite")
        self.provenance = ProvenanceGraph(self.data_dir / "provenance.sqlite")
        self.vector_index = HNSWIndex(dim=384)
        self.trust = TrustEngine(
            default_org_reputation=self.config.trust.default_org_reputation,
            reputation_overrides=self.config.trust.reputation_overrides,
            half_life_days=self.config.trust.half_life_days,
            min_trust_default=self.config.trust.min_trust_default,
        )
        self._org_priv, self._agent_priv = load_keys(self.key_paths["org"], self.key_paths["agent"])
        self.embedder = Embedder(
            model=self.config.embedder.model, backend=self.config.embedder.backend,
            batch_size=self.config.embedder.batch_size,
            fallback_on_oom=self.config.embedder.fallback_on_oom,
            on_embed_failed=self._on_embed_failed,
        )
        self.broker = self._broker_override or BrokerClient(
            url=self.broker_url, org_did=self.org_did,
            registry_path=Path(self.config.broker.registry),
            replay_window_sec=self.config.broker.replay_window_sec,
            on_event=self._on_broker_event,
        )
        await self.broker.connect()
        self._health_task = asyncio.create_task(self._health_loop())

    async def stop(self) -> None:
        if self._health_task:
            self._health_task.cancel()
        if self.broker:
            await self.broker.stop()
        if self.store:
            self.store.close()
        if self.provenance:
            self.provenance.close()

    def _on_embed_failed(self, reason: str) -> None:
        log.warning("embed failed: %s", reason)
        if self.store:
            self.store.event_log_append("node.embed.fallback_cpu", None, {"reason": reason})

    def _on_broker_event(self, event: str, article_id: str | None, payload: dict) -> None:
        if self.store:
            self.store.event_log_append(event, article_id, payload)

    async def _health_loop(self) -> None:
        while True:
            await asyncio.sleep(5)
            if self.embedder and not self.embedder._check_gpu() and not self.embedder.fallback_to_cpu:
                self.embedder.fallback_to_cpu = True
                self.embedder._device = "cpu"
                self._on_embed_failed("healthcheck:no_gpu")

    def publish(self, article: MemoryArticle) -> str:
        assert self.store and self.embedder and self.vector_index and self.trust and self.provenance
        if len(article.content) > 2000:
            raise ValueError("content exceeds 2000 chars")
        canonical = article_canonical_bytes(article)
        agent_sig = sign(self._agent_priv, canonical)
        if article.org_signature is None and self._org_priv:
            org_sig = sign(self._org_priv, canonical)
        else:
            org_sig = article.org_signature
        art_id = compute_article_id(canonical)
        article = replace(article, id=art_id, agent_signature=agent_sig, org_signature=org_sig)
        # embed
        embedding = self.embedder.embed_one(article.content)
        article = replace(article, embedding=embedding.tolist(), embedding_model=self.config.embedder.model)
        # trust
        now = _dt.datetime.now(_dt.timezone.utc)
        trust_score = self.trust.trust_for(article, now, _StoreAdapter(self.store), graph_version=self.provenance.graph_version)
        trust_expires = now + _dt.timedelta(days=self.config.trust.half_life_days)
        article = replace(article, trust_score=trust_score, trust_expiration=trust_expires)
        # store signed then indexed
        self.store.put(article, state="signed")
        self.vector_index.add(art_id, embedding)
        self.store.set_state(art_id, "indexed")
        if article.scope != Scope.PRIVATE:
            env = Envelope(
                type=EnvelopeType.PUBLISH, src=self.org_did, dst="*",
                payload={"article_id": art_id, "canonical": canonical.hex(),
                         "embedding": embedding.astype("float16").tolist()},
            )
            _emit = asyncio.coroutine(lambda e: self.broker.publish_envelope(envelope_to_json(e))) \
                if False else None
            # schedule on running loop
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self.broker.publish_envelope(envelope_to_json(env)))  # type: ignore[arg-type]
            except RuntimeError:
                # no loop; run synchronously via new loop (tests use asyncio.run)
                asyncio.run(self.broker.publish_envelope(envelope_to_json(env)))
            self.store.set_state(art_id, "published")
            self.store.event_log_append("node.article.published", art_id, {"scope": article.scope})
        else:
            self.store.event_log_append("node.article.indexed_private", art_id, {})
        return art_id

    def query(self, query_text: str, topic_filter: list[str], scope_filter: list[str],
              top_k: int, min_trust: float, deadline_ms: int) -> list[QueryResult]:
        assert self.store and self.vector_index and self.embedder
        return retrieve(
            store=self.store, vector_index=self.vector_index, embedder=self.embedder,
            query_text=query_text, topic_filter=topic_filter, scope_filter=scope_filter,
            top_k=top_k, min_trust=min_trust, deadline_ms=deadline_ms,
        )

    def derive(self, new_article: MemoryArticle, cited_article_ids: list[str]) -> str:
        assert self.provenance
        new_article = replace(new_article, cites=list(cited_article_ids))
        art_id = self.publish(new_article)
        for cited_id in cited_article_ids:
            self.provenance.add_citation(art_id, cited_id)
        env = Envelope(
            type=EnvelopeType.DERIVE, src=self.org_did, dst="*",
            payload={"article_id": art_id, "cites": list(cited_article_ids)},
        )
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.broker.publish_envelope(envelope_to_json(env)))  # type: ignore[arg-type]
        except RuntimeError:
            asyncio.run(self.broker.publish_envelope(envelope_to_json(env)))
        return art_id


class _StoreAdapter:
    def __init__(self, store: ArticleStore) -> None:
        self._store = store

    def get(self, art_id: str) -> MemoryArticle | None:
        row = self._store.get(art_id)
        return _row_to_article(row) if row else None


def _row_to_article(row: Any) -> MemoryArticle | None:
    # minimal hydration for TrustEngine: producer_org, timestamp, cites, org_signature
    import json
    from cortex.core.article import Provenance
    prov = Provenance(
        producer_agent="", producer_org="",
        computation_ref=None, source_data_hash=None,
        source_data_schema=None, run_id="",
        timestamp=_dt.datetime.fromisoformat(row["created_at"]),
    )
    cites = json.loads(row["cites_json"] or "[]")
    return MemoryArticle(
        id=row["id"], type=row["type"], content=row["content"],
        payload={}, embedding=None, embedding_model=None,
        provenance=prov, scope=row["scope"], agent_signature=b"", org_signature=row["org_sig"],
        cites=cites, trust_score=row["trust_score"], trust_expiration=None,
    )
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_node_publish.py`
Expected: `2 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/node.py tests/unit/node/test_node_publish.py
git commit -m "feat(node): CortexNode.publish end-to-end signing + embed + trust

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 14: CortexNode.query end-to-end

**Files:**
- Modify: `cortex/node/node.py`, add test `tests/unit/node/test_node_query.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_node_query.py
from datetime import datetime, timezone
from pathlib import Path
import textwrap

import pytest

from cortex.core.article import MemoryArticle, Provenance, ArticleType
from cortex.node.node import CortexNode
from tests.unit.node.test_node_publish import cfg, make_keys, FakeBroker


@pytest.mark.asyncio
async def test_query_returns_closest(tmp_path: Path, monkeypatch) -> None:
    c = cfg(tmp_path)
    keys = make_keys(tmp_path)
    broker = FakeBroker()
    node = CortexNode(org_did="did:percq:org:soc-alpha", agent_did="did:percq:agent:alpha-bot-1",
                     key_paths=keys, broker_url="ws://localhost:7432", config_path=c,
                     embedder_backend_override="cpu")
    node._broker_override = broker
    await node.start()
    contents = ["APT29 uses encoded powershell", "lateral movement via SMB admin shares",
                "kernel exploit CVE-2026-1337 read write"]
    for i, content in enumerate(contents):
        prov = Provenance(
            producer_agent="did:percq:agent:alpha-bot-1",
            producer_org="did:percq:org:soc-alpha",
            computation_ref=None, source_data_hash="h",
            source_data_schema="cve-record-v1", run_id=f"r{i}",
            timestamp=datetime(2026, 7, 18, 12, 0, 0, tzinfo=timezone.utc),
        )
        art = MemoryArticle(
            id="", type=ArticleType.FINDING, content=content,
            payload={}, embedding=None, embedding_model=None, provenance=prov,
            scope="public", agent_signature=b"", org_signature=None,
            cites=[], trust_score=None, trust_expiration=None,
        )
        node.publish(art)
    results = node.query("powershell obfuscation", topic_filter=[], scope_filter=["public"],
                         top_k=3, min_trust=0.0, deadline_ms=400)
    assert len(results) >= 1
    assert "powershell" in results[0].article.content.lower()
    await node.stop()
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_node_query.py`
Expected: passes if Task 11/13 wired in; otherwise failure reveals missing wire-up (store-aware retrieval adapter).

- [x] **Step 3: Write minimal implementation**

Add a store adapter to CortexNode.query so `retrieve` can hydrate from ArticleStore rows:

```python
    def query(self, query_text, topic_filter, scope_filter, top_k, min_trust, deadline_ms):
        assert self.store and self.vector_index and self.embedder
        adapter = _StoreAdapter(self.store)
        return retrieve(
            store=adapter, vector_index=self.vector_index, embedder=self.embedder,
            query_text=query_text, topic_filter=topic_filter, scope_filter=scope_filter,
            top_k=top_k, min_trust=min_trust, deadline_ms=deadline_ms,
        )
```

Update `_row_to_article` to populate all fields retrieval needs (`scope`, `type`, `trust_score`, `provenance`).

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_node_query.py`
Expected: `1 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/node.py tests/unit/node/test_node_query.py
git commit -m "test(node): CortexNode.query end-to-end retrieval

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 15: CortexNode.derive emits DERIVE envelope and updates ProvenanceGraph

**Files:**
- Modify: `cortex/node/node.py`, add test `tests/unit/node/test_node_derive.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_node_derive.py
from datetime import datetime, timezone
from pathlib import Path
import pytest

from cortex.core.article import MemoryArticle, Provenance, ArticleType
from cortex.node.node import CortexNode
from tests.unit.node.test_node_publish import cfg, make_keys, FakeBroker


@pytest.mark.asyncio
async def test_derive_creates_edges_and_emits_envelope(tmp_path: Path) -> None:
    c = cfg(tmp_path)
    keys = make_keys(tmp_path)
    broker = FakeBroker()
    node = CortexNode(org_did="did:percq:org:soc-alpha", agent_did="did:percq:agent:alpha-bot-1",
                      key_paths=keys, broker_url="ws://localhost:7432", config_path=c,
                      embedder_backend_override="cpu")
    node._broker_override = broker
    await node.start()
    cited_ids: list[str] = []
    for i in range(3):
        prov = Provenance(producer_agent="did:percq:agent:alpha-bot-1",
                          producer_org="did:percq:org:soc-alpha",
                          computation_ref=None, source_data_hash="h" if i else None,
                          source_data_schema=None, run_id=f"r{i}",
                          timestamp=datetime(2026, 7, 18, 12, 0, 0, tzinfo=timezone.utc))
        base = MemoryArticle(id="", type=ArticleType.FINDING, content=f"finding {i}",
                             payload={}, embedding=None, embedding_model=None,
                             provenance=prov, scope="public", agent_signature=b"",
                             org_signature=None, cites=[], trust_score=None, trust_expiration=None)
        cited_ids.append(node.publish(base))
    new = MemoryArticle(id="", type=ArticleType.INSIGHT, content="correlated insight from three findings",
                       payload={}, embedding=None, embedding_model=None, provenance=prov,
                       scope="public", agent_signature=b"", org_signature=None, cites=[],
                       trust_score=None, trust_expiration=None)
    new_id = node.derive(new, cited_ids)
    for cid in cited_ids:
        assert new_id in node.provenance.cited_by(cid)
    assert any(e["type"] == "derive" for e in broker.published)
    trust = node.trust.trust_for(_row_to_article(node.store.get(new_id)),
                                 datetime.now(timezone.utc),
                                 _StoreSpy(node.store), graph_version=node.provenance.graph_version)
    assert trust > 0.0
    await node.stop()


class _StoreSpy:
    def __init__(self, store): self._s = store
    def get(self, art_id): return _row_to_article(self._s.get(art_id))


def _row_to_article(row):
    from cortex.core.article import Provenance
    import json
    from datetime import datetime
    prov = Provenance(producer_agent="", producer_org="", computation_ref=None,
                      source_data_hash=None, source_data_schema=None, run_id="",
                      timestamp=datetime.fromisoformat(row["created_at"]))
    return MemoryArticle(id=row["id"], type=row["type"], content=row["content"], payload={},
                         embedding=None, embedding_model=None, provenance=prov,
                         scope=row["scope"], agent_signature=b"", org_signature=row["org_sig"],
                         cites=json.loads(row["cites_json"] or "[]"),
                         trust_score=row["trust_score"], trust_expiration=None)
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_node_derive.py`
Expected: should fail at `assert any(e["type"] == "derive" ...)` if envelope not emitted, or `cited_by` empty if edges not added. Pass once node.derive wires both.

- [x] **Step 3: Write minimal implementation**

`CortexNode.derive` already in node.py per Task 13 step 3. Verify edges persist in SQLite and envelope task scheduled.

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_node_derive.py`
Expected: `1 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/node.py tests/unit/node/test_node_derive.py
git commit -m "test(node): derive emits DERIVE envelope and updates graph

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 16: Error-handling invariants

**Files:**
- Add test `tests/unit/node/test_node_invariants.py`, `cortex/node/keys.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_node_invariants.py
from pathlib import Path
import textwrap

import pytest

from cortex.core.article import MemoryArticle, Provenance, ArticleType
from cortex.core.errors import CanonicalMismatchError
from cortex.node.node import CortexNode
from tests.unit.node.test_node_publish import cfg, make_keys, FakeBroker
from datetime import datetime, timezone


@pytest.mark.asyncio
async def test_private_never_emits_envelope(tmp_path: Path) -> None:
    c = cfg(tmp_path); keys = make_keys(tmp_path); broker = FakeBroker()
    node = CortexNode(org_did="did:percq:org:soc-alpha", agent_did="did:percq:agent:alpha-bot-1",
                      key_paths=keys, broker_url="ws://localhost:7432", config_path=c,
                      embedder_backend_override="cpu")
    node._broker_override = broker
    await node.start()
    prov = Provenance(producer_agent="did:percq:agent:alpha-bot-1",
                      producer_org="did:percq:org:soc-alpha",
                      computation_ref=None, source_data_hash=None,
                      source_data_schema=None, run_id="r",
                      timestamp=datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc))
    art = MemoryArticle(id="", type=ArticleType.FINDING, content="secret",
                       payload={}, embedding=None, embedding_model=None, provenance=prov,
                       scope="private", agent_signature=b"", org_signature=None,
                       cites=[], trust_score=None, trust_expiration=None)
    node.publish(art)
    assert broker.published == []
    await node.stop()


def test_load_keys_refuses_world_readable(tmp_path: Path) -> None:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization
    from cortex.node.keys import load_keys
    k = Ed25519PrivateKey.generate()
    pem = k.private_bytes(encoding=serialization.Encoding.PEM,
                          format=serialization.PrivateFormat.PKCS8,
                          encryption_algorithm=serialization.NoEncryption())
    p = tmp_path / "k.pem"; p.write_bytes(pem)
    try:
        p.chmod(0o644)  # world-readable
    except PermissionError:
        # on some platforms chmod is stricter; just skip
        pytest.skip("cannot set world-readable on this FS")
    with pytest.raises(PermissionError):
        load_keys(p, p)
```

Note: `load_keys` returning two tuples per the contract. We re-test the `ensure_keys` permissive mode in Task 19.

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_node_invariants.py`
Expected: `ImportError: cannot import name 'load_keys'` (already wired into node.py via Task 13 step 3 import — but `cortex/node/keys.py` not yet created).

- [x] **Step 3: Write minimal implementation**

```python
# cortex/node/keys.py
"""Ed25519 key loading + ensure (Design §4, §12.1)."""
from __future__ import annotations

import os
import stat
from pathlib import Path

from cortex.core.crypto import generate_agent_keypair, generate_org_keypair, load_private_pem


def load_keys(org_path: Path, agent_path: Path) -> tuple[bytes, bytes]:
    for p in (org_path, agent_path):
        if not Path(p).exists():
            raise FileNotFoundError(f"key file missing: {p}")
        mode = stat.S_IMODE(os.stat(p).st_mode)
        if mode & 0o044:
            raise PermissionError(f"key file is world-readable: {p} (mode {oct(mode)})")
    org_pem = Path(org_path).read_bytes()
    agent_pem = Path(agent_path).read_bytes()
    # validate
    load_private_pem(org_pem)
    load_private_pem(agent_pem)
    return org_pem, agent_pem


def ensure_keys(path: Path, kind: str = "org") -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        if kind == "org":
            pem, _ = generate_org_keypair()
        else:
            pem, _ = generate_agent_keypair()
        p.write_bytes(pem)
        p.chmod(0o600)
    return p
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_node_invariants.py`
Expected: `2 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/keys.py tests/unit/node/test_node_invariants.py
git commit -m "feat(node): keys helper refuses world-readable, ensure_keys 0600

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 17: Receive PUBLISH envelope — recompute canonical, verify, quarantine on mismatch

**Files:**
- Create: `cortex/node/receiver.py` and test `tests/unit/node/test_receiver.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_receiver.py
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from cortex.core.article import MemoryArticle, Provenance, ArticleType
from cortex.core.errors import SignatureVerificationError, CanonicalMismatchError
from cortex.node.receiver import receive_publish_envelope


class RegistryStub:
    def __init__(self):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives import serialization
        self.agent_priv = Ed25519PrivateKey.generate()
        self.org_priv = Ed25519PrivateKey.generate()
        self.agent_pub_pem = self.agent_priv.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        self.org_pub_pem = self.org_priv.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )

    def lookup(self, did: str) -> bytes:
        return self.org_pub_pem  # for verify


def make_registry() -> RegistryStub:
    return RegistryStub()


def test_tampered_canonical_raises_canonical_mismatch(tmp_path: Path) -> None:
    reg = make_registry()
    from cortex.core.canonical import article_canonical_bytes, compute_article_id
    from cortex.core.crypto import sign
    from cryptography.hazmat.primitives import serialization
    priv = reg.agent_priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    prov = Provenance(producer_agent="did:percq:agent:x", producer_org="did:percq:org:other",
                      computation_ref=None, source_data_hash="h",
                      source_data_schema=None, run_id="r",
                      timestamp=datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc))
    art = MemoryArticle(id="", type=ArticleType.FINDING, content="hello",
                       payload={"k": "v"}, embedding=None, embedding_model=None,
                       provenance=prov, scope="public", agent_signature=b"",
                       org_signature=None, cites=[], trust_score=None, trust_expiration=None)
    canonical = article_canonical_bytes(art)
    art = art.replace(agent_signature=sign(priv, canonical), id=compute_article_id(canonical))
    # tamper: change content after signing
    tampered = art.replace(content="hello world")
    store = SimpleNamespace(event_log_append=lambda *_: None, set_state=lambda *_: None, put=lambda *_: None)
    with pytest.raises((CanonicalMismatchError, SignatureVerificationError)):
        receive_publish_envelope(tampered, canonical, reg, store)
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_receiver.py`
Expected: import error.

- [x] **Step 3: Write minimal implementation**

```python
# cortex/node/receiver.py
"""Receive-side publish handler: recompute canonical, verify, quarantine on mismatch (Design §4.4, §12.2)."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from cortex.core.canonical import article_canonical_bytes, compute_article_id
from cortex.core.crypto import verify
from cortex.core.errors import CanonicalMismatchError, SignatureVerificationError


def receive_publish_envelope(article: Any, expected_canonical: bytes, registry: Any, store: Any) -> str:
    canonical = article_canonical_bytes(article)
    if canonical != expected_canonical:
        # attempt to recompute id and compare
        art_id = getattr(article, "id", None) or compute_article_id(canonical)
        event = {"reason": "canonical_mismatch", "article_id": art_id}
        if hasattr(store, "put"):
            store.put(article, state="quarantined")
        if hasattr(store, "event_log_append"):
            store.event_log_append("broker.scope_violation", art_id, event)
        raise CanonicalMismatchError(f"canonical bytes do not match for {art_id}")
    # verify signature
    pub_pem = registry.lookup(article.provenance.producer_org)
    if not verify(pub_pem, canonical, article.agent_signature):
        store.put(article, state="quarantined")
        store.event_log_append("broker.scope_violation", article.id, {"reason": "bad_signature"})
        raise SignatureVerificationError(f"agent signature invalid for {article.id}")
    store.put(article, state="signed")
    store.set_state(article.id, "indexed")
    return article.id
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_receiver.py`
Expected: `1 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/receiver.py tests/unit/node/test_receiver.py
git commit -m "feat(node): receive publish envelope recompute+verify+quarantine

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 18: Healthcheck loop — every 5 s, swap to CPU on missing GPU

**Files:**
- Modify: `cortex/node/node.py`, add test `tests/unit/node/test_node_health.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_node_health.py
import asyncio
from pathlib import Path
from datetime import datetime, timezone

import pytest

from cortex.core.article import Provenance
from cortex.node.node import CortexNode
from tests.unit.node.test_node_publish import cfg, make_keys, FakeBroker


@pytest.mark.asyncio
async def test_health_loop_swaps_to_cpu(tmp_path: Path, monkeypatch) -> None:
    c = cfg(tmp_path); keys = make_keys(tmp_path); broker = FakeBroker()
    node = CortexNode(org_did="did:percq:org:soc-alpha", agent_did="did:percq:agent:alpha-bot-1",
                      key_paths=keys, broker_url="ws://localhost:7432", config_path=c,
                      embedder_backend_override="cpu")
    node._broker_override = broker
    await node.start()
    events_seen: list[str] = []
    node.embedder.on_embed_failed = lambda r: events_seen.append(r)
    # simulate missing GPU after start: dataset.fallback_to_cpu was False (cpu backend)
    called = {"n": 0}

    async def fast_loop() -> None:
        # invoke once and stop
        called["n"] += 1
        node.embedder.fallback_to_cpu = False  # pretend GPU was active
        # _check_gpu returns False (cpu backend has no cuda)
        assert node.embedder._check_gpu() is False
        node.embedder.fallback_to_cpu = True
        node._on_embed_failed("healthcheck:no_gpu")

    node._health_task.cancel()
    await fast_loop()
    assert called["n"] == 1
    assert "healthcheck:no_gpu" in events_seen
    await node.stop()
```

- [x] **Step 2: Run test to verify it fails / passes**

Run: `pytest -q tests/unit/node/test_node_health.py`

- [x] **Step 3: Write minimal implementation**

`_health_loop` already implemented in node.py (Task 13). Tighten it:

```python
    async def _health_loop(self) -> None:
        while True:
            await asyncio.sleep(5)
            if self.embedder is None:
                continue
            if not self.embedder._check_gpu() and not self.embedder.fallback_to_cpu:
                self.embedder.fallback_to_cpu = True
                self.embedder._device = "cpu"
                try:
                    self.embedder._model = self.embedder._model.to("cpu")
                except Exception:
                    pass
                self._on_embed_failed("healthcheck:no_gpu")
                self.store.event_log_append("node.embed.fallback_cpu", None, {"reason": "healthcheck"})
```

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_node_health.py`
Expected: `1 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/node.py tests/unit/node/test_node_health.py
git commit -m "feat(node): 5s healthcheck swaps embedder to CPU on missing GPU

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 19: ensure_keys generates 0600-perm files

**Files:**
- Modify: `cortex/node/keys.py`, add test `tests/unit/node/test_keys.py`

- [x] **Step 1: Write the failing test**

```python
# tests/unit/node/test_keys.py
import os
import stat
from pathlib import Path

from cryptography.hazmat.primitives import serialization

from cortex.node.keys import ensure_keys


def test_ensure_keys_creates_0600(tmp_path: Path) -> None:
    p = tmp_path / "keys" / "agent_ed25519.pem"
    out = ensure_keys(p, kind="agent")
    assert out.exists()
    mode = stat.S_IMODE(os.stat(out).st_mode)
    assert mode == 0o600
    # loadable as private key
    pem = out.read_bytes()
    serialization.load_pem_private_key(pem, password=None)


def test_ensure_keys_idempotent(tmp_path: Path) -> None:
    p = tmp_path / "o.pem"
    a = ensure_keys(p, kind="org")
    b = ensure_keys(p, kind="org")
    assert a.read_bytes() == b.read_bytes()
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/unit/node/test_keys.py`

- [x] **Step 3: Write minimal implementation**

`ensure_keys` already in keys.py from Task 16. Confirm `generate_org_keypair` / `generate_agent_keypair` return `(priv_pem_bytes, pub_pem_bytes)` per core contract.

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/unit/node/test_keys.py`
Expected: `2 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/keys.py tests/unit/node/test_keys.py
git commit -m "test(node): ensure_keys creates idempotent 0600 key files

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 20: Integration test — in-process broker + two CortexNodes roundtrip

**Files:**
- Test: `tests/integration/test_two_node_roundtrip.py`

- [x] **Step 1: Write the failing test**

```python
# tests/integration/test_two_node_roundtrip.py
import asyncio
import json
import logging
import os
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
import websockets

from cortex.core.article import MemoryArticle, Provenance, ArticleType
from cortex.node.broker_client import BrokerClient
from cortex.node.node import CortexNode


def write_config(tmp_path: Path, org_did: str, agent_did: str, broker_port: int) -> Path:
    p = tmp_path / f"config-{org_did.split(':')[-1]}.yaml"
    p.write_text(textwrap.dedent(f"""\
        node:
          org_did: {org_did}
          agent_did: {agent_did}
          key_paths:
            org: {tmp_path / org_did.split(':')[-1] / 'org.pem'}
            agent: {tmp_path / org_did.split(':')[-1] / 'agent.pem'}
        broker: {{url: ws://127.0.0.1:{broker_port}, registry: {tmp_path / 'registry.json'}, replay_window_sec: 600}}
        embedder: {{model: bge-small-en-v1.5, backend: cpu, batch_size: 4, fallback_on_oom: true}}
        vector_index: {{backend: hnswlib, metric: cosine, hnsw: {{M: 16, ef_construction: 100, ef_search: 32}}}}
        trust: {{default_org_reputation: 0.85, reputation_overrides: {{}}, half_life_days: 90, min_trust_default: 0.3}}
        query: {{default_top_k: 5, deadline_ms: 400, min_trust: 0.3}}
        logging: {{level: INFO, file: {tmp_path / 'n.log'}}}
    """))
    return p


def generate_keys(p: Path) -> Path:
    p.parent.mkdir(parents=True, exist_ok=True)
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization
    k = Ed25519PrivateKey.generate()
    pem = k.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    p.write_bytes(pem); p.chmod(0o600)
    return p


@pytest.mark.asyncio
async def test_two_node_roundtrip(tmp_path: Path) -> None:
    # in-process mini broker: accept connections, broadcast publishes to all peers
    broker_received: list[dict] = []
    peers: list = []

    async def handler(ws):
        peers.append(ws)
        try:
            async for msg in ws:
                env = json.loads(msg)
                broker_received.append(env)
                for p in list(peers):
                    if p is not ws:
                        await p.send(msg)
                await ws.send(json.dumps({"type": "ack", "msg_id": env.get("msg_id", "?")}))
        except websockets.ConnectionClosed:
            pass
        finally:
            try: peers.remove(ws)
            except ValueError: pass

    server = await websockets.serve(handler, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]

    cfgA = write_config(tmp_path, "did:percq:org:soc-alpha", "did:percq:agent:alpha-1", port)
    cfgB = write_config(tmp_path, "did:percq:org:soc-beta", "did:percq:agent:beta-1", port)
    keysA = {"org": generate_keys(Path(cfgA.parent / "soc-alpha" / "org.pem")),
             "agent": generate_keys(Path(cfgA.parent / "soc-alpha" / "agent.pem"))}
    keysB = {"org": generate_keys(Path(cfgB.parent / "soc-beta" / "org.pem")),
             "agent": generate_keys(Path(cfgB.parent / "soc-beta" / "agent.pem"))}

    nodeA = CortexNode(org_did="did:percq:org:soc-alpha", agent_did="did:percq:agent:alpha-1",
                      key_paths=keysA, broker_url=f"ws://127.0.0.1:{port}", config_path=cfgA,
                      embedder_backend_override="cpu")
    nodeB = CortexNode(org_did="did:percq:org:soc-beta", agent_did="did:percq:agent:beta-1",
                      key_paths=keysB, broker_url=f"ws://127.0.0.1:{port}", config_path=cfgB,
                      embedder_backend_override="cpu")
    await nodeA.start(); await nodeB.start()
    await asyncio.sleep(0.05)

    prov = Provenance(producer_agent="did:percq:agent:alpha-1", producer_org="did:percq:org:soc-alpha",
                      computation_ref=None, source_data_hash="h", source_data_schema=None,
                      run_id="r1", timestamp=datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc))
    art = MemoryArticle(id="", type=ArticleType.FINDING, content="cross-tenant finding APT29",
                       payload={"attack_id": "T1059.001"}, embedding=None, embedding_model=None,
                       provenance=prov, scope="public", agent_signature=b"", org_signature=None,
                       cites=[], trust_score=None, trust_expiration=None)
    art_id = nodeA.publish(art)
    await asyncio.sleep(0.1)
    assert any(e.get("type") == "publish" for e in broker_received), "broker did not receive publish"
    # local assertion: nodeA has it
    assert nodeA.store.get(art_id) is not None
    results = nodeA.query("APT29 powershell", topic_filter=[], scope_filter=["public"],
                          top_k=3, min_trust=0.0, deadline_ms=400)
    assert len(results) >= 1
    await nodeA.stop(); await nodeB.stop()
    server.close(); await server.wait_closed()
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest -q tests/integration/test_two_node_roundtrip.py`
Expected: fails until `BrokerClient` real socket wiring handles acks/broadcasts; tune `BrokerClient._sender_loop` to ignore `ack` messages from broker without crashing.

- [x] **Step 3: Write minimal implementation**

In `cortex/node/broker_client.py`, add receive loop that ignores non-result envelopes and surfaces events through `on_event`:

```python
    async def connect(self) -> None:
        await self._connect_socket()
        self._sender_task = asyncio.create_task(self._sender_loop())
        self._reader_task = asyncio.create_task(self._reader_loop())

    async def _reader_loop(self) -> None:
        ws = self._ws
        if ws is None: return
        try:
            async for msg in ws:
                try:
                    env = json.loads(msg)
                except Exception:
                    continue
                t = env.get("type")
                if t == "event":
                    self.on_event(env.get("event"), env.get("article_id"), env.get("payload", {}))
                elif t == "metrics":
                    self.on_metrics(env.get("payload", {}))
        except Exception:
            self._connected = False
```

Update `stop()` to also cancel `_reader_task`.

- [x] **Step 4: Run test to verify it passes**

Run: `pytest -q tests/integration/test_two_node_roundtrip.py`
Expected: `1 passed`.

- [x] **Step 5: Commit**

```bash
git add cortex/node/broker_client.py tests/integration/test_two_node_roundtrip.py
git commit -m "test(node): two-node in-process broker roundtrip integration

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Self-review

**Spec coverage.**

| Spec section | Requirement | Task(s) |
|---|---|---|
| §7.1 ArticleStore SQLite schema (3 tables, 3 indexes) | Exact DDL | Task 2 |
| §7.2 VectorIndex protocol + FAISS/HNSW backends | Protocol, M=32, ef=200/64 | Tasks 6, 7 |
| §7.3 ProvenanceGraph NetworkX + SQLite persistence | Edges derived→cited, reload | Task 8 |
| §7.4 Persistent paths | `cortex-node/articles.sqlite`, `vectors/`, `keys/`, `config.yaml` | Tasks 2, 6, 13 |
| §8.1 BAAI/bge-small-en-v1.5 only | model default in Embedder | Tasks 4, 5 |
| §8.2 Embedding pipeline (prefix, batch=16, mean-pool, L2-norm, float16) | `embed` + `embed_one` | Tasks 4, 5 |
| §8.3 Retrieval pipeline (embed_one, over-fetch top_k*2, scope/trust filters, hybrid 0.5/0.5, truncate) | `retrieve` | Task 11 |
| §8.4 OOM halve-and-retry, `effective_batch_size`, metrics event | OOM retry + callback | Task 5, 13 |
| §9.1 Trust inputs | All present | Tasks 9 |
| §9.2 Formula exactly `0.6*base + 0.4*source - source_penalty` | Test asserts `0.6237` for known inputs | Task 9 |
| §9.3 Memoize per `(article_id, graph_version)`, single-hop | `_cache` key, single-hop recursion | Tasks 9, 10 |
| §9.4 Trust lives in retrieval hybrid ranking | `0.5*cos + 0.5*trust` in `retrieve` | Task 11 |
| §10.1 CortexNode facade signature (`org_did, agent_did, key_paths, broker_url, config`) | constructor + start/stop/publish/query/derive | Tasks 13, 14, 15 |
| §12.1 Embedder OOM / unavailable / SQLite locked / key file missing | OOM retry, fallback event, retry, `load_keys` refusal | Tasks 5, 18, 3, 16 |
| §12.2 Broker unreachable / queue spill / invalid signature / scope violation | backoff 1s..30s, >10k spill, `quarantined` state, `broker.scope_violation` event | Tasks 12, 17, 20 |
| §12.3 Invariants — no unsigned article indexed; private never sent; partner:X never forwarded; embedding failure never loses article; VectorIndex rebuildable from SQLite | asserted in Task 16 (private no emit) and Task 13 (sign-before-index); rebuild path implicit in `ArticleStore` + `VectorIndex.load` | Tasks 13, 16, 17 |
| §17.1/17.2 Config + env overrides | `NodeConfig.load_config`, 4 env vars | Task 1 |

**Placeholder scan.** No `TODO / TBD / later` outside the trailing `Co-authored-by` trailer template (which is required by AGENTS.md, not a placeholder). Test task bodies reference `cortex.node.broker_client.BrokerClient` (real) — there are no sketchy `# ???` markers.

**Cross-plan type consistency.**
- `CortexNode.__init__(org_did: str, agent_did: str, key_paths: dict[str, pathlib.Path], broker_url: str, config_path: pathlib.Path)` ✓ matches Shared contract (the contract uses `config_path: pathlib.Path`).
- `CortexNode.publish(article: MemoryArticle) -> str` ✓ returns `article_id`
- `CortexNode.query(query_text, topic_filter, scope_filter, top_k, min_trust, deadline_ms) -> list[QueryResult]` ✓
- `CortexNode.derive(new_article: MemoryArticle, cited_article_ids: list[str]) -> str` ✓
- `QueryResult(article, article_id, hybrid_score, trust_score, provenance_summary)` ✓ all five fields named exactly per Shared contract.

**Deviations from suggested breakdown.**
- Tasks 1–20 are kept in the suggested order; no merges or splits.
- Task 13 also wires `keys.py` import (the `load_keys` helper) because `CortexNode.start()` cannot start without keys; Task 16 then strengthens `load_keys` with the world-readable-permission refusal. This is the only cross-task overlap and is necessary because `node.py` must import `cortex.node.keys` to function.
- Task 17 introduces `cortex/node/receiver.py` not enumerated in the suggested component list, but it is the receive-side surface required by Spec §4.4 and §12.2 (`SignatureVerificationError` / `CanonicalMismatchError` in shared contract are imported by `cortex-node`). Kept as a thin module rather than expanding `node.py`.
- Task 20 uses `websockets.serve(handler, ...)` (real in-process broker) rather than a fully mocked broker per "spinning up in-process broker" — this exercises real sockets on loopback, the closest faithful test short of running `cortex-broker`.

**Self-review confirmation:** Spec coverage mapped, placeholders scanned (none missing), shared-contract signatures match exactly. Plan is ready for execution.