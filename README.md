# Perciqa Cortex

> **The memory fabric for the agent economy.**

Cortex is a decentralized network of sovereign nodes that lets AI agents share **memory articles** across organizational trust boundaries, without exposing raw data, weights, or trusting a central vendor. Every article carries cryptographic provenance, scoped permissions, and a derived trust score.

[![Status](https://img.shields.io/badge/status-early%20development-orange)](https://github.com/perciqa/cortex)
[![Python](https://img.shields.io/badge/python-3.11%2B-blue)](https://www.python.org/)
[![ROCm](https://img.shields.io/badge/AMD-ROCm%20accelerated-E8272D)](https://rocm.docs.amd.com/)

---

## The Problem

Today's AI memory is **single-tenant by default**. There is no production-grade protocol where Agent A (say, a hospital) can ask *"what did Agent B (say, a research lab) discover about condition Z?"* and get back a signed, scoped, provenance-tagged memory article, without either side exposing raw data or rebuilding trust infrastructure from scratch.

| Existing product | What it lacks |
|---|---|
| Pinecone / Qdrant / Weaviate | Single-tenant. No agent-native semantics. No provenance. No cross-org. |
| Letta (MemGPT) | One agent, one tenant. Not a fabric. |
| LangChain Memory / Mem0 | Ephemeral. Single-session. Not shareable. |
| Federated knowledge graphs (academic) | Not agent-native. Not production-grade. No product. |

Cortex is the missing layer.

---

## How It Works

There are three runtime loops.

**Publish.** An agent produces a finding. The local Cortex node signs it with Ed25519 keys, computes its embedding on a local GPU, and broadcasts it to subscribed peers within the article's scope. Peers verify the signature and index it locally.

**Query.** An agent asks *"what's known about X?"* The node embeds the query, runs semantic retrieval over its local fabric partition, and returns ranked articles with full provenance. Results are ranked by a blend of cosine similarity and trust score, so trust shapes what agents actually see rather than just appearing in the UI.

**Derive.** An agent composes a new article from existing ones. The provenance graph grows and trust propagates: articles that cite high-trust sources get a lift, and ones that cite low-trust sources take a penalty.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Cortex Fabric Broker                       │
│          (federated pub/sub, topic + scope ACL)              │
└──────────────────┬──────────────────────┬───────────────────┘
                   │                      │
   ┌───────────────▼───────────┐  ┌───────▼───────────────────┐
   │  Tenant A                  │  │  Tenant B                  │
   │                            │  │                            │
   │  ┌────────┐  ┌──────────┐  │  │  ┌────────┐  ┌──────────┐  │
   │  │ Agent  │→ │  Node A  │  │  │  │ Agent  │→ │  Node B  │  │
   │  └────────┘  │          │  │  │  └────────┘  │          │  │
   │              │ Embedder │  │  │              │ Embedder │  │
   │              │ ArtStore │  │  │              │ ArtStore │  │
   │              │ VecIndex │  │  │              │ VecIndex │  │
   │              │Provenance│  │  │              │Provenance│  │
   │              │  Signer  │  │  │              │  Signer  │  │
   │              │TrustEng. │  │  │              │TrustEng. │  │
   │              └──────────┘  │  │              └──────────┘  │
   └────────────────────────────┘  └────────────────────────────┘
```

| Module | Purpose |
|---|---|
| `cortex-core` | Data model, crypto, and serialization. No external dependencies. |
| `cortex-node` | Local tenant node: embedder, store, signer, and query engine |
| `cortex-broker` | Federated pub/sub routing with topic and scope ACL |
| `cortex-sdk` | Agent-facing convenience layer with LangChain and LlamaIndex adapters |
| `cortex-console` | Real-time read-only web UI |
| `cortex-bench` | GPU vs CPU benchmark harness |

---

## Data Model

The atomic unit is a **MemoryArticle**:

```python
@dataclass(frozen=True)
class MemoryArticle:
    id: ArticleId          # sha256(canonical(content + provenance))
    type: ArticleType      # finding | insight | precedent | procedure | warning
    content: str           # natural-language summary
    payload: dict          # structured typed payload

    embedding: list[float] | None   # computed locally on GPU at publish time
    provenance: Provenance
    scope: Scope           # private | partner:<org_did> | public

    agent_signature: bytes          # Ed25519, signs all canonical fields
    org_signature: bytes | None     # Ed25519 co-sign by org key

    cites: list[ArticleId]          # articles this one was derived from
    trust_score: float | None       # [0, 1], recomputable, not signed


@dataclass(frozen=True)
class Provenance:
    producer_agent: AgentDID        # did:percq:agent:<uuid>
    producer_org: OrgDID            # did:percq:org:<slug>
    source_data_hash: str | None    # sha256 commitment, never the raw data
    run_id: str
    timestamp: datetime
```

### Lifecycle

```
Drafted -> Signed -> Indexed -> Published -> Cited -> Archived
```

Articles with `private` scope never leave the local node. `partner:<org_did>` articles go only to that named org. `public` articles reach all subscribed peers.

---

## License

TBD. See [LICENSE](LICENSE).

---

<sub>By [Perciqa](https://github.com/perciqa)</sub>
