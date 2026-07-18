# Perciqa Cortex — Design Document

> **Status:** Draft v0.1 — Engineering design
> **Companion to:** `docs/2026-07-15-cortex-prd.md` (product requirements)
> **Author:** orbinix
> **Scope:** Hackathon MVP (3 weeks, solo) — federated pub/sub, two tenants, one demo scenario
> **Last updated:** 2026-07-15

---

## 1. Purpose and scope

This document specifies the engineering design of Perciqa Cortex's hackathon MVP. It is companion to the PRD: the PRD covers *what* and *why*, this document covers *how* — precise interfaces, data structures, protocols, sequences, failure modes, and performance budgets.

### 1.1 In-scope for this design

- Memory Article data model and serialization
- Cryptographic scheme (keys, signatures, identifiers)
- Local Cortex Node architecture (embedder, store, signer, query engine)
- Fabric Broker protocol (federated pub/sub)
- Agent SDK surface
- Trust scoring algorithm (MVP-static)
- Cortex Console UI design
- Error handling and failure modes
- Threat model
- Testing strategy
- Performance budgets

### 1.2 Out-of-scope (roadmap — referenced but not designed here)

- Gossip protocol / DHT-based p2p mesh (replaces broker)
- Zero-knowledge proofs of provenance (P1 Cipher, fills `computation_ref`)
- Append-only cryptographic ledger (P2 Ledger)
- Algorithmic trust propagation (MVP uses static trust scores)
- Multi-region federation
- Production persistence/sharding

---

## 2. System architecture

### 2.1 Topology

```
                    ┌─────────────────────────────────────────┐
                    │          Cortex Fabric Broker            │
                    │   (federated pub/sub, topic+scope ACL)   │
                    └─────────┬───────────────────┬───────────┘
                              │                   │
              publish/query   │                   │ publish/query
         ┌────────────────────▼───┐       ┌───────▼────────────────────┐
         │   Tenant A — SOC Alpha │       │   Tenant B — SOC Beta      │
         │   (Radeon MI300X)      │       │   (Radeon MI300X)         │
         │                        │       │                           │
         │  ┌─────────┐ ┌──────┐  │       │  ┌─────────┐ ┌──────┐    │
         │  │  Agent  │→│ Node │  │       │  │  Agent  │→│ Node │    │
         │  │(LangChn)│ │  A   │  │       │  │(LlamaIx)│ │  B   │    │
         │  └─────────┘ └───┬──┘  │       │  └─────────┘ └───┬──┘    │
         │                  │     │       │                  │       │
         │  ┌───────────────▼───┐ │       │ ┌────────────────▼────┐  │
         │  │ Embedder (GPU)    │ │       │ │ Embedder (GPU)       │  │
         │  │ ArticleStore      │ │       │ │ ArticleStore         │  │
         │  │ VectorIndex (GPU) │ │       │ │ VectorIndex (GPU)    │  │
         │  │ ProvenanceGraph   │ │       │ │ ProvenanceGraph      │  │
         │  │ CryptoSigner      │ │       │ │ CryptoSigner         │  │
         │  │ TrustEngine       │ │       │ │ TrustEngine          │  │
         │  └───────────────────┘ │       │ └─────────────────────┘  │
         └────────────────────────┘       └──────────────────────────┘
                              │                   │
                              └─────────┬─────────┘
                                        │
                                ┌───────▼─────────┐
                                │  Cortex Console  │ (web UI; observes both nodes
                                │  + Bench Subproc │  via read-only broker stream)
                                └─────────────────┘
```

### 2.2 Module decomposition

Six deployable units, each with one clear purpose, communicating through well-defined interfaces.

| Module | Purpose | Depends on | Interface to agents |
|---|---|---|---|
| `cortex-core` | Data model, crypto, serialization | (none) | `MemoryArticle`, `Scope`, `Provenance` structs |
| `cortex-node` | Local tenant node: embedder, store, signer, query engine, broker client | `cortex-core`, embedder, vector index | `CortexNode` class |
| `cortex-broker` | Federated pub/sub routing with topic+scope ACL | `cortex-core` (message envelopes only) | n/a (network service) |
| `cortex-sdk` | Agent-facing convenience layer; LangChain/LlamaIndex adapters | `cortex-node` | `CortexClient` |
| `cortex-console` | Real-time web UI; reads broker stream + node metrics | `cortex-broker`, `cortex-node` (metrics endpoint) | n/a (browser) |
| `cortex-bench` | Benchmark harness: Radeon vs CPU query/embed throughput | `cortex-node`, `cortex-core` | Prometheus exporter |

Each unit can be reasoned about independently. `cortex-core` has zero dependencies; everything else composes upward.

### 2.3 Module boundaries and ownership

**Strict ownership rules** — any unit can change internals without breaking consumers:

- `cortex-core` exposes only dataclasses + crypto primitives. No I/O, no async.
- `cortex-node` is the only thing that touches disks, vector indexes, GPU, and broker sockets.
- `cortex-broker` knows *nothing* about embeddings or trust. It routes opaque signed envelopes by topic+scope.
- `cortex-sdk` is a thin adapter; never duplicates node logic.
- `cortex-console` is read-only; never mutates fabric state directly.

---

## 3. Data model

### 3.1 MemoryArticle

The atomic unit. Versioned, serializable, cryptographically signed.

```python
@dataclass(frozen=True)
class MemoryArticle:
    id: ArticleId                         # sha256(canonical(content + provenance))
    schema_version: str = "1.0"
    
    # Content
    type: ArticleType                     # finding | insight | precedent | procedure | warning
    content: str                          # natural-language summary (≤2k chars)
    payload: dict                        # structured typed payload (e.g., CVE, ATT&CK technique)
    
    # Embedding (computed at publish by embedder; not signed — verifiable via recomputation)
    embedding: list[float] | None         # float16, dim=N depending on model
    embedding_model: str | None           # "nomic-embed-text-v1" etc.
    
    # Provenance
    provenance: Provenance
    
    # Dissemination
    scope: Scope                          # private | partner:<org_did> | public
    
    # Signatures
    agent_signature: bytes                # Ed25519 sig over canonical fields
    org_signature: bytes | None           # Ed25519 cosign by org key (optional MVP)
    
    # Derived-from (filled by Derive flow)
    cites: list[ArticleId]                # articles this one was composed from
    
    # Trust (filled by TrustEngine; not signed — recomputable)
    trust_score: float | None             # [0,1]
    trust_expiration: datetime | None


@dataclass(frozen=True)
class Provenance:
    producer_agent: AgentDID             # did:percq:agent:<uuid>
    producer_org: OrgDID                 # did:percq:org:<slug>
    computation_ref: str | None          # opaque ref to P2 Ledger tx (stub in MVP)
    source_data_hash: str | None         # sha256-hex of raw source data (never the data)
    source_data_schema: str | None       # human-readable hint: "cve-record-v1"
    run_id: str                          # producer's run/trace identifier
    timestamp: datetime                   # UTC, ISO-8601


class Scope:
    PRIVATE    = "private"               # never leaves local node
    PARTNER    = "partner:<org_did>"      # one named org
    PUBLIC     = "public"                 # any subscribed peer


class ArticleType(str, Enum):
    FINDING   = "finding"
    INSIGHT   = "insight"
    PRECEDENT = "precedent"
    PROCEDURE = "procedure"
    WARNING   = "warning"
```

### 3.2 Canonical serialization

Order-independent serialization for stable hashing and signatures:

- **Format:** JCS-like canonical JSON (RFC 8785-like):
  - dict keys sorted ascending by UTF-8 byte order
  - no insignificant whitespace
  - floats in shortest round-trippable form
  - datetime as ISO-8601 UTC with `Z` suffix, microsecond precision
- **Article ID:** `sha256(canonical_serialization(signed_fields_only)).hex()`
- **Signed fields:** everything *except* `embedding`, `trust_score`, `trust_expiration` (those are recomputable side data)

### 3.3 Article lifecycle (state machine)

```
                       ┌────────────┐
                       │  Drafted    │  (agent composes content + payload)
                       └──────┬─────┘
              sign by agent   │
                              ▼
                       ┌────────────┐
                       │  Signed     │  (agent_signature present)
                       └──────┬─────┘
              org co-sign     │ (optional MVP)
                              ▼
                       ┌────────────┐
                       │  CoSigned   │
                       └──────┬─────┘
              scope check     │
                              ▼
                       ┌────────────┐
                       │  Indexed    │  (stored locally, embedded if not yet)
                       └──────┬─────┘
              broker dispatch  │ (only if scope != PRIVATE)
                              ▼
                       ┌────────────┐
                       │  Published  │  (received by peers per ACL)
                       └──────┬─────┘
              cited by derive │
                              ▼
                       ┌────────────┐
                       │  Cited      │  (appears in derivatives' `cites`)
                       └──────┬─────┘
              age out    /  manual
                              ▼
                       ┌────────────┐
                       │  Archived   │  (still searchable; trust decays)
                       └────────────┘
```

States are stored in `ArticleStore` (below). Transitions are functions in `cortex-node`; failures roll back to the previous state and surface via error events.

---

## 4. Cryptographic design

### 4.1 Key types

| Key | Algorithm | Purpose | Stored as |
|---|---|---|---|
| Org key | Ed25519 (private) | Co-sign articles on behalf of org | PEM on local disk, mode 0600 |
| Org public key | Ed25519 | Verify org signatures | Published via broker handshake |
| Agent key | Ed25519 | Sign agent-authored articles | PEM, one per agent process |
| Agent public key | Ed25519 | Verify agent signatures | Self-published in broker handshake (MVP); future: org registry |
| TLS cert | ECDSA P-256 | Broker ↔ node transport | Self-signed for MVP; mTLS recommended |

Ed25519 is chosen because signing and verification are both single-digit-millisecond operations, which matters when publishing or querying thousands of articles per demo.

### 4.2 Identifier format (DID-style)

```
agent_did:  did:percq:agent:<uuid_v4>
org_did:    did:percq:org:<slug>           # human-readable slug, registry-held in MVP
```

The MVP keeps a trivial `org_registry.json` loaded into the broker:
```json
{
  "did:percq:org:soc-alpha":  {"pubkey": "ed25519:9f3c...", "name": "SOC Alpha"},
  "did:percq:org:soc-beta":   {"pubkey": "ed25519:71a2...", "name": "SOC Beta"}
}
```

### 4.3 Signing flow

```
1. Agent builds article content + payload + provenance with cites=[].
2. Agent computes canonical bytes of signed fields.
3. Agent signs with its private key → agent_signature.
4. Org key cosigns same bytes → org_signature (optional but recommended).
5. Recompute article.id = sha256(canonical_bytes).
6. Embedder computes embedding; attaches as side data (not signed).
7. TrustEngine computes trust_score; attaches as side data (not signed).
```

### 4.4 Verification flow (receiving peer)

```
1. Receive signed envelope from broker.
2. Lookup org and agent public keys from registry.
3. Compute canonical bytes of incoming article's signed fields.
4. Verify agent_signature against agent pubkey; reject on failure → quarantine.
5. If org_signature present, verify it; reject on failure.
6. Recompute article.id; reject if mismatch (tampered canonical bytes).
7. Embed article locally; store; index.
```

Recomputed side data (embedding, trust_score) **never needs the producer's signature** — it is verifiable by recomputation. This keeps signatures small and stable.

---

## 5. Protocol specification

### 6.1 Transport

- Broker ↔ Node: WebSocket over TLS, JSON message envelopes
- Each connection authenticates with org_did; broker checks registry
- Single multiplexed channel; messages disambiguated by `type`

### 5.2 Message envelopes

All messages share the outer envelope; the inner `payload` varies by `type`.

```typescript
Envelope {
  type:     "publish" | "query" | "query_result" | "subscribe" | "derive" |
            "event" | "metrics" | "ack" | "error"
  msg_id:   uuid_v4
  src:      did:percq:org:<slug>     (or "broker" for broker-originated)
  dst:      did:percq:org:<slug> | "*" 
  ts:       ISO-8601 UTC
  payload:  <type-specific>
}
```

### 5.3 Publish

Producer side:
```json
{
  "type": "publish",
  "payload": { "article": <MemoryArticle canonical JSON> }
}
```

Broker ACL check (server-side):
```
allowed = (
    article.scope == "public"
    OR article.scope == f"partner:{dst_org_did}"
    OR dst_org_did == src_org_did  # intra-org always allowed
)
```
On allow, broker forwards to all subscribed peers whose ACL passes. On deny, broker emits an `error` envelope with `code: SCOPE_VIOLATION`.

### 5.4 Query (cross-tenant)

MVP supports cross-tenant query routing so the broker acts as a fan-out coordinator:

```json
{
  "type": "query",
  "payload": {
    "query_text":  "TTPs tied to APT29 in 2026",
    "topic_filter": ["threat-intel", "apt29"],
    "scope_filter": ["public", "partner:did:percq:org:soc-beta"],
    "top_k": 5,
    "min_trust": 0.3,
    "deadline_ms": 500
  }
}
```

Each peer responds with `query_result`:
```json
{
  "type": "query_result",
  "payload": {
    "query_id": "<match>",
    "results": [
      { "article_id": "...", "score": 0.91, "trust": 0.78, "summary": "..." }
    ]
  }
}
```

Broker aggregates `query_result` envelopes within `deadline_ms`; caller receives the merged top_k.

### 5.5 Subscribe (after node startup)

```json
{
  "type": "subscribe",
  "payload": {
    "topics": ["threat-intel", "apt29", "malware"],
    "scopes": ["public", "partner:did:percq:org:soc-alpha"]
  }
}
```

Broker maintains a `(node_id, topic, scope)` routing table. Subscribe updates are idempotent.

### 5.6 Derive

When an agent composes a new article from existing ones, it emits a `derive` event *after* publishing the new article. The broker surfaces derive events to peers so they can update the provenance graph on their side:

```json
{
  "type": "derive",
  "payload": {
    "new_article_id":   "...",
    "cited_article_ids": ["...", "..."]
  }
}
```

Each receiving node updates its local `ProvenanceGraph` edges (new_id → cited_id) and recomputes trust for the new article.

### 5.7 Event stream (for Console)

Every state transition in the broker is mirrored to a read-only `event` channel that the Cortex Console subscribes to:

```json
{
  "type": "event",
  "payload": {
    "event": "article.published" | "article.cited" | "broker.scope_violation" |
             "broker.peer_connected" | "node.embed.completed" | ...,
    "data": { ... }
  }
}
```

### 5.8 Metrics stream (for Bench Console)

```json
{
  "type": "metrics",
  "payload": {
    "node": "did:percq:org:soc-alpha",
    "embeds_per_sec_radeon": 142.3,
    "embeds_per_sec_cpu":    18.6,
    "queries_per_sec_radeon": 23.1,
    "queries_per_sec_cpu":    2.7,
    "gpu_mem_util_pct":      86,
    "p95_query_latency_ms":   42
  }
}
```

Emitted every 2 seconds by `cortex-bench` (a sidecar that the node spawns).

### 5.9 Error semantics

| `error_code` | Meaning | Recoverable? |
|---|---|---|
| `INVALID_SIGNATURE` | Agent or org signature failed verification | No — quarantine |
| `INVALID_CANONICAL` | Recomputed article ID does not match | No — quarantine |
| `UNKNOWN_PRODUCER` | Registry lookup failed for org_did or agent_did | Yes — retry after registry refresh |
| `SCOPE_VIOLATION` | Broker ACL denied the route | No — drop + audit log |
| `DEADLINE_EXCEEDED` | Query deadline elapsed before responses arrived | Yes — partial result returned |
| `EMBED_FAILED` | Embedder unavailable or OOM | Yes — backoff + CPU fallback |
| `BROKER_DISCONNECT` | Node lost broker connection | Yes — auto-reconnect + replay outbound queue |

---

## 6. Sequence flows

### 6.1 Publish end-to-end

```
Agent         Node A          Broker          Node B          Agent
  │  publish()  │                │                │              │
  │────────────▶│                │                │              │
  │             │ sign+embed     │                │              │
  │             │ +index local   │                │              │
  │             │──── Envelope ─▶│                │              │
  │             │                │ ACL check      │              │
  │             │                │── forward ─────▶│              │
  │             │                │                │ verify sig   │
  │             │                │                │ recompute id │
  │             │                │                │ embed+index  │
  │             │                │◀── ack ────────│              │
  │             │◀── ack ────────│                │              │
  │  ok         │                │                │  event → UI  │
  │◀────────────│                │                │              │
```

### 6.2 Query end-to-end (cross-tenant)

```
Agent A       Node A           Broker           Node B
  │ query()    │                │                │
  │───────────▶│ local search  │                │
  │            │── fanout ─────▶│                │
  │            │                │ forward ─────▶│ local search
  │            │                │◀── results ───│
  │            │◀── aggregate ──│                │
  │ results    │                │                │
  │◀───────────│                │                │
```

### 6.3 Derive end-to-end

```
Agent A      Node A           Broker           Node B
  │ derive()  │                │                │
  │───────────▶│ publish new   │                │
  │            │ +emit derive  │                │
  │            │── event ─────▶│                │
  │            │                │── forward ───▶│ update graph
  │            │                │                │ recompute trust
  │            │                │                │ update UI
  │ ok         │                │                │
  │◀───────────│                │                │
```

---

## 7. Storage design

### 7.1 ArticleStore

One SQLite database per node, file: `cortex-node/articles.sqlite`.

```sql
CREATE TABLE articles (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  content       TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  scope         TEXT NOT NULL,
  agent_sig     BLOB NOT NULL,
  org_sig       BLOB,
  cites_json    TEXT NOT NULL DEFAULT '[]',
  state         TEXT NOT NULL,            -- signed | indexed | published | cited | archived
  created_at    TEXT NOT NULL,
  published_at  TEXT,
  trust_score   REAL,
  trust_expires TEXT
);

CREATE INDEX idx_articles_type    ON articles(type);
CREATE INDEX idx_articles_scope   ON articles(scope);
CREATE INDEX idx_articles_trust   ON articles(trust_score DESC);

CREATE TABLE provenance_edges (
  source_id TEXT NOT NULL,
  cited_id  TEXT NOT NULL,
  PRIMARY KEY (source_id, cited_id)
);

CREATE TABLE events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL,
  event      TEXT NOT NULL,
  article_id TEXT,
  payload_json  TEXT NOT NULL
);
```

SQLite is chosen for MVP simplicity (zero infra). Article bodies are kept as canonical JSON for portability; vector embeddings are kept in a separate index (below).

### 7.2 VectorIndex

Two interchangeable backends (selected via config):

| Backend | When | Library |
|---|---|---|
| `faiss-gpu` | Radeon available, FAISS built against ROCm | `faiss` with `faiss.index_gpu()` |
| `hnswlib` | Fallback — pure CPU | `hnswlib` (pip) |

Both serve the same Python interface so the node doesn't care:
```python
class VectorIndex:
    def add(self, article_id: str, embedding: np.ndarray) -> None: ...
    def search(self, query_vec: np.ndarray, top_k: int) -> list[tuple[str, float]]: ...
    def size(self) -> int: ...
```

Metric: cosine similarity. Dimension depends on embedder model. index built with M=32, ef_construction=200 (HNSW) when not using FAISS.

### 7.3 ProvenanceGraph

In-memory NetworkX `DiGraph` for the demo session. Edges: `(derived_article_id → cited_article_id)`. Persisted to SQLite `provenance_edges` table on every update; reloaded on node restart. NetworkX is sufficient for thousands of articles; GPU propagation is roadmap.

### 7.4 Persistent paths

```
cortex-node/
├── articles.sqlite
├── vectors/                 # hnswlib index files or faiss snapshots
│   ├── index.bin
│   └── meta.json
├── keys/
│   ├── org_ed25519.pem      mode 0600
│   └── agent_ed25519.pem    mode 0600
└── config.yaml
```

---

## 8. Embedding and retrieval pipeline

### 8.1 Model choice

| Candidate | Params | Dim | ROCm path | Notes |
|---|---|---|---|---|
| `bge-small-en-v1.5` | 33M | 384 | PyTorch ROCm, direct | Fastest; smallest memory footprint |
| `nomic-embed-text-v1` | 137M | 768 | PyTorch ROCm | Better retrieval quality |
| `e5-small-v2` | 33M | 384 | PyTorch ROCm | Alternative |

Default: **`bge-small-en-v1.5`** for hackathon — small enough that Day 1 ROCm spike is low-risk, embeddings are fast, and 384-dim vectors are compact for the UI to display.

### 8.2 Embedding pipeline (publish)

```
1. Article content + payload.summary normalized (strip >8KB, normalize whitespace)
2. Optional prefix: e.g., "finding: " for bge instruction-tuned models
3. Tokenize, pad to batch (default batch=16)
4. Forward pass on Radeon GPU; take mean-pooled last hidden state
5. L2-normalize vector
6. Cast to float16 for storage (halves disk and bandwidth; cosine ranking unaffected)
7. Persist to VectorIndex in same transaction as ArticleStore insert
```

### 8.3 Retrieval pipeline (query)

```
1. Query text → embed same way (single sample, batch=1)
2. VectorIndex.search(query_vec, top_k=K * 2)        # over-fetch for post-filtering
3. Apply post-filters:
     - scope ∈ requester's allowed scopes
     - trust_score >= min_trust (default 0.3)
     - type matches if specified
     - created_at >= min_age (optional)
4. Sort by 0.5 * cosine + 0.5 * trust_score
5. Truncate to top_k
6. Hydrate each result from ArticleStore by id
7. Return list[(article, hybrid_score, trust_score, provenance_summary)]
```

The hybrid ranking (cosine + trust) is the design lever that makes "trust" *visible in retrieval*, not just in the UI. Without it, judges might dismiss trust as decorative.

### 8.4 Batch sizing and GPU memory

- Default embed batch: 16 (≈150MB VRAM on bge-small)
- Configurable in `config.yaml` via `embed_batch_size`
- On GPU OOM: catch `RuntimeError`, halve batch, retry; persist effective batch as new default
- Retirement of fragile batches: record `embed_batch_size_log` in metrics stream so judges see adaptive behavior

---

## 9. Trust scoring algorithm

### 9.1 Inputs

| Input | Source | Range |
|---|---|---|
| Producer reputation `R(org)` | Static config in MVP (per-org.yaml) | [0,1], default 0.5 |
| Recency of article `Δt` | `now - created_at` | seconds |
| Number of citations `C` | derived from ProvenanceGraph | non-negative |
| Trust of cited sources | recursive call | [0,1] |
| Has org co-signature | boolean | 0 or 1 |
| Source data hash present | boolean | 0 or 1 |

### 9.2 Formula

```
recency_decay(Δt) = 0.5 ** (Δt_days / 90)        # 90-day half-life

base_trust = R(org) * recency_decay(Δt) * (1 + 0.1 * has_org_sign) * (1 + 0.05 * has_source_hash)

# Derived article gets blended trust from its sources
source_trust = 0.0
if cites:
    source_trust = mean(trust(c) for c in cites)
    source_penalty = sum(1 for c in cites if trust(c) < 0.2) * 0.1

T_article = 0.6 * base_trust + 0.4 * source_trust - source_penalty
T_article = clamp(T_article, 0.0, 1.0)
```

### 9.3 Propagation (MVP-static)

In the MVP, trust is **recomputed on demand** (not gossip-propagated). Whenever a new article lands or a citation is added, the receiving node recomputes trust for the affected article and its descendants in the local ProvenanceGraph. Memoized per `(article_id, graph_version)`. Roadmap: continuous gossip-based propagation via the broker.

### 9.4 Why trust lives in retrieval, not only in UI

Without trust shaping retrieval, low-trust findings crowd out high-trust ones in top_k. The hybrid ranking rule is *part of the protocol design*, not a UI tweak. This is the difference between "we have a trust score" and "trust influences what agents see."

---

## 10. Agent SDK

### 10.1 Interface

Python first; TypeScript is roadmap. The surface is deliberately small.

```python
from cortex import CortexNode, MemoryArticle, Scope, ArticleType

node = CortexNode(
    org_did   = "did:percq:org:soc-alpha",
    key_paths = {"org": "/path/org.pem", "agent": "/path/agent.pem"},
    broker_url= "wss://broker.local:7432",
    config    = "config.yaml",
)

node.start()        # connects to broker, loads indexes, starts embedder

# Publish a finding
art = MemoryArticle(
    type    = ArticleType.FINDING,
    content = "Detected anomalous PowerShell encoded command pattern matching MITRE T1059.001 attributed to APT29.",
    payload = {
        "cve_id":     "CVE-2026-1337",
        "attack_id":  "T1059.001",
        "actor":      "APT29",
        "severity":   "high",
    },
    scope   = Scope.PUBLIC,
    provenance = Provenance( ... ),
)
node.publish(art)

# Query across the fabric
results = node.query(
    "T1059.001 APT29 indicators",
    topic_filter   = ["threat-intel"],
    scope_filter   = [Scope.PUBLIC, "partner:did:percq:org:soc-beta"],
    top_k          = 5,
    min_trust      = 0.4,
    deadline_ms    = 400,
)
for r in results:
    print(r.score, r.trust, r.article.content)

# Derive a new insight from existing findings
sources = [r.article_id for r in results[:3]]
derived = MemoryArticle(
    type    = ArticleType.INSIGHT,
    content = "Three independent findings on T1059.001 suggest a coordinated campaign attributed to APT29 starting 2026-07-10.",
    payload = {...},
    scope   = Scope.PUBLIC,
    cites   = sources,
    provenance = Provenance( ... ),
)
node.publish(derived)             # auto-derives via broker derive event
```

### 10.2 LangChain integration

```python
from cortex.sdk import CortexRetriever
from langchain.agents import AgentExecutor

retriever = CortexRetriever(node=node, top_k=5, min_trust=0.3)
agent_executor = AgentExecutor.from_agent_and_tools(
    agent=..., tools=[retriever.as_tool(name="cortex_search", description="...")]
)
```

`CortexRetriever` implements the LangChain retriever interface; `as_tool` wraps it as a tool the agent can call.

### 10.3 LlamaIndex integration

```python
from cortex.sdk import CortexRetriever
from llama_index import VectorStoreIndex
retriever = CortexRetriever(node=node)
index = VectorStoreIndex.from_retriever(retriever)
```

---

## 11. Cortex Console (UI design)

Web UI, single page. Served by `cortex-console` (FastAPI backend reading the broker event stream + node metrics).

### 11.1 Views

| View | Purpose | Updates |
|---|---|---|
| **Fabric Overview** | Two-column "tenant" panel, live stream of articles flowing between nodes (animated arrows on scope-pass) | real-time, broker event stream |
| **Article Feed** | Reverse-chronological list of articles; color-coded by type; locks to selected tenant or all | real-time |
| **Article Detail** | Full content, payload, provenance tree, signatures (✓/✗), trust breakdown chart, citing articles | on selection |
| **Provenance Graph** | Force-directed graph: articles as nodes, `cites` as edges; HUD on hover; trust encoded as node saturation | real-time |
| **Scope Filter** | Toggle private / partner / public visibility; UI redacts articles outside scope per the logged-in node | on toggle |
| **Bench Panel** | Live charts: embeds/sec (Radeon vs CPU), query latency p95, GPU mem util, queries/sec | 2-second polling |
| **Threat Intel (scenario)** | MITRE ATT&CK matrix grid; technique cells light up when an article with that `attack_id` is in the fabric; click → article list | real-time |

### 11.2 Console architecture

```
                Browser (React, single page)
                          │ WebSocket
                          ▼
                ┌──────────────────────┐
                │ cortex-console       │  (FastAPI)
                │  - event stream      │
                │  - metrics feed      │
                │  - article detail API │
                └──────────┬───────────┘
                           │ subscribe
                           ▼
                    Cortex Broker  (event + metrics channels)
```

Console is **read-only** — never mutates fabric state. It only subscribes to event and metrics channels. All agent-driven mutations happen through nodes.

### 11.3 Visual language (Scenario F1 — SOC cyberthreat intel)

| Element | Representation |
|---|---|
| Tenant | Left/right column with org slug + DID + favicon-style shield icon |
| Article | Card: type tag (color: finding=red, insight=blue, warning=yellow, precedent=violet), content snippet, trust score ring (0–100%) |
| Article flow | Animated dotted line from publisher tenant to recipient tenant on successful publish |
| Provenance tree | Indented tree in Article Detail (root = current article, children = cited articles, each expandable) |
| ATT&CK matrix | 14×15 grid of technique cells from MITRE; cells light up soft orange on first finding, bright red on ≥3 findings citing same technique |
| Signature status | Green check on each sig valid; red ✗ on invalid; grey dot if unsigned |
| Benchmark panel | Two side-by-side horizontal bar charts updating every 2s |

---

## 12. Error handling and failure modes

### 12.1 Node-local failures

| Failure | Detection | Action |
|---|---|---|
| Embedder OOM | Catch `RuntimeError` from forward pass | Halve batch; retry; persist new batch size; emit `node.embed.failed` event |
| Embedder unavailable (ROCm gone) | Healthcheck every 5s; missing GPU device | Fallback to CPU embedder; emit `node.embed.fallback_cpu` event; UI shows degraded banner |
| VectorIndex corruption | `index.size` mismatch with store count | Rebuild index from ArticleStore; emit `node.index.rebuild` event |
| SQLite locked | OperationalError | Retry up to 3 with 200ms backoff |
| Key file missing / unreadable | On startup | Refuse to start; log actionable error |

### 12.2 Broker failures

| Failure | Detection | Action |
|---|---|---|
| Broker unreachable | TCP connect timeout | Auto-reconnect with exponential backoff (1s..30s) |
| Outbound queue grows > 10k | Periodic check | Spill to disk under `cortex-node/outbound/`; emit `node.queue.spilled` event |
| Invalid signature on incoming | Verify on receive | Quarantine article in `articles` with `state="quarantined"`; never index; emit `broker.scope_violation` mutation event |
| Scope violation (broker ACL denies route) | Broker-side ACL check | Drop + audit log; emit `broker.scope_violation` event; never reaches recipient |
| Dead messages (msg_id not acked in N sec) | Timeout | Log; emit `broker.dead_letter` event |

### 12.3 Invariants maintained under failure

- **No unsigned article ever enters the VectorIndex.**
- **No article with `scope=private` is ever sent to broker.**
- **No article with `scope=partner:X` is ever forwarded to org ≠ X.**
- **Embedding failures never lose the article** — store it; defer embedding; retry.
- **Node crashes never corrupt the VectorIndex** — index is rebuildable from SQLite.

---

## 13. Threat model

### 13.1 Adversaries considered

| Adversary | Capability | Defense (MVP) |
|---|---|---|
| Malicious node operator | Publishes fabricated findings with valid signatures | Trust score starts at 0.5 for unknown orgs; reputation config + hybrid retrieval downweights; consumer can reject below `min_trust` |
| Man-in-the-middle on broker | Reads or alters messages in flight | TLS (mTLS for trusted peers); signed envelopes — broker cannot forge articles; can only drop, never alter |
| Curious broker operator | Inspects articles passing through | All sensitive payloads carry `source_data_hash` (commitment), not raw data; long-term: payload encryption (roadmap) |
| Forged source data | Producer hashes data that doesn't match article content | Out of scope for MVP — provenance gives you "this org said X"; cryptographic data-attestation is P1 Cipher roadmap |
| Replay attack | Re-sending old valid envelopes | Each message includes `msg_id` (uuid) + `ts`; recipients dedupe by `msg_id`; stale signatures rejected after replay window (default 600s) |
| Sybil | One org fabricates many agent DIDs to boost trust | Out of scope for MVP — future: proof-of-org (DNS TXT, registry attestation), agent-DID quotas |

### 13.2 Non-adversarial but trust-relevant risks

- **Trust decay**: articles older than 90 days drop below 0.5 trust even from high-rep orgs — Circuit prevents stale intel dominating retrieval.
- **Citation chasing**: agents citing each other to inflate trust. MVP defense: trust propagation is single-hop (only direct citations contribute); deep propagation is roadmap.

---

## 14. Testing strategy

### 14.1 Unit tests (target ≥70% line coverage on `cortex-core`, `cortex-node` crypto paths)

| Target | Test |
|---|---|
| `cortex-core` | Round-trip serialize/deserialize MemoryArticle; canonical serialization stable across dict-order permutations |
| `cortex-core` | Ed25519 sign/verify; known-vector tests |
| `cortex-core` | Article ID determinism: same content → same id |
| `cortex-node` | Trust formula on synthetic graph matches expected values |
| `cortex-node` | Scope filter excludes partner:X articles from org ≠ X |
| `cortex-node` | Embed fallback → CPU path when GPU flagged unavailable |
| `cortex-broker` | ACL allows public and partner:X; rejects partner:Y to X |
| `cortex-broker` | Replay window rejects 700s-old envelopes |

### 14.2 Integration tests (two nodes on one host)

| Scenario |
|---|
| Publish to public scope → peer receives + indexes |
| Publish to partner:X scope → only peer X receives |
| Publish to private scope → broker never sees it |
| Cross-tenant query returns blended results ranked by hybrid score |
| Derive → cited articles' `cited_by` count updates on peer |
| Forged signature → peer quarantines and emits `broker.scope_violation`-style event |

### 14.3 End-to-end test (scripted scenario)

- Load synthetic dataset (CVE/ATT&CK records) into both tenants
- Run two scripted agents (one publishes, one queries + derives)
- Assert: 3+ articles cross fabric, 1 derivation appears in Console, Trust benchmarks within ±10% of expected
- Output: bounded test for use as pre-demo self-check

### 14.4 Benchmark harness (`cortex-bench`)

- Continuous embeds/sec and queries/sec on both Radeon and CPU paths
- Reports metrics via the metrics stream (above)
- Used as visual evidence of GPU load-bearing (the 40-pt axis)

---

## 15. Deployment topology

### 15.1 Hackathon dev topology

All processes on a single machine:

```
localhost
├── cortex-broker           :7432 (WebSocket)
├── cortex-node A (SOC Alpha) - config-A.yaml
├── cortex-node B (SOC Beta)  - config-B.yaml
├── cortex-console (FastAPI) :8080
└── cortex-bench sidecar (per node)
```

### 15.2 Demo topology (for the recorded walkthrough)

Either:
- Same single machine plus browser open on Console, **or**
- Two machines on same LAN (more visually convincing for "two tenants") with broker on one of them

The single-machine topology is the default for day-of recording — fewer moving parts, no network surprises.

### 15.3 Production (roadmap, not built here)

- One Cortex node per customer site, on AMD MI300X or comparable
- Broker cluster with horizontal scaling; ACL enforcement by mTLS identity
- P1 Cipher zk-proof sidecar at each node for provenance attestation
- P2 Ledger HSM at each node for tamper-evident anchoring
- Multi-region via gossip DHT — federated broker becomes the seed

---

## 16. Performance budgets

### 16.1 MVP latency targets

| Operation | Target p95 | Hard limit |
|---|---|---|
| Local publish (sign + embed + index + store) | < 250 ms | 500 ms |
| Local query (embed query + similarity search over 10k articles) | < 100 ms | 250 ms |
| Cross-tenant query (broker fan-out + aggregation) | < 400 ms | 700 ms |
| Broker forward per hop | < 50 ms | 100 ms |
| Signature verification (Ed25519) | < 1 ms | 5 ms |
| Embedding single text on Radeon (bge-small) | < 30 ms | 80 ms |
| Embedding single text on CPU fallback | < 200 ms | 400 ms |

### 16.2 MVP throughput targets

| Workload | Target |
|---|---|
| Embeds/sec on Radeon (batch 16) | ≥ 350 |
| Embeds/sec on CPU fallback (batch 16) | ≥ 30 |
| Queries/sec on Radeon over 10k articles | ≥ 50 |
| Broker fan-out per second to 4 peers | ≥ 1000 envelopes |

### 16.3 Visual evidence

The Bench Panel shows two side-by-side bar charts (Radeon vs CPU) updating every 2 seconds. The intent is that judges can *see* the load-bearing GPU benefit on the screen the entire demo, not just trust a single benchmark slide.

---

## 17. Configuration

### 17.1 `config.yaml` (per-node)

```yaml
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
  backend: auto              # auto | gpu | cpu
  batch_size: 16
  fallback_on_oom: true

vector_index:
  backend: faiss-gpu         # faiss-gpu | hnswlib
  metric: cosine
  hnsw:
    M: 32
    ef_construction: 200
    ef_search: 64

trust:
  default_org_reputation: 0.5
  reputation_overrides:
    did:percq:org:soc-alpha: 0.85
    did:percq:org:soc-beta:  0.78
  half_life_days: 90
  min_trust_default: 0.3

query:
  default_top_k: 5
  deadline_ms: 400
  min_trust: 0.3

logging:
  level: INFO
  file: ./logs/node.log
```

### 17.2 Environment variables (overriding config)

| Var | Purpose |
|---|---|
| `CORTEX_BROKER_URL` | Override broker URL |
| `CORTEX_EMBED_BACKEND` | Force `gpu` or `cpu` |
| `CORTEX_LOG_LEVEL` | Override log level |
| `CORTEX_BENCH_ENABLED` | `1` enables bench sidecar |

---

## 18. Repository layout (proposed for hackathon submission)

```
cortex/
├── README.md
├── DESIGN.md                          # symlink to this document
├── PRD.md                              # symlink to PRD
├── pyproject.toml
├── cortex/                             # source
│   ├── core/                           # cortex-core
│   │   ├── article.py
│   │   ├── crypto.py
│   │   ├── canonical.py
│   │   └── types.py
│   ├── node/                          # cortex-node
│   │   ├── node.py
│   │   ├── embedder.py
│   │   ├── store.py
│   │   ├── vector_index.py
│   │   ├── provenance.py
│   │   ├── trust.py
│   │   └── broker_client.py
│   ├── broker/                        # cortex-broker
│   │   ├── server.py
│   │   ├── acl.py
│   │   └── registry.py
│   ├── sdk/                           # cortex-sdk
│   │   ├── client.py
│   │   ├── langchain_adapter.py
│   │   └── llamaindex_adapter.py
│   ├── console/                       # cortex-console
│   │   ├── backend.py
│   │   └── frontend/                  # React app
│   └── bench/                         # cortex-bench
│       └── runner.py
├── scenarios/
│   └── soc_consortium/               # F1 demo data + scripts
│       ├── seed.py
│       ├── agent_alpha.py
│       ├── agent_beta.py
│       └── dataset/                  # CVE/ATT&CK synthetic
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── deploy/
│   ├── docker-compose.yml
│   └── Makefile
└── docs/
    └── submission/                    # demo video, slides, judge-facing README
```

---

## 19. Open design decisions (still pending)

| # | Decision | Default | Owner decision needed |
|---|---|---|---|
| D1 | Headline embedder model | `bge-small-en-v1.5` | confirm or prefer nomic |
| D2 | Headline agent reasoning model | small open LLM via vLLM-on-ROCm; Aurora as stretch | confirmed stretch behavior? |
| D3 | UI framework | React + FastAPI backend | confirm or prefer htmx/htmx |
| D4 | Bench sidecar per node vs single central bench | per node (richer UI) | confirm |
| D5 | Article body field cap | 2k chars natural-language | confirm or extend |
| D6 | Replay window | 600s | confirm |
| D7 | Trust formula weights (0.6 / 0.4) | As in §9.2 | confirm or tune |
| D8 | Demo scenario | F1 Cybersecurity SOC consortium (recommended) | PRD §7.3 — pending |
| D9 | Single-scenario vs agnostic-plus-montage | PRD §7.3 — pending | pending |
| D10 | Submission format (live vs recorded) | Pre-recorded video as primary, live-capable as backup | pending hackathon Rules check |
| D11 | Name "Cortex" vs working title | "Perciqa Cortex" working title | pending |

---

## 20. Revision history

| Date | Version | Author | Notes |
|---|---|---|---|
| 2026-07-15 | v0.1 | orbinix | Initial design draft from brainstorming session. Companion to `docs/2026-07-15-cortex-prd.md`. |