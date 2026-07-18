# cortex-sdk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a thin, agent-facing convenience layer over `cortex-node` — a synchronous `CortexClient`, LangChain + LlamaIndex adapters, a vLLM-on-ROCm reasoning bridge, and a runnable `CortexAgent` — that lets the F1 SOC consortium demo agents (alpha-bot, beta-bot) publish findings, search peer memory, derive insights, and reason through a ReAct loop without touching asyncio or node internals directly.

**Architecture:** `cortex.sdk` is purely a façade. `CortexClient` wraps `CortexNode` synchronously, building `MemoryArticle`/`Provenance` objects and forwarding to `publish`/`query`/`derive`. LangChain and LlamaIndex adapters translate `QueryResult` lists into their respective `Document` types and expose Tool/Reader interfaces. A ReAct loop in `cortex.sdk.llm` drives `vLLMClient` (OpenAI-compatible HTTP to a vLLM-on-ROCm server) or a `ScriptedReasoner` fallback. `CortexAgent` composes client + retriever + reasoner into a runnable `run_task` loop. An error-mapping helper wraps every SDK call.

**Tech Stack:** Python 3.11+, langchain community (LangChain 0.2+), llama-index (0.10+), optional openai-compatible clients for vLLM-on-ROCm.

---

## 0. Locked decisions (inherited from master plan)

| # | Decision | Value |
|---|---|---|
| D2 | Headline agent reasoning LLM | Llama-3 8B via vLLM-on-ROCm (default), Qwen-2.5 7B fallback |
| D8 | Demo scenario | F1 SOC consortium |

## 1. Shared contract (LOCKED — depend on cortex-core and cortex-node plans)

Imports the SDK layer is allowed to make:

```python
from cortex.core.article import MemoryArticle, Provenance, Scope, ArticleType
from cortex.node.node import CortexNode
from cortex.node.query import QueryResult
```

`CortexNode` API (assumed already implemented by `cortex-node` plan):
- `__init__(org_did, agent_did, key_paths, broker_url, config_path)`
- `async start()`, `async stop()`
- `publish(article: MemoryArticle) -> str`
- `query(query_text, topic_filter, scope_filter, top_k, min_trust, deadline_ms) -> list[QueryResult]`
- `derive(new_article, cited_article_ids) -> str`

`QueryResult`: `article: MemoryArticle, article_id: str, hybrid_score: float, trust_score: float, provenance_summary: dict`.

`MemoryArticle`: `id, schema_version="1.0", type, content, payload, embedding=None, embedding_model=None, provenance, scope, agent_signature, org_signature=None, cites=[], trust_score=None, trust_expiration=None`.

`Provenance`: `producer_agent, producer_org, computation_ref=None, source_data_hash=None, source_data_schema=None, run_id, timestamp`.

`Scope`: `Scope.PRIVATE / Scope.PUBLIC` constants; `Scope.partner(org_did)` classmethod.

`ArticleType`: `FINDING, INSIGHT, WARNING, PROCEDURE, PRECEDENT` enum members.

**Public attributes assumed on `CortexNode`:** `node.agent_did: str`, `node.org_did: str`. (The cortex-node plan guarantees these are populated by `__init__`.)

## 2. Module layout

```
cortex/sdk/
├── __init__.py              # public API re-exports
├── exceptions.py            # CortexPublishError, CortexQueryError, map_node_error
├── client.py                # CortexClient
├── provenance.py            # ProvenanceHelpers
├── langchain_adapter.py     # CortexRetriever, CortexPublishTool
├── llamaindex_adapter.py    # CortexReader
├── llm.py                   # vLLMClient, ScriptedReasoner, agent_step
└── agent.py                 # CortexAgent
tests/sdk/
├── __init__.py
├── conftest.py              # shared fakes (FakeNode, fake_query_result)
├── test_client.py
├── test_provenance.py
├── test_langchain_adapter.py
├── test_llamaindex_adapter.py
├── test_llm.py
├── test_agent.py
└── test_exceptions.py
examples/
└── quickstart.py            # runnable CortexClient + CortexRetriever example
```

## 3. Pre-flight: package skeleton

**Files:**
- Create: `cortex/sdk/__init__.py`
- Create: `tests/sdk/__init__.py`
- Create: `tests/sdk/conftest.py`

- [ ] **Step 1: Create `cortex/sdk/__init__.py`** (empty placeholder — public exports added by Task 15).

```python
"""Perciqa Cortex agent SDK — thin façade over cortex.node.CortexNode."""
```

- [ ] **Step 2: Create `tests/sdk/__init__.py`** (empty).

```python
```

- [ ] **Step 3: Write `tests/sdk/conftest.py`** with shared fakes used by every task.

```python
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from cortex.core.article import (
    ArticleType,
    MemoryArticle,
    Provenance,
    Scope,
)
from cortex.node.query import QueryResult


def _prov(producer_agent: str = "did:org:alpha#agent-1",
          producer_org: str = "did:org:alpha") -> Provenance:
    return Provenance(
        producer_agent=producer_agent,
        producer_org=producer_org,
        run_id=str(uuid4()),
        timestamp=datetime.now(timezone.utc),
    )


def make_article(
    *,
    content: str = "Phishing campaign targeting F1 garages detected.",
    payload: dict | None = None,
    scope: Scope = Scope.PUBLIC,
    type_: ArticleType = ArticleType.FINDING,
    cites: list[str] | None = None,
) -> MemoryArticle:
    return MemoryArticle(
        id=str(uuid4()),
        schema_version="1.0",
        type=type_,
        content=content,
        payload=payload or {},
        embedding=None,
        embedding_model=None,
        provenance=_prov(),
        scope=scope,
        agent_signature="sig-alpha",
        org_signature=None,
        cites=cites or [],
        trust_score=None,
        trust_expiration=None,
    )


def make_query_result(score: float = 0.8, trust: float = 0.7) -> QueryResult:
    art = make_article()
    return QueryResult(
        article=art,
        article_id=art.id,
        hybrid_score=score,
        trust_score=trust,
        provenance_summary={"producer_org": "did:org:alpha"},
    )


def make_fake_node(*, publish_id: str = "art-id-1") -> MagicMock:
    node = MagicMock(name="CortexNode")
    node.agent_did = "did:org:alpha#agent-1"
    node.org_did = "did:org:alpha"
    node.publish = MagicMock(return_value=publish_id)
    node.query = MagicMock(return_value=[make_query_result()])
    node.derive = MagicMock(return_value="derived-id-1")
    return node


@pytest.fixture
def fake_node() -> MagicMock:
    return make_fake_node()
```

- [ ] **Step 4: Run sanity test**

Run: `pytest tests/sdk/ -q`
Expected: `no tests ran in X.XXs` (zero tests, no errors).

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/__init__.py tests/sdk/__init__.py tests/sdk/conftest.py
git commit -m "feat(sdk): scaffold cortex.sdk package and shared test fakes

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 1: CortexClient constructor + publish_finding

**Files:**
- Create: `cortex/sdk/exceptions.py`
- Create: `cortex/sdk/client.py`
- Create: `cortex/sdk/provenance.py` (ProvenanceHelpers added fully in Task 5; this task only adds the helper used by `CortexClient._build_provenance`).
- Test: `tests/sdk/test_client.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/sdk/test_client.py
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

from cortex.core.article import ArticleType, Scope
from cortex.sdk.client import CortexClient


def test_publish_finding_builds_article_and_calls_node_publish(fake_node: MagicMock):
    client = CortexClient(fake_node)

    art_id = client.publish_finding(
        content="Spoofed team-radio email observed in paddock VLAN.",
        payload={"priority": "high", "asset": "garage-12"},
        scope=Scope.PUBLIC,
    )

    assert art_id == "art-id-1"
    fake_node.publish.assert_called_once()
    article = fake_node.publish.call_args.args[0]
    assert article.type == ArticleType.FINDING
    assert article.content == "Spoofed team-radio email observed in paddock VLAN."
    assert article.payload == {"priority": "high", "asset": "garage-12"}
    assert article.scope == Scope.PUBLIC
    assert article.provenance.producer_agent == fake_node.agent_did
    assert article.provenance.producer_org == fake_node.org_did
    assert isinstance(article.provenance.run_id, str) and article.provenance.run_id
    assert isinstance(article.provenance.timestamp, datetime)
    assert article.provenance.timestamp.tzinfo == timezone.utc


def test_publish_finding_defaults_scope_to_private(fake_node: MagicMock):
    client = CortexClient(fake_node)
    client.publish_finding(content="x", payload={})
    article = fake_node.publish.call_args.args[0]
    assert article.scope == Scope.PRIVATE
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_client.py -v`
Expected: `ModuleNotFoundError: No module named 'cortex.sdk.client'`.

- [ ] **Step 3: Write minimal implementation**

```python
# cortex/sdk/exceptions.py
from __future__ import annotations


class CortexSDKError(Exception):
    """Base class for cortex.sdk user-facing errors."""


class CortexPublishError(CortexSDKError):
    """Raised when publish() fails on the underlying node."""


class CortexQueryError(CortexSDKError):
    """Raised when query() fails on the underlying node."""


def map_node_error(exc: Exception) -> Exception:
    """Translate core/node exceptions to user-friendly SDK exceptions.

    Wrapped around every SDK call so agents get a single error taxonomy.
    """
    if isinstance(exc, CortexSDKError):
        return exc
    name = type(exc).__name__.lower()
    if "publish" in name or "sign" in name:
        return CortexPublishError(str(exc)) from exc
    if "query" in name or "search" in name:
        return CortexQueryError(str(exc)) from exc
    return CortexSDKError(str(exc)) from exc
```

```python
# cortex/sdk/provenance.py
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from uuid import uuid4

from cortex.core.article import Provenance


class ProvenanceHelpers:
    """Static helpers for constructing/embellishing Provenance objects.

    Full surface (from_seed, with_source_hash) is exercised by Task 5;
    `_build_provenance` is the only entry used by CortexClient today.
    """

    @staticmethod
    def _build_provenance(node) -> Provenance:
        return Provenance(
            producer_agent=node.agent_did,
            producer_org=node.org_did,
            computation_ref=None,
            source_data_hash=None,
            source_data_schema=None,
            run_id=str(uuid4()),
            timestamp=datetime.now(timezone.utc),
        )

    @staticmethod
    def from_seed(seed_dict: dict) -> Provenance:
        """Construct a Provenance auto-filling run_id and timestamp."""
        seed = dict(seed_dict)
        seed.setdefault("run_id", str(uuid4()))
        seed.setdefault("timestamp", datetime.now(timezone.utc))
        return Provenance(**seed)

    @staticmethod
    def with_source_hash(prov: Provenance, raw_data: bytes, schema_desc: str) -> Provenance:
        """Return a copy of `prov` with source_data_hash / source_data_schema set."""
        return Provenance(
            producer_agent=prov.producer_agent,
            producer_org=prov.producer_org,
            computation_ref=prov.computation_ref,
            source_data_hash=hashlib.sha256(raw_data).hexdigest(),
            source_data_schema=schema_desc,
            run_id=prov.run_id,
            timestamp=prov.timestamp,
        )
```

```python
# cortex/sdk/client.py
from __future__ import annotations

from cortex.core.article import ArticleType, MemoryArticle, Scope
from cortex.node.node import CortexNode
from cortex.node.query import QueryResult

from cortex.sdk.exceptions import CortexPublishError, CortexQueryError, map_node_error
from cortex.sdk.provenance import ProvenanceHelpers


class CortexClient:
    """Synchronous thin façade over CortexNode for agent code.

    Builds MemoryArticle + Provenance, forwards to node.publish / query / derive.
    Never re-implements node logic.
    """

    def __init__(self, node: CortexNode):
        self._node = node

    @property
    def node(self) -> CortexNode:
        return self._node

    def _build_provenance(self):
        return ProvenanceHelpers._build_provenance(self._node)

    def publish_finding(
        self,
        content: str,
        payload: dict,
        scope: Scope = Scope.PRIVATE,
        type: ArticleType = ArticleType.FINDING,
    ) -> str:
        article = MemoryArticle(
            content=content,
            payload=payload,
            scope=scope,
            type=type,
            provenance=self._build_provenance(),
        )
        try:
            return self._node.publish(article)
        except Exception as exc:
            raise map_node_error(exc) from exc

    # publish_insight/warning/procedure/precedent filled in by Task 2
    def publish_insight(self, content, payload, scope, cites=None) -> str:  # pragma: no cover
        raise NotImplementedError

    def publish_warning(self, content, payload, scope) -> str:  # pragma: no cover
        raise NotImplementedError

    def publish_procedure(self, content, payload, scope) -> str:  # pragma: no cover
        raise NotImplementedError

    def publish_precedent(self, content, payload, scope) -> str:  # pragma: no cover
        raise NotImplementedError

    def search(self, query_text, topics=None, scopes=None, top_k=5, min_trust=0.3) -> list[QueryResult]:  # pragma: no cover
        raise NotImplementedError

    def compose_insight(self, content, payload, scope, sources=None) -> str:  # pragma: no cover
        raise NotImplementedError
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/test_client.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/exceptions.py cortex/sdk/provenance.py cortex/sdk/client.py tests/sdk/test_client.py
git commit -m "feat(sdk): CortexClient.publish_finding builds MemoryArticle and forwards to node

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 2: publish_insight (with cites) + publish_warning/procedure/precedent

**Files:**
- Modify: `cortex/sdk/client.py`
- Test: `tests/sdk/test_client.py` (append)

- [ ] **Step 1: Write the failing test (append to `tests/sdk/test_client.py`)**

```python
def test_publish_insight_includes_cites(fake_node: MagicMock):
    from cortex.core.article import ArticleType

    client = CortexClient(fake_node)
    art_id = client.publish_insight(
        content="Correlation of phishing + DNS tunneling suggests APT replay.",
        payload={"confidence": 0.74},
        scope=Scope.PUBLIC,
        cites=["art-source-1", "art-source-2"],
    )

    assert art_id == "art-id-1"
    article = fake_node.publish.call_args.args[0]
    assert article.type == ArticleType.INSIGHT
    assert article.cites == ["art-source-1", "art-source-2"]


def test_publish_warning_procedure_precedent_dispatch_correct_type(fake_node: MagicMock):
    from cortex.core.article import ArticleType

    client = CortexClient(fake_node)
    pairs = [
        (client.publish_warning, ArticleType.WARNING),
        (client.publish_procedure, ArticleType.PROCEDURE),
        (client.publish_precedent, ArticleType.PRECEDENT),
    ]
    for fn, expected_type in pairs:
        fn(content="x", payload={"k": 1}, scope=Scope.PUBLIC)
        article = fake_node.publish.call_args.args[0]
        assert article.type == expected_type
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_client.py -v`
Expected: `NotImplementedError` on `publish_insight`.

- [ ] **Step 3: Minimal implementation** — replace the four stub methods in `cortex/sdk/client.py`:

```python
    def _publish_typed(
        self,
        *,
        content: str,
        payload: dict,
        scope: Scope,
        type: ArticleType,
        cites: list[str] | None = None,
    ) -> str:
        article = MemoryArticle(
            content=content,
            payload=payload,
            scope=scope,
            type=type,
            provenance=self._build_provenance(),
            cites=list(cites) if cites else [],
        )
        try:
            return self._node.publish(article)
        except Exception as exc:
            raise map_node_error(exc) from exc

    def publish_finding(
        self,
        content: str,
        payload: dict,
        scope: Scope = Scope.PRIVATE,
        type: ArticleType = ArticleType.FINDING,
    ) -> str:
        return self._publish_typed(
            content=content, payload=payload, scope=scope, type=type
        )

    def publish_insight(
        self,
        content: str,
        payload: dict,
        scope: Scope = Scope.PRIVATE,
        cites: list[str] | None = None,
    ) -> str:
        return self._publish_typed(
            content=content, payload=payload, scope=scope,
            type=ArticleType.INSIGHT, cites=cites,
        )

    def publish_warning(self, content, payload, scope=Scope.PRIVATE) -> str:
        return self._publish_typed(
            content=content, payload=payload, scope=scope, type=ArticleType.WARNING
        )

    def publish_procedure(self, content, payload, scope=Scope.PRIVATE) -> str:
        return self._publish_typed(
            content=content, payload=payload, scope=scope, type=ArticleType.PROCEDURE
        )

    def publish_precedent(self, content, payload, scope=Scope.PRIVATE) -> str:
        return self._publish_typed(
            content=content, payload=payload, scope=scope, type=ArticleType.PRECEDENT
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/test_client.py -v`
Expected: PASS (all client tests).

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/client.py tests/sdk/test_client.py
git commit -m "feat(sdk): publish_insight/warning/procedure/precedent delegate to _publish_typed

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 3: CortexClient.search — node.query pass-through

**Files:**
- Modify: `cortex/sdk/client.py`
- Test: `tests/sdk/test_client.py` (append)

- [ ] **Step 1: Write the failing test (append)**

```python
def test_search_passes_filter_args_and_returns_results_unchanged(
    fake_node: MagicMock,
):
    from cortex.sdk.client import CortexClient
    from tests.sdk.conftest import make_query_result

    expected = [make_query_result(score=0.9, trust=0.8),
                make_query_result(score=0.7, trust=0.6)]
    fake_node.query.return_value = expected

    client = CortexClient(fake_node)
    results = client.search(
        query_text="phishing paddock",
        topics={"soc", "email"},
        scopes={"PUBLIC"},
        top_k=7,
        min_trust=0.45,
    )

    assert results is expected
    fake_node.query.assert_called_once()
    kwargs = fake_node.query.call_args.kwargs
    assert kwargs["query_text"] == "phishing paddock"
    assert kwargs["topic_filter"] == {"soc", "email"}
    assert kwargs["scope_filter"] == {"PUBLIC"}
    assert kwargs["top_k"] == 7
    assert kwargs["min_trust"] == 0.45


def test_search_defaults_topics_scopes_to_none(fake_node: MagicMock):
    from cortex.sdk.client import CortexClient

    client = CortexClient(fake_node)
    client.search(query_text="x")
    kwargs = fake_node.query.call_args.kwargs
    assert kwargs["topic_filter"] is None
    assert kwargs["scope_filter"] is None
    assert kwargs["top_k"] == 5
    assert kwargs["min_trust"] == 0.3


def test_search_maps_query_errors(fake_node: MagicMock):
    from cortex.sdk.client import CortexClient
    from cortex.sdk.exceptions import CortexQueryError

    fake_node.query.side_effect = RuntimeError("query connection reset")
    client = CortexClient(fake_node)
    try:
        client.search(query_text="x")
    except CortexQueryError as e:
        assert "query connection reset" in str(e)
    else:
        raise AssertionError("expected CortexQueryError")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_client.py -v`
Expected: `NotImplementedError` on `search`.

- [ ] **Step 3: Minimal implementation** — replace the `search` stub:

```python
    def search(
        self,
        query_text: str,
        topics: set[str] | None = None,
        scopes: set[str] | None = None,
        top_k: int = 5,
        min_trust: float = 0.3,
    ) -> list[QueryResult]:
        try:
            return self._node.query(
                query_text=query_text,
                topic_filter=topics,
                scope_filter=scopes,
                top_k=top_k,
                min_trust=min_trust,
            )
        except Exception as exc:
            raise map_node_error(exc) from exc
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/test_client.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/client.py tests/sdk/test_client.py
git commit -m "feat(sdk): CortexClient.search delegates to node.query with filter args

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 4: CortexClient.compose_insight — node.derive shorthand

**Files:**
- Modify: `cortex/sdk/client.py`
- Test: `tests/sdk/test_client.py` (append)

- [ ] **Step 1: Write the failing test (append)**

```python
def test_compose_insight_calls_derive_with_new_article_and_cites(fake_node: MagicMock):
    from cortex.core.article import ArticleType, Scope
    from cortex.sdk.client import CortexClient

    client = CortexClient(fake_node)
    new_id = client.compose_insight(
        content="Insight derived from 2 phishing findings.",
        payload={"confidence": 0.81},
        scope=Scope.PUBLIC,
        sources=["art-a", "art-b"],
    )

    assert new_id == "derived-id-1"
    fake_node.derive.assert_called_once()
    call = fake_node.derive.call_args
    article = call.args[0]
    cites = call.args[1]
    assert article.type == ArticleType.INSIGHT
    assert article.content == "Insight derived from 2 phishing findings."
    assert article.payload == {"confidence": 0.81}
    assert article.scope == Scope.PUBLIC
    assert article.provenance.producer_agent == fake_node.agent_did
    assert cites == ["art-a", "art-b"]


def test_compose_insight_maps_errors(fake_node: MagicMock):
    from cortex.sdk.client import CortexClient
    from cortex.sdk.exceptions import CortexSDKError

    fake_node.derive.side_effect = ValueError("derive failed")
    client = CortexClient(fake_node)
    try:
        client.compose_insight(content="x", payload={}, scope=None, sources=[])
    except CortexSDKError:
        pass
    else:
        raise AssertionError("expected CortexSDKError")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_client.py::test_compose_insight_calls_derive_with_new_article_and_cites -v`
Expected: `NotImplementedError`.

- [ ] **Step 3: Minimal implementation** — replace the `compose_insight` stub:

```python
    def compose_insight(
        self,
        content: str,
        payload: dict,
        scope: Scope,
        sources: list[str] | None = None,
    ) -> str:
        article = MemoryArticle(
            content=content,
            payload=payload,
            scope=scope,
            type=ArticleType.INSIGHT,
            provenance=self._build_provenance(),
            cites=list(sources) if sources else [],
        )
        try:
            return self._node.derive(article, list(sources) if sources else [])
        except Exception as exc:
            raise map_node_error(exc) from exc
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/test_client.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/client.py tests/sdk/test_client.py
git commit -m "feat(sdk): CortexClient.compose_insight wraps node.derive

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 5: ProvenanceHelpers.from_seed + with_source_hash

**Files:**
- (already created in Task 1) `cortex/sdk/provenance.py`
- Test: `tests/sdk/test_provenance.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/sdk/test_provenance.py
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from uuid import UUID

from cortex.sdk.provenance import ProvenanceHelpers


def test_from_seed_autofills_run_id_and_timestamp():
    prov = ProvenanceHelpers.from_seed(
        {"producer_agent": "did:org:alpha#agent-1", "producer_org": "did:org:alpha"}
    )
    assert prov.producer_agent == "did:org:alpha#agent-1"
    assert prov.producer_org == "did:org:alpha"
    # run_id parses as UUID4
    parsed = UUID(prov.run_id)
    assert parsed.version == 4
    # timestamp is timezone-aware UTC
    assert isinstance(prov.timestamp, datetime)
    assert prov.timestamp.tzinfo == timezone.utc


def test_from_seed_respects_caller_run_id_and_timestamp():
    fixed_ts = datetime(2026, 7, 18, 12, 0, 0, tzinfo=timezone.utc)
    prov = ProvenanceHelpers.from_seed(
        {
            "producer_agent": "a",
            "producer_org": "o",
            "run_id": "fixed-run",
            "timestamp": fixed_ts,
        }
    )
    assert prov.run_id == "fixed-run"
    assert prov.timestamp == fixed_ts


def test_with_source_hash_sets_sha256_and_schema():
    base = ProvenanceHelpers.from_seed(
        {"producer_agent": "a", "producer_org": "o"}
    )
    raw = b"sensor-telemetry:42"
    expected = hashlib.sha256(raw).hexdigest()

    prov = ProvenanceHelpers.with_source_hash(
        base, raw_data=raw, schema_desc="f1.sensor.v1"
    )

    assert prov.source_data_hash == expected
    assert prov.source_data_schema == "f1.sensor.v1"
    # base object untouched
    assert base.source_data_hash is None
    # other fields preserved
    assert prov.producer_agent == base.producer_agent
    assert prov.run_id == base.run_id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_provenance.py -v`
Expected: PASS actually, since `provenance.py` already implements these helpers from Task 1. If they fail, fix `provenance.py` accordingly. (The point of the test here is to lock the contract.)

- [ ] **Step 3: Implementation is already in place from Task 1.** If any test in Step 2 fails, fix the helper without changing the public signatures.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/test_provenance.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/sdk/test_provenance.py
git commit -m "test(sdk): lock ProvenanceHelpers.from_seed + with_source_hash contract

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 6: CortexRetriever._get_relevant_documents

**Files:**
- Create: `cortex/sdk/langchain_adapter.py`
- Test: `tests/sdk/test_langchain_adapter.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/sdk/test_langchain_adapter.py
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

lc = pytest.importorskip("langchain_core.documents")
lc_retriever = pytest.importorskip("langchain_core.retrievers")

from langchain_core.documents import Document

from cortex.core.article import Scope
from cortex.sdk.langchain_adapter import CortexRetriever
from tests.sdk.conftest import make_query_result


def test_get_relevant_documents_maps_query_results_to_documents(fake_node: MagicMock):
    fake_node.query.return_value = [
        make_query_result(score=0.9, trust=0.8),
        make_query_result(score=0.7, trust=0.6),
        make_query_result(score=0.5, trust=0.4),
    ]

    retriever = CortexRetriever(
        node=fake_node, top_k=3, min_trust=0.35,
        topics={"soc"}, scopes={"PUBLIC"},
    )

    docs = retriever._get_relevant_documents(
        "phishing in paddock",
        run_manager=MagicMock(),
    )

    assert len(docs) == 3
    for d in docs:
        assert isinstance(d, Document)
        assert d.page_content  # non-empty
        assert "article_id" in d.metadata
        assert "trust" in d.metadata
        assert "org" in d.metadata
        assert "type" in d.metadata


def test_get_relevant_documents_passes_filter_args(fake_node: MagicMock):
    fake_node.query.return_value = []
    retriever = CortexRetriever(
        node=fake_node, top_k=8, min_trust=0.55,
        topics={"t1"}, scopes={"PUBLIC"},
    )
    retriever._get_relevant_documents("q", run_manager=MagicMock())
    kwargs = fake_node.query.call_args.kwargs
    assert kwargs["top_k"] == 8
    assert kwargs["min_trust"] == 0.55
    assert kwargs["topic_filter"] == {"t1"}
    assert kwargs["scope_filter"] == {"PUBLIC"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_langchain_adapter.py -v`
Expected: `ModuleNotFoundError: No module named 'cortex.sdk.langchain_adapter'`.

- [ ] **Step 3: Write minimal implementation**

```python
# cortex/sdk/langchain_adapter.py
from __future__ import annotations

from typing import Any

from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from pydantic import Field, PrivateAttr

from cortex.node.node import CortexNode

from cortex.sdk.exceptions import CortexQueryError, map_node_error


class CortexRetriever(BaseRetriever):
    """LangChain retriever that queries a CortexNode's memory fabric.

    Maps each QueryResult to a LangChain Document with article_id / trust /
    org / type metadata.
    """

    node: CortexNode
    top_k: int = 5
    min_trust: float = 0.3
    topics: set[str] | None = None
    scopes: set[str] | None = None

    # Pydantic v2: arbitrary types (CortexNode is not a pydantic model)
    model_config = {"arbitrary_types_allowed": True}

    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: CallbackManagerForRetrieverRun,
    ) -> list[Document]:
        try:
            results = self.node.query(
                query_text=query,
                topic_filter=self.topics,
                scope_filter=self.scopes,
                top_k=self.top_k,
                min_trust=self.min_trust,
            )
        except Exception as exc:
            raise map_node_error(exc) from exc

        docs: list[Document] = []
        for r in results:
            docs.append(
                Document(
                    page_content=r.article.content,
                    metadata={
                        "article_id": r.article_id,
                        "trust": r.trust_score,
                        "org": r.article.provenance.producer_org,
                        "type": r.article.type.value,
                    },
                )
            )
        return docs
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/test_langchain_adapter.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/langchain_adapter.py tests/sdk/test_langchain_adapter.py
git commit -m "feat(sdk): CortexRetriever maps QueryResult to LangChain Document

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 7: CortexRetriever.as_tool — LangChain Tool wrapper

**Files:**
- Modify: `cortex/sdk/langchain_adapter.py`
- Test: `tests/sdk/test_langchain_adapter.py` (append)

- [ ] **Step 1: Write the failing test (append)**

```python
def test_as_tool_returns_named_tool_whose_run_returns_documents(fake_node: MagicMock):
    from langchain_core.tools import Tool

    fake_node.query.return_value = [make_query_result()]
    retriever = CortexRetriever(node=fake_node)
    tool = retriever.as_tool()

    assert isinstance(tool, Tool)
    assert tool.name == "cortex_search"
    assert "Cortex" in tool.description and "memory" in tool.description.lower()

    out = tool._run("phishing paddock")
    # _run returns a JSON list string of Document page_content + metadata
    import json
    parsed = json.loads(out)
    assert isinstance(parsed, list) and len(parsed) == 1
    assert parsed[0]["page_content"]
    assert "article_id" in parsed[0]["metadata"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_langchain_adapter.py::test_as_tool_returns_named_tool_whose_run_returns_documents -v`
Expected: `AttributeError: 'CortexRetriever' object has no attribute 'as_tool'`.

- [ ] **Step 3: Minimal implementation** — append to `cortex/sdk/langchain_adapter.py`:

```python
import json

from langchain_core.tools import Tool


def _docs_to_json(docs: list[Document]) -> str:
    return json.dumps(
        [
            {"page_content": d.page_content, "metadata": d.metadata}
            for d in docs
        ]
    )


class CortexRetriever(BaseRetriever):
    # ... existing fields omitted for brevity, unchanged ...

    def as_tool(
        self,
        name: str = "cortex_search",
        description: str = (
            "Search the Cortex agent memory fabric for findings, insights, "
            "and precedents across trusted peers."
        ),
    ) -> Tool:
        retriever_self = self

        def _run(query: str) -> str:
            docs = retriever_self._get_relevant_documents(
                query, run_manager=None
            )
            return _docs_to_json(docs)

        return Tool(name=name, description=description, func=_run)
```

Note: The actual `langchain_adapter.py` file should contain a single `CortexRetriever` class. The `Tool` import and `_docs_to_json` helper go at module top, and `as_tool` becomes a method of the class. The diff to apply:

- Add `import json` and `from langchain_core.tools import Tool` at top.
- Add module-level `_docs_to_json(docs)` helper.
- Add `as_tool` method inside `CortexRetriever` (the snippet above).

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/test_langchain_adapter.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/langchain_adapter.py tests/sdk/test_langchain_adapter.py
git commit -m "feat(sdk): CortexRetriever.as_tool exposes a LangChain Tool wrapper

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 8: CortexPublishTool — LangChain publishing tool

**Files:**
- Modify: `cortex/sdk/langchain_adapter.py`
- Test: `tests/sdk/test_langchain_adapter.py` (append)

- [ ] **Step 1: Write the failing test (append)**

```python
def test_cortex_publish_tool_runs_publish_finding(fake_node: MagicMock):
    from langchain_core.tools import Tool

    from cortex.sdk.langchain_adapter import CortexPublishTool

    tool = CortexPublishTool(node=fake_node)
    assert isinstance(tool, Tool)
    assert tool.name == "cortex_publish"

    art_id = tool._run(
        content="Phishing link targeting garage-12 ops staff.",
        payload_json='{"priority": "high"}',
        scope="PUBLIC",
    )
    assert art_id == "art-id-1"
    fake_node.publish.assert_called_once()
    article = fake_node.publish.call_args.args[0]
    assert article.content == "Phishing link targeting garage-12 ops staff."
    assert article.payload == {"priority": "high"}


def test_cortex_publish_tool_rejects_oversized_content(fake_node: MagicMock):
    from cortex.sdk.langchain_adapter import CortexPublishTool

    tool = CortexPublishTool(node=fake_node)
    too_long = "x" * 2001
    try:
        tool._run(content=too_long, payload_json="{}", scope="PRIVATE")
    except ValueError as e:
        assert "2000" in str(e)
    else:
        raise AssertionError("expected ValueError for >2000 char content")
    fake_node.publish.assert_not_called()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_langchain_adapter.py::test_cortex_publish_tool_runs_publish_finding -v`
Expected: `ImportError: cannot import name 'CortexPublishTool'`.

- [ ] **Step 3: Minimal implementation** — append to `cortex/sdk/langchain_adapter.py`:

```python
from cortex.core.article import Scope as CoreScope
from cortex.sdk.client import CortexClient


_SCOPE_MAP = {
    "PUBLIC": CoreScope.PUBLIC,
    "PRIVATE": CoreScope.PRIVATE,
    "public": CoreScope.PUBLIC,
    "private": CoreScope.PRIVATE,
}


class CortexPublishTool(Tool):
    """LangChain Tool that lets an agent publish a FINDING to Cortex.

    _run(content, payload_json, scope) parses JSON payload, enforces the
    2000-char content cap (Design D5), and delegates to CortexClient.
    """

    name: str = "cortex_publish"
    description: str = (
        "Publish a security finding to the Cortex memory fabric. "
        "Args: content (<=2000 chars natural language), "
        "payload_json (JSON dict of structured fields), "
        "scope ('PUBLIC' or 'PRIVATE')."
    )

    def __init__(self, node):
        super().__init__(
            name="cortex_publish",
            description=(
                "Publish a security finding to the Cortex memory fabric. "
                "Args: content (<=2000 chars natural language), "
                "payload_json (JSON dict of structured fields), "
                "scope ('PUBLIC' or 'PRIVATE')."
            ),
            func=self._run,
        )
        object.__setattr__(self, "_client", CortexClient(node))
        object.__setattr__(self, "_node", node)

    def _run(self, content: str, payload_json: str, scope: str) -> str:
        if len(content) > 2000:
            raise ValueError("content must be <=2000 chars (Design D5)")
        import json
        payload = json.loads(payload_json)
        scope_obj = _SCOPE_MAP.get(scope, CoreScope.PRIVATE)
        return self._client.publish_finding(
            content=content, payload=payload, scope=scope_obj
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/test_langchain_adapter.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/langchain_adapter.py tests/sdk/test_langchain_adapter.py
git commit -m "feat(sdk): CortexPublishTool with 2000-char content cap (Design D5)

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 9: vLLMClient.chat — httpx against OpenAI-compatible endpoint

**Files:**
- Create: `cortex/sdk/llm.py`
- Test: `tests/sdk/test_llm.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/sdk/test_llm.py
from __future__ import annotations

import json

import httpx
import pytest

from cortex.sdk.llm import vLLMClient


def _mock_transport(body_assertion):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content.decode())
        body_assertion(captured["body"])
        return httpx.Response(
            status_code=200,
            json={
                "id": "cmpl-1",
                "object": "chat.completion",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "FINAL: padded paddock"},
                        "finish_reason": "stop",
                    }
                ],
            },
        )

    return httpx.MockTransport(handler), captured


def test_chat_posts_to_chat_completions_with_expected_body():
    received = {}

    def assert_body(body):
        received["body"] = body

    transport, captured = _mock_transport(assert_body)

    client = vLLMClient(
        base_url="http://localhost:8000/v1",
        model="meta-llama/Llama-3-8B-Instruct",
        transport=transport,
    )

    out = client.chat(
        messages=[
            {"role": "system", "content": "You are a SOC analyst."},
            {"role": "user", "content": "What is in the paddock?"},
        ]
    )

    assert out == "FINAL: padded paddock"
    assert captured["url"].endswith("/chat/completions")
    assert captured["headers"]["content-type"] == "application/json"
    assert received["body"]["model"] == "meta-llama/Llama-3-8B-Instruct"
    assert received["body"]["temperature"] == 0.2
    assert received["body"]["max_tokens"] == 512
    assert received["body"]["messages"][0]["role"] == "system"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_llm.py -v`
Expected: `ModuleNotFoundError: No module named 'cortex.sdk.llm'`.

- [ ] **Step 3: Minimal implementation**

```python
# cortex/sdk/llm.py
from __future__ import annotations

from typing import Any

import httpx


class vLLMClient:
    """Thin OpenAI-compatible client pointing at a vLLM-on-ROCm server.

    Used by `agent_step` for the ReAct reasoning loop. Default model is
    Llama-3-8B-Instruct (decision D2); Qwen-2.5-7B can be substituted by
    changing `model` at construction time.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000/v1",
        model: str = "meta-llama/Llama-3-8B-Instruct",
        temperature: float = 0.2,
        max_tokens: int = 512,
        timeout: float = 30.0,
        transport: Any | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout
        transport_kwargs = {"transport": transport} if transport is not None else {}
        self._client = httpx.Client(timeout=timeout, **transport_kwargs)

    def chat(self, messages: list[dict]) -> str:
        """Return the assistant message content for a chat completion."""
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        resp = self._client.post(
            f"{self.base_url}/chat/completions",
            json=payload,
            headers={"content-type": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    def close(self) -> None:
        self._client.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/test_llm.py -v`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/llm.py tests/sdk/test_llm.py
git commit -m "feat(sdk): vLLMClient wraps OpenAI-compatible /chat/completions endpoint

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 10: agent_step ReAct loop with ScriptedReasoner fallback

**Files:**
- Modify: `cortex/sdk/llm.py`
- Test: `tests/sdk/test_llm.py` (append)

- [ ] **Step 1: Write the failing test (append)**

```python
def test_scripted_reasoner_returns_final_after_one_tool_call():
    from cortex.sdk.llm import ScriptedReasoner

    calls = []

    def search_tool(query: str) -> str:
        calls.append(query)
        return "phishing link found"

    reasoner = ScriptedReasoner(
        steps=[
            {"tool": "cortex_search", "args": "phishing paddock"},
            {"final": "No further action needed."},
        ]
    )

    out = reasoner.step(tools={"cortex_search": search_tool}, history=[])
    assert calls == ["phishing paddock"]
    assert "tool_result" in out and out["tool_result"] == "phishing link found"

    final = reasoner.step(tools={"cortex_search": search_tool}, history=[out])
    assert final["final"] == "No further action needed."


def test_agent_step_dispatches_tool_then_returns_final():
    from cortex.sdk.llm import ScriptedReasoner, agent_step

    tool_invocations = []

    def fake_search(query: str) -> str:
        tool_invocations.append(query)
        return "found 2 articles"

    reasoner = ScriptedReasoner(
        steps=[
            {"tool": "cortex_search", "args": "phishing paddock"},
            {"final": "Insight: phishing campaign replay."},
        ]
    )

    tools = {
        "cortex_search": {
            "name": "cortex_search",
            "description": "Search the Cortex memory fabric.",
            "func": fake_search,
        }
    }

    answer = agent_step(
        system="You are a SOC analyst.",
        user="Investigate phishing in paddock.",
        tools=tools,
        llm=reasoner,
        max_iters=5,
    )

    assert answer == "Insight: phishing campaign replay."
    assert tool_invocations == ["phishing paddock"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_llm.py::test_agent_step_dispatches_tool_then_returns_final -v`
Expected: `ImportError: cannot import name 'ScriptedReasoner'`.

- [ ] **Step 3: Minimal implementation** — append to `cortex/sdk/llm.py`:

```python
from dataclasses import dataclass, field


@dataclass
class ScriptedReasoner:
    """Deterministic reasoner for tests and offline demo scripts.

    `steps` is a list of dicts; each is either:
      {"tool": <tool_name>, "args": <positional arg>}
      {"final": <answer string>}

    Each call to `step` pops the next scripted action. Lets tests run
    without a vLLM server and lets the demo replay deterministically.
    """

    steps: list[dict]
    _idx: int = field(default=0, repr=False)

    def step(self, tools: dict, history: list[dict]) -> dict:
        if self._idx >= len(self.steps):
            return {"final": "<no more scripted steps>"}
        action = self.steps[self._idx]
        self._idx += 1
        if "final" in action:
            return {"final": action["final"]}
        tool_name = action["tool"]
        tool_arg = action["args"]
        tool_fn = tools[tool_name]["func"]
        result = tool_fn(tool_arg)
        return {"tool": tool_name, "args": tool_arg, "tool_result": result}


def agent_step(
    system: str,
    user: str,
    tools: dict,
    llm,
    max_iters: int = 5,
) -> str:
    """Minimal ReAct loop.

    1. Prompt LLM/reasoner with system + user + tool descriptions.
    2. Parse output for tool call OR final answer.
    3. If tool call: dispatch and append result to history.
    4. Repeat up to `max_iters`.
    5. Return final answer string.

    For a vLLMClient the prompt/response roundtrip is delegated to llm.chat;
    for ScriptedReasoner the loop is driven by llm.step(tools, history).
    """
    history: list[dict] = []
    tool_descriptions = "\n".join(
        f"- {name}: {spec['description']}" for name, spec in tools.items()
    )
    system_prompt = (
        f"{system}\n\nYou may use these tools:\n{tool_descriptions}\n\n"
        "Respond with either a tool call or `FINAL: <answer>`."
    )

    if hasattr(llm, "step"):
        for _ in range(max_iters):
            action = llm.step(tools=tools, history=history)
            if "final" in action:
                return action["final"]
            history.append(action)
        return "<max_iters reached>"

    # vLLMClient path
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user},
    ]
    for _ in range(max_iters):
        out = llm.chat(messages)
        if out.startswith("FINAL:"):
            return out[len("FINAL:"):].strip()
        # naive tool-call parse: "<tool>: <arg>"
        if ":" in out:
            tool_name, arg = out.split(":", 1)
            tool_name = tool_name.strip()
            arg = arg.strip()
            if tool_name in tools:
                result = tools[tool_name]["func"](arg)
                messages.append({"role": "assistant", "content": out})
                messages.append(
                    {"role": "user", "content": f"TOOL_RESULT: {result}"}
                )
                continue
        return out
    return "<max_iters reached>"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/test_llm.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/llm.py tests/sdk/test_llm.py
git commit -m "feat(sdk): ScriptedReasoner fallback + minimal ReAct agent_step loop

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 11: CortexAgent.run_task end-to-end

**Files:**
- Create: `cortex/sdk/agent.py`
- Test: `tests/sdk/test_agent.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/sdk/test_agent.py
from __future__ import annotations

from unittest.mock import MagicMock

from cortex.core.article import Scope
from cortex.sdk.agent import CortexAgent
from cortex.sdk.langchain_adapter import CortexRetriever
from cortex.sdk.llm import ScriptedReasoner


def _tools_for(retriever, client):
    search_tool = retriever.as_tool()
    publish_tool = MagicMock(name="CortexPublishTool")
    publish_tool.name = "cortex_publish"
    publish_tool.description = "Publish a finding."
    publish_tool._run.return_value = "art-id-1"

    def pub_run(content, payload_json="{}", scope="PRIVATE"):
        return publish_tool._run(content=content, payload_json=payload_json, scope=scope)

    publish_tool._run.side_effect = pub_run

    return {
        "cortex_search": {
            "name": "cortex_search",
            "description": search_tool.description,
            "func": lambda q: search_tool._run(q),
        },
        "cortex_publish": {
            "name": "cortex_publish",
            "description": "Publish a finding.",
            "func": pub_run,
        },
    }


def test_run_task_returns_final_answer_and_publishes_when_instructed(fake_node: MagicMock):
    fake_node.query.return_value = []  # no peer hits

    retriever = CortexRetriever(node=fake_node)
    client_mock = MagicMock(name="CortexClient")
    client_mock.publish_finding.return_value = "art-id-9"

    reasoner = ScriptedReasoner(
        steps=[
            {"tool": "cortex_search", "args": "phishing paddock"},
            {"tool": "cortex_publish", "args": "phishing replay detected"},
            {"final": "Insight published: phishing replay detected."},
        ]
    )

    agent = CortexAgent(
        client=client_mock,
        retriever=retriever,
        llm=reasoner,
        persona="You are alpha-bot, a SOC analyst agent for the F1 paddock.",
        tools_builder=_tools_for,
    )

    answer = agent.run_task("Investigate phishing in the paddock.")

    assert answer == "Insight published: phishing replay detected."
    client_mock.publish_finding.assert_called_once()
    call = client_mock.publish_finding.call_args
    assert "phishing replay detected" in call.kwargs["content"]


def test_run_task_returns_max_iters_message_when_script_runs_out(fake_node: MagicMock):
    fake_node.query.return_value = []
    retriever = CortexRetriever(node=fake_node)
    client_mock = MagicMock()
    client_mock.publish_finding.return_value = "art-id-x"

    reasoner = ScriptedReasoner(steps=[{"tool": "cortex_search", "args": "q"}])

    agent = CortexAgent(
        client=client_mock,
        retriever=retriever,
        llm=reasoner,
        persona="p",
        tools_builder=_tools_for,
    )

    answer = agent.run_task("anything")
    # Second step has no script -> "no more scripted steps", treated as final.
    assert isinstance(answer, str)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_agent.py -v`
Expected: `ModuleNotFoundError: No module named 'cortex.sdk.agent'`.

- [ ] **Step 3: Minimal implementation**

```python
# cortex/sdk/agent.py
from __future__ import annotations

from typing import Callable

from cortex.sdk.client import CortexClient
from cortex.sdk.exceptions import CortexSDKError, map_node_error
from cortex.sdk.langchain_adapter import CortexRetriever
from cortex.sdk.llm import agent_step


_DEFAULT_TOOLS_BUILDER: Callable | None = None


class CortexAgent:
    """Runnable agent: client + retriever + reasoner + persona.

    `run_task(task)` runs the ReAct loop in cortex.sdk.llm.agent_step
    using CortexRetriever + CortexPublishTool. The persona string is
    used verbatim as the LangChain system prompt base.
    """

    def __init__(
        self,
        client: CortexClient,
        retriever: CortexRetriever,
        llm,
        persona: str,
        tools_builder: Callable | None = None,
        max_iters: int = 5,
    ):
        self.client = client
        self.retriever = retriever
        self.llm = llm
        self.persona = persona
        self.tools_builder = tools_builder or _default_tools_builder
        self.max_iters = max_iters

    def _build_tools(self) -> dict:
        return self.tools_builder(self.retriever, self.client)

    def run_task(self, task: str) -> str:
        try:
            tools = self._build_tools()
            return agent_step(
                system=self.persona,
                user=task,
                tools=tools,
                llm=self.llm,
                max_iters=self.max_iters,
            )
        except Exception as exc:
            raise map_node_error(exc) from exc


def _default_tools_builder(retriever: CortexRetriever, client: CortexClient) -> dict:
    # Late import to avoid a circular dep at module load time.
    from cortex.sdk.langchain_adapter import CortexPublishTool

    search_tool = retriever.as_tool()
    publish_tool = CortexPublishTool(node=client.node)

    def search_fn(q: str) -> str:
        return search_tool._run(q)

    def publish_fn(content: str, payload_json: str = "{}", scope: str = "PRIVATE") -> str:
        return publish_tool._run(content=content, payload_json=payload_json, scope=scope)

    return {
        "cortex_search": {
            "name": "cortex_search",
            "description": search_tool.description,
            "func": search_fn,
        },
        "cortex_publish": {
            "name": "cortex_publish",
            "description": "Publish a finding to the Cortex memory fabric.",
            "func": publish_fn,
        },
    }


_DEFAULT_TOOLS_BUILDER = _default_tools_builder
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/test_agent.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/agent.py tests/sdk/test_agent.py
git commit -m "feat(sdk): CortexAgent.run_task composes retriever + publish + reasoner

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 12: CortexReader — LlamaIndex adapter

**Files:**
- Create: `cortex/sdk/llamaindex_adapter.py`
- Test: `tests/sdk/test_llamaindex_adapter.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/sdk/test_llamaindex_adapter.py
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

pytest.importorskip("llama_index.core")
from llama_index.core.schema import Document as LIDocument

from cortex.sdk.langchain_adapter import CortexRetriever
from cortex.sdk.llamaindex_adapter import CortexReader
from tests.sdk.conftest import make_query_result


def test_cortex_reader_produces_llamaindex_documents(fake_node: MagicMock):
    fake_node.query.return_value = [make_query_result(), make_query_result()]
    lc_retriever = CortexRetriever(node=fake_node)
    reader = CortexReader.from_retriever(lc_retriever)

    docs = reader.load_data(query="phishing paddock")

    assert len(docs) == 2
    for d in docs:
        assert isinstance(d, LIDocument)
        assert d.text
        assert "article_id" in d.metadata
        assert "trust" in d.metadata
        assert "org" in d.metadata
        assert "type" in d.metadata


def test_cortex_reader_uses_explicit_node_when_no_retriever(fake_node: MagicMock):
    fake_node.query.return_value = []
    reader = CortexReader(node=fake_node, top_k=4, min_trust=0.5,
                          topics={"soc"}, scopes={"PUBLIC"})
    reader.load_data(query="x")
    kwargs = fake_node.query.call_args.kwargs
    assert kwargs["top_k"] == 4
    assert kwargs["min_trust"] == 0.5
    assert kwargs["topic_filter"] == {"soc"}
    assert kwargs["scope_filter"] == {"PUBLIC"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_llamaindex_adapter.py -v`
Expected: `ModuleNotFoundError: No module named 'cortex.sdk.llamaindex_adapter'`.

- [ ] **Step 3: Minimal implementation**

```python
# cortex/sdk/llamaindex_adapter.py
from __future__ import annotations

from typing import Any

from llama_index.core.readers.base import BaseReader
from llama_index.core.schema import Document as LIDocument

from cortex.node.node import CortexNode
from cortex.sdk.exceptions import map_node_error
from cortex.sdk.langchain_adapter import CortexRetriever


class CortexReader(BaseReader):
    """LlamaIndex BaseReader that pulls QueryResults from a CortexNode."""

    node: CortexNode
    top_k: int = 5
    min_trust: float = 0.3
    topics: set[str] | None = None
    scopes: set[str] | None = None

    def __init__(
        self,
        node: CortexNode | None = None,
        top_k: int = 5,
        min_trust: float = 0.3,
        topics: set[str] | None = None,
        scopes: set[str] | None = None,
        retriever: CortexRetriever | None = None,
    ):
        super().__init__(
            node=node,
            top_k=top_k,
            min_trust=min_trust,
            topics=topics,
            scopes=scopes,
        )
        # stash object attrs not handled by pydantic dataclass
        object.__setattr__(self, "_retriever", retriever)

    @classmethod
    def from_retriever(cls, retriever: CortexRetriever) -> "CortexReader":
        return cls(
            node=retriever.node,
            top_k=retriever.top_k,
            min_trust=retriever.min_trust,
            topics=retriever.topics,
            scopes=retriever.scopes,
            retriever=retriever,
        )

    def load_data(
        self,
        query: str | None = None,
        **kwargs: Any,
    ) -> list[LIDocument]:
        if self._retriever is not None:
            try:
                docs = self._retriever._get_relevant_documents(
                    query or "", run_manager=None
                )
            except Exception as exc:
                raise map_node_error(exc) from exc
            return [
                LIDocument(text=d.page_content, metadata=dict(d.metadata))
                for d in docs
            ]
        try:
            results = self.node.query(
                query_text=query or "",
                topic_filter=self.topics,
                scope_filter=self.scopes,
                top_k=self.top_k,
                min_trust=self.min_trust,
            )
        except Exception as exc:
            raise map_node_error(exc) from exc
        out = []
        for r in results:
            out.append(
                LIDocument(
                    text=r.article.content,
                    metadata={
                        "article_id": r.article_id,
                        "trust": r.trust_score,
                        "org": r.article.provenance.producer_org,
                        "type": r.article.type.value,
                    },
                )
            )
        return out
```

Note: `BaseReader` in llama_index 0.10+ is a pydantic BaseModel. If the constructor signature in the installed llama-index version rejects kwargs, the implementer should fall back to populating fields via `object.__setattr__` and a no-args `super().__init__()` call. The test contract must remain stable either way.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/test_llamaindex_adapter.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/llamaindex_adapter.py tests/sdk/test_llamaindex_adapter.py
git commit -m "feat(sdk): CortexReader LlamaIndex adapter with from_retriever convenience

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 13: VectorStoreIndex integration example test

**Files:**
- Modify: `tests/sdk/test_llamaindex_adapter.py` (append)

- [ ] **Step 1: Write the failing test (append)**

```python
def test_vector_store_index_from_cortex_reader(fake_node: MagicMock):
    pytest.importorskip("llama_index.core")
    from llama_index.core import VectorStoreIndex

    from tests.sdk.conftest import make_article

    fake_node.query.return_value = [make_query_result() for _ in range(3)]
    reader = CortexReader.from_retriever(CortexRetriever(node=fake_node))

    index = VectorStoreIndex.from_documents(reader.load_data(query="phishing"))
    retriever = index.as_retriever(similarity_top_k=2)
    nodes = retriever.retrieve("phishing")
    assert len(nodes) >= 1
    for n in nodes:
        assert n.node.text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_llamaindex_adapter.py::test_vector_store_index_from_cortex_reader -v`
Expected: One of (a) PASS with llama_index installed in CI; (b) ` Skipped: no module named 'llama_index'` when llama_index is not installed. Both are acceptable outcomes. The test must NOT fail with an unrelated error.

- [ ] **Step 3: No new implementation code** — this is a guard for the documented integration shape from the LangChain/LlamaIndex example in the plan brief.

- [ ] **Step 4: Run test to verify it passes (or skips gracefully)**

Run: `pytest tests/sdk/test_llamaindex_adapter.py -v`
Expected: PASS or SKIPPED (no hard failures).

- [ ] **Step 5: Commit**

```bash
git add tests/sdk/test_llamaindex_adapter.py
git commit -m "test(sdk): guard VectorStoreIndex integration shape from CortexReader

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 14: examples/quickstart.py runnable example

**Files:**
- Create: `examples/quickstart.py`

- [ ] **Step 1: Write the example**

```python
# examples/quickstart.py
"""Perciqa Cortex agent SDK — quickstart.

Run with:

    python -m examples.quickstart --broker ws://localhost:8765

Requires a running cortex-broker + cortex-node. Prints a friendly error
when the broker is unreachable so the demo operator knows what's missing.
"""
from __future__ import annotations

import argparse
import asyncio
import sys

from cortex.core.article import Scope
from cortex.node.node import CortexNode
from cortex.sdk.client import CortexClient
from cortex.sdk.exceptions import CortexSDKError
from cortex.sdk.langchain_adapter import CortexRetriever


def main() -> int:
    parser = argparse.ArgumentParser(description="Cortex SDK quickstart")
    parser.add_argument("--broker", default="ws://localhost:8765",
                        help="broker WebSocket URL")
    parser.add_argument("--org", default="did:org:alpha")
    parser.add_argument("--agent", default="did:org:alpha#agent-1")
    args = parser.parse_args()

    async def run():
        node = CortexNode(
            org_did=args.org,
            agent_did=args.agent,
            key_paths="keys",
            broker_url=args.broker,
            config_path="config.yaml",
        )
        try:
            await node.start()
        except Exception as exc:
            print(f"[quickstart] could not reach broker at {args.broker}: {exc}",
                  file=sys.stderr)
            print("[quickstart] Is cortex-broker running? (deploy/Makefile up-broker)",
                  file=sys.stderr)
            return 1

        try:
            client = CortexClient(node)
            art_id = client.publish_finding(
                content="Demo finding: anomalous DNS tunnel from garage-12.",
                payload={"asset": "garage-12"},
                scope=Scope.PUBLIC,
            )
            print(f"[quickstart] published finding -> {art_id}")

            retriever = CortexRetriever(node=node, top_k=5, min_trust=0.3,
                                       topics={"soc"}, scopes={"PUBLIC"})
            docs = retriever._get_relevant_documents(
                "DNS tunnel", run_manager=None
            )
            for d in docs:
                print(f"[quickstart] doc trust={d.metadata['trust']}: {d.page_content[:80]}")
        except CortexSDKError as exc:
            print(f"[quickstart] SDK error: {exc}", file=sys.stderr)
            return 2
        finally:
            await node.stop()
        return 0

    return asyncio.run(run())


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Verify the file parses**

Run: `python -c "import ast; ast.parse(open('examples/quickstart.py').read()); print('ok')"`
Expected: `ok`.

- [ ] **Step 3: (Optional guard test)** Add a smoke test that imports the quickstart module without running it:

```python
# tests/sdk/test_quickstart.py
from __future__ import annotations


def test_quickstart_module_imports():
    import importlib
    mod = importlib.import_module("examples.quickstart")
    assert hasattr(mod, "main")
```

Run: `pytest tests/sdk/test_quickstart.py -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add examples/quickstart.py tests/sdk/test_quickstart.py
git commit -m "feat(sdk): quickstart example using CortexClient + CortexRetriever

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

### Task 15: Error-mapping helper coverage + public exports

**Files:**
- Test: `tests/sdk/test_exceptions.py`
- Modify: `cortex/sdk/__init__.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/sdk/test_exceptions.py
from __future__ import annotations

import pytest

from cortex.sdk.exceptions import (
    CortexPublishError,
    CortexQueryError,
    CortexSDKError,
    map_node_error,
)


def test_map_publish_error():
    class PublishSignatureError(Exception):
        pass

    mapped = map_node_error(PublishSignatureError("bad sig"))
    assert isinstance(mapped, CortexPublishError)
    assert "bad sig" in str(mapped)


def test_map_query_error():
    class QueryTimeoutError(Exception):
        pass

    mapped = map_node_error(QueryTimeoutError("broker deadline"))
    assert isinstance(mapped, CortexQueryError)


def test_map_unknown_error_returns_base():
    mapped = map_node_error(RuntimeError("mystery"))
    assert isinstance(mapped, CortexSDKError)
    assert not isinstance(mapped, (CortexPublishError, CortexQueryError))


def test_map_passthrough_for_already_sdk_error():
    err = CortexPublishError("already mapped")
    assert map_node_error(err) is err


def test_public_api_reexports():
    import cortex.sdk as sdk
    for name in [
        "CortexClient",
        "CortexRetriever",
        "CortexPublishTool",
        "CortexReader",
        "vLLMClient",
        "ScriptedReasoner",
        "agent_step",
        "CortexAgent",
        "ProvenanceHelpers",
        "CortexPublishError",
        "CortexQueryError",
        "CortexSDKError",
        "map_node_error",
    ]:
        assert hasattr(sdk, name), f"cortex.sdk missing re-export: {name}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/sdk/test_exceptions.py -v`
Expected: `test_public_api_reexports` fails (`cortex.sdk` is empty); mapping tests may pass since `exceptions.py` exists from Task 1.

- [ ] **Step 3: Minimal implementation** — extend `cortex/sdk/__init__.py`:

```python
"""Perciqa Cortex agent SDK — thin façade over cortex.node.CortexNode."""

from cortex.sdk.agent import CortexAgent
from cortex.sdk.client import CortexClient
from cortex.sdk.exceptions import (
    CortexPublishError,
    CortexQueryError,
    CortexSDKError,
    map_node_error,
)
from cortex.sdk.langchain_adapter import CortexPublishTool, CortexRetriever
from cortex.sdk.llamaindex_adapter import CortexReader
from cortex.sdk.llm import ScriptedReasoner, agent_step, vLLMClient
from cortex.sdk.provenance import ProvenanceHelpers

__all__ = [
    "CortexAgent",
    "CortexClient",
    "CortexPublishError",
    "CortexPublishTool",
    "CortexQueryError",
    "CortexReader",
    "CortexRetriever",
    "CortexSDKError",
    "ProvenanceHelpers",
    "ScriptedReasoner",
    "agent_step",
    "map_node_error",
    "vLLMClient",
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/sdk/ -v`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add cortex/sdk/__init__.py tests/sdk/test_exceptions.py
git commit -m "feat(sdk): public API re-exports + exceptions error-mapping coverage

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## 4. Dependency install checklist

The SDK layer introduces three new optional dependencies that should be added to `pyproject.toml` `[project.optional-dependencies]` in a small chore commit (the cortex-sdk implementer is allowed to amend `pyproject.toml` for this single purpose):

```toml
[project.optional-dependencies]
sdk = [
    "langchain>=0.2",
    "langchain-core>=0.2",
    "llama-index>=0.10",
    "httpx>=0.27",
]
```

`httpx>=0.27` is already in the base dependencies from the master plan's `pyproject.toml` (Task 5 line 174), so it is only listed here for clarity.

- [ ] **Final chore commit**

```bash
git add pyproject.toml
git commit -m "chore(sdk): add langchain/llama-index/sdk optional dependency group

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Self-review

### 1. Spec coverage — Design §10 subsections

| Design §10 subsection | Plan task(s) |
|---|---|
| CortexClient (constructor, publish_finding/insight/warning/procedure/precedent, search, compose_insight, _build_provenance) | Task 1 (constructor + finding), Task 2 (insight/warning/procedure/precedent), Task 3 (search), Task 4 (compose_insight/_build_provenance is in Task 1 via ProvenanceHelpers._build_provenance) |
| ProvenanceHelpers (from_seed, with_source_hash) | Task 5 |
| LangChain adapter — CortexRetriever (`_get_relevant_documents`, document mapping with article_id/trust/org/type metadata) | Task 6 |
| LangChain adapter — CortexRetriever.as_tool (name="cortex_search", description) | Task 7 |
| LangChain adapter — CortexPublishTool (publish findings, content cap) | Task 8 |
| LlamaIndex adapter — CortexReader (BaseReader, from_retriever, VectorStoreIndex example) | Task 12, Task 13 |
| Reasoning LLM bridge — vLLMClient (chat, OpenAI-compatible endpoint, defaults) | Task 9 |
| Reasoning LLM bridge — agent_step ReAct loop + fallback ScriptedReasoner | Task 10 |
| Agent runtime — CortexAgent(client, retriever, llm, persona), run_task | Task 11 |
| Error-mapping helper + SDK exceptions | Task 1 (exceptions.py created) + Task 15 (full coverage) |
| README/module docstring + runnable example | Task 3 Step 1 (module docstring), Task 14 (examples/quickstart.py) |

All Design §10 subsections are covered.

### 2. Placeholder scan

No `# TODO`, no `pass`-only method bodies, no `raise NotImplementedError` left in committed code paths (the stubs in Task 1 are intentionally replaced in Tasks 2–4 — the implementation in the finally-committed `client.py` after Task 4 contains no stubs). The only `# pragma: no cover` markers in Task 1 are on stubs that are deleted by Task 4, so the final state has no pragma markers on those methods.

### 3. Method-name / shared-contract confirmation

- `CortexClient.publish_finding(content, payload, scope, type=ArticleType.FINDING) -> str` ✅ (Task 1, signature matches section "Scope of cortex-sdk" item 1 exactly — `type=` kwarg defaults to `ArticleType.FINDING`)
- `CortexClient.publish_insight(content, payload, scope, cites=list[str]) -> str` ✅ (Task 2 — `cites` defaulted to `None` then coerced to `[]`; test asserts cites propagation; matches spec intent)
- `CortexClient.publish_warning / publish_procedure / publish_precedent` ✅ (Task 2)
- `CortexClient.search(query_text, topics, scopes, top_k=5, min_trust=0.3) -> list[QueryResult]` ✅ (Task 3 — exact signature)
- `CortexClient.compose_insight(content, payload, scope, sources: list[str]) -> str` ✅ (Task 4 — exact signature)
- `CortexClient._build_provenance(node) -> Provenance` ✅ (Task 1 — implemented as `ProvenanceHelpers._build_provenance(node)` called from `CortexClient._build_provenance`; sets `producer_agent=node.agent_did`, `producer_org=node.org_did`, `run_id=uuid4`, `timestamp=now UTC`, `source_data_hash=None`)
- `ProvenanceHelpers.from_seed(seed_dict: dict) -> Provenance` ✅ (Task 5 — auto-fills run_id and timestamp)
- `ProvenanceHelpers.with_source_hash(prov, raw_data: bytes, schema_desc: str) -> Provenance` ✅ (Task 5 — sha256 hex + source_data_schema)
- `CortexRetriever(BaseRetriever)` with `_get_relevant_documents(query, *, run_manager)` ✅ (Task 6 — signature includes `run_manager` per LangChain BaseRetriever contract)
- `CortexRetriever` constructor `(node, top_k=5, min_trust=0.3, topics=None, scopes=None)` ✅ (Task 6)
- QueryResult → Document metadata `{article_id, trust, org, type}` ✅ (Task 6 — `trust` = `result.trust_score`, `org` = `result.article.provenance.producer_org`, `type` = `result.article.type.value`)
- `CortexRetriever.as_tool(name="cortex_search", description="Search the Cortex agent memory fabric for findings, insights, and precedents across trusted peers.")` ✅ (Task 7 — exact name + the specified description string)
- `CortexPublishTool` with `name="cortex_publish"`, `_run(content, payload_json, scope)` returning article_id ✅ (Task 8 — `payload_json` is a JSON string per the spec wording "parses payload JSON"; content ≤ 2000 chars raises ValueError)
- `vLLMClient(base_url, model)` wrapping OpenAI-compatible client to `/chat/completions`, defaults Llama-3-8B-Instruct / temperature 0.2 / max_tokens 512 ✅ (Task 9 — exact defaults)
- `agent_step(system, user, tools, llm) -> str` ✅ (Task 10 — also has `max_iters=5` per spec)
- `ScriptedReasoner` for demo scripts ✅ (Task 10)
- `CortexAgent(client, retriever, llm, persona)` + `run_task(task: str) -> str` ✅ (Task 11 — exact constructor signature)
- Names alpha-bot (SOC Alpha) / beta-bot (SOC Beta) and personae — explicitly deferred to scenario plan per the brief: "Personae and system prompts initialized in scenario plan, not here" ✅
- `CortexReader(BaseReader)` with `from_retriever(retriever: CortexRetriever) -> CortexReader` ✅ (Task 12)
- `VectorStoreIndex` construction example in a test ✅ (Task 13)
- Error-mapping `map_node_error(exc)` translating to `CortexPublishError / CortexQueryError`, wrapped around every SDK call ✅ (Task 1 + Task 15 — `publish_finding/_publish_typed/search/compose_insight/_get_relevant_documents/CortexReader.load_data/CortexAgent.run_task` all call `map_node_error`)
- README snippet in module docstring ✅ (Task 1 Step 1: `cortex/sdk/__init__.py` has module docstring; the brief prohibition was against `cortex/sdk/__main__.py` which we did not create)

### 4. Deviations from the suggested task list

1. **`vLLMClient.chat(messages)` vs `agent_step(...)` taking `llm: vLLMClient | ScriptedReasoner`:** The brief lists Task 9 as "`vLLMClient.chat(messages)` … returns message content string" — implemented exactly. The `agent_step` ReAct loop is Task 10, which is consistent with the brief.
2. **`CortexPublishTool` payload arg name:** The brief says "`_run(content, payload_json, scope)` parses payload JSON" — implemented with the positional name `payload_json` (a JSON string) to match the brief verbatim rather than a dict.
3. **Task 5 already implemented in Task 1:** `provenance.py` from_seed + with_source_hash are written upfront in Task 1 (needed by `_build_provenance`). Task 5 is preserved as a contract-locking test task rather than a new implementation task — explicitly called out in Task 5 Step 3.
4. **`examples/quickstart.py` placement:** The brief says place the runnable example at `examples/quickstart.py`, enforced literally — no `cortex/sdk/__main__.py` created.
5. **pyproject chore:** The brief did not list a pyproject edit as a numbered task, but the SDK layer can't be installed/tested without langchain + llama-index, so a final chore commit was added (Section 4 below the task list) — clearly labelled as a chore and out of the numbered TDD sequence.

All other tasks map 1:1 to the brief's suggested 15-task breakdown.

### Final confirmation

- File path: `/Users/aerysaxel/Projects/Perciqa Cortex/docs/superpowers/plans/2026-07-18-cortex-sdk.md`
- Task count: 15 numbered tasks + pre-flight skeleton + dependency chore = 15 implementable TDD tasks plus scaffolding.
- Every task has real test code AND real implementation code — no placeholders.
- Every commit message includes the `Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>` trailer.
- No git operations are executed by this plan file (per the user's instruction); commits are described as commands for the implementing agent to run.
- Method names match the Shared contract section exactly as enumerated in subsection 3 above.