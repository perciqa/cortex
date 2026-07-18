# Product Requirements Document: Perciqa Cortex

> **Status:** Draft v0.1 — Hackathon ideation phase
> **Author:** orbinix
> **Target event:** AMD AI DevMaster Hackathon 2026 (Track 2: Agentic AI)
> **Submission window:** Jul 15 – Aug 6, 2026
> **Team:** Solo (orbinix), full focus
> **Prize pool:** USD $30,000 (1st: $5,000 / 2nd: $3,500 / 3rd: $1,500 per track)

---

## 1. Executive Summary

**Perciqa Cortex** is a decentralized agent memory fabric: a network of sovereign nodes, each running on a tenant's local AMD Radeon GPU, gossiping **memory articles** by topic subscription across organizational trust boundaries.

Cortex solves a problem no incumbent addresses — agents at Organization A need to learn what agents at Organization B discovered, **without exposing raw data, weights, or trusting a central vendor**. Every article carries cryptographic provenance (who produced it, from what computation, when), scoped permissions, and a derived trust score.

Cortex is a **standalone Perciqa product**, independent of Argus and Aurora. It is Perciqa's first **protocol-level infrastructure product** — defensible, standard-izable, and designed around the 2028 agent-economy thesis: agents will be the primary knowledge workers in every regulated industry, and shared institutional memory across trust boundaries is the missing layer of the stack.

### 1.1 Hackathon positioning

| Axis | Cortex answer |
|---|---|
| Track | **Track 2: Agentic AI** (60 pts functional + 40 pts AMD/ROCm) |
| Novelty | First inter-agent **memory fabric** with cryptographic provenance + sovereign inference. Not an observability wrapper, not a wrapper around RAG. |
| AMD/Radeon angle | Local embedding + retrieval + trust scoring + agent reasoning all run on Radeon via ROCm. The 40-pt axis is load-bearing, not decorative. |
| 5-year thesis | By 2028, agent-to-agent cooperation across org boundaries is the default. Today's stack has protocol primitives (TLS, JWT) but no agent-native memory protocol with provenance. Cortex owns that layer. |
| Solo-shippable in 3 weeks | Yes — federated pub/sub (not full p2p mesh), small article corpus, single demo scenario, focused console UI. |

---

## 2. Problem Statement

### 2.1 The gap

Today's AI memory landscape is **single-tenant** by default:

| Product | What it does | What it lacks |
|---|---|---|
| Pinecone / Qdrant / Weaviate | Vector DB for RAG | Single-tenant. No agent-native semantics. No provenance. No cross-org. |
| Letta (MemGPT) | Persistent memory for one agent | One agent. One tenant. Not a fabric. |
| Cognee | Unstructured data → knowledge graph | Single-tenant. No inter-agent provenance. |
| LangChain Memory / Mem0 | Session-scoped agent memory | Ephemeral. Single-session. Not shareable. |
| Federated KGs (academic) | Cross-org knowledge graphs | Not agent-native. Not production-grade. No product. |

**No product exists** where Agent A (Hospital X) can ask *"what did Agent B (Research Lab Y) discover about condition Z"* and receive a signed, provenance-tagged, scoped memory article — without either org exposing raw data, trusting a central vendor, or rebuilding the protocol from scratch.

### 2.2 Why this gap widens by 2028

| 2026 baseline | 2028 reality |
|---|---|
| Single-tenant RAG over own docs | Agents cooperating across org boundaries is the default |
| "Trust the LLM vendor" model | Regulators (EU AI Act, NIST AI RMF, ISO 42001) require cross-tenant auditability |
| One agent, one model, one org | Swarms of micro-agents across org boundaries sharing knowledge |
| Cloud GPU + data exfiltration anxiety | Federated / sovereign local inference is baseline |
| Cloud RAG shared with vendor | Cross-org memory with cryptographic provenance is mandatory |

Every bank, hospital, law firm, SOC deploying agents in 2028 will need shared institutional memory × every agent × every counterparty — with provenance. There is no product for this today.

### 2.3 Why decentralization is non-negotiable

Hospital A won't upload patient-derived findings to a central vendor. Research Lab B won't expose which papers it's reading. Cybersecurity SOCs won't share probe placement. Cortex articles carry **commitments** (hashes of source data, never raw data), and the agent's reasoning over retrieved articles runs **locally on Radeon** — sovereign inference.

---

## 3. Product Vision

> **Cortex makes agents cooperate at the speed of local inference — only feasible because Radeon GPU keeps the computation sovereign.**

Cortex is the **memory fabric for the agent economy**: a decentralized network where agents publish findings, retrieve what other agents learned, and compose new knowledge — all with cryptographic provenance, scoped permissions, and zero central vendor trust.

### 3.1 Vision pillars

1. **Sovereign** — Each tenant runs a Cortex node on its own infrastructure (Radeon GPU). No raw data leaves the boundary; only signed scoped metadata and embeddings cross boundaries.
2. **Provenance-native** — Every memory article is a first-class provenance artifact: producer agent, producer org, computation reference, source-data commitments, timestamps, signatures.
3. **Scope-aware** — Articles are scoped `private | partner:org-b | public`. Subscribe-based dissemination; articles reach only authorized peers.
4. **Trust-propagating** — Articles citing high-trust sources get trust lift; citing untrusted sources get penalized. New derivative articles inherit provenance graph.
5. **Agent-native** — Not a generic vector DB. Memory articles are typed (finding, insight, precedent, procedure, warning) and queried in agent-loop context.

---

## 4. How Cortex works (mechanics)

### 4.1 Memory Article — the atomic unit

```
MemoryArticle {
  id:          hash(content + provenance)
  type:         finding | insight | precedent | procedure | warning
  content:      natural language + structured payload
  embedding:    [float × N]   (computed on local Radeon GPU at publish time)
  provenance: {
    producer_agent:       did:percq:agent:xyz
    producer_org:        did:percq:org:hospital-a
    computation_ref:     ledger_tx_id    (← optional P2 Cipher hooks)
    source_data_hash:    sha256(...)     (commitment, never raw data)
    source_data_schema:  description of what was hashed
    timestamp, run_id
  }
  scope:        private | partner:org-b | public
  trust:        computed from provenance depth + producer reputation
  signatures:   [org_key, agent_key]
  derivatives:  [article_ids that cited this one]
}
```

### 4.2 Three runtime processes

1. **Publish** — Agent produces a finding → local Cortex node signs it → computes embedding on Radeon → broadcasts to subscribed peers (only those within `scope`). Article appears on peers' local stores with verifiable signature.
2. **Query** — Agent asks "what's known about X?" → local node does semantic retrieval over its fabric partition (local Radeon GPU) → returns ranked articles **with provenance** → agent cites, derives from, or rejects based on `trust` score.
3. **Derive** — Agent composes a new article from existing ones → provenance graph extends → trust propagates (article citing 5 high-trust sources gets boost; citing untrusted sources gets penalized).

### 4.3 The fabric (transport)

For the hackathon MVP, the fabric is a **federated pub/sub** (not full p2p mesh):

- A small **broker service** routes articles between two Cortex nodes by topic+scope
- Each node runs on a separate "tenant" (different keys, different scope permissions)
- Roadmap replaces broker with gossip protocol + DHT for p2p mesh scaling

This is a deliberate scope decision: federated pub/sub is sufficient to demo cross-org cooperation and is far less risk than building p2p mesh in 3 weeks solo.

### 4.4 GPU is load-bearing, not decorative

| Function | Why GPU |
|---|---|
| Embedding computation at publish time | Must be sub-second or agents won't publish |
| Semantic retrieval at query time over growing fabric | Scales into millions of articles; CPU too slow for real-time agent loops |
| Trust scoring / provenance graph algorithms | Graph algorithms over provenance tree; GPU-accelerated |
| Agent reasoning over retrieved articles | Local inference keeps computation sovereign |

**Pitch line that lands:** *"Cortex makes agents cooperate at the speed of local inference — only feasible because Radeon GPU keeps the computation sovereign."*

---

## 5. Architecture (Hackathon MVP)

```
┌─────────────────────────────────────────────────────────────────┐
│  Tenant A — Hospital (Radeon MI300X via ROCm)                   │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ Clinical Agent   │←→│  Cortex Node A    │                    │
│  │ (LangChain)      │  │  - Embedder (GPU) │                    │
│  └──────────────────┘  │  - Local store    │                    │
│                        │  - Crypto signer   │                    │
│                        └─────────┬─────────┘                    │
└──────────────────────────────────┼──────────────────────────────┘
                                     │
                          ┌────────▼────────┐
                          │  Fabric Broker  │  (federated pub/sub)
                          │  topic+scope    │
                          └────────┬────────┘
                                     │
┌──────────────────────────────────┼──────────────────────────────┐
│  Tenant B — Research Lab (Radeon)  │                              │
│  ┌──────────────────┐  ┌─────────▼────────┐                      │
│  │ Literature Agent │←→│  Cortex Node B   │                      │
│  │ (LlamaIndex)     │  │  - Embedder (GPU)│                      │
│  └──────────────────┘  │  - Local store    │                      │
│                        │  - Crypto signer  │                      │
│                        └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

### 5.1 Component inventory (in-scope for hackathon)

| Component | Role | Build days (estimate) |
|---|---|---|
| `MemoryArticle` data model + crypto | Struct, org+agent keypairs, sign/verify via `cryptography` lib | ~2 |
| Local embedding node on Radeon | Small open embedder (`nomic-embed-text`/`bge-small-en`) via vLLM-on-ROCm or PyTorch ROCm. Embeds at publish, retrieves at query. | ~4–5 |
| Fabric sync (federated pub/sub) | Broker service routing articles between nodes by topic+scope. | ~3 |
| Two demo agents (one per tenant) | LangChain / LlamaIndex agents performing publish + query + derive. | ~2 |
| Cortex Console UI | Web or CLI: live fabric view, article flow, provenance graph, trust scores, scope filter. | ~5 |
| AMD/ROCm benchmark visual | "Queries/sec on Radeon vs CPU" panel — feeds the 40-pt GPU axis. | ~1 |
| Demo scenario data + scripts | Synthetic domain data + scripted demo narrative. | ~2 |
| **Total** | | ~19 days (of ~21 available) |

### 5.2 Out of scope (roadmap)

- Full p2p mesh with gossip protocol (federated pub/sub suffices for demo)
- ZK-proofs of provenance (P1 Cipher — represented as "verified" badges stubbed in UI; roadmap fills in)
- Cryptographic trust propagation algorithm (static trust scores for demo; algorithmic propagation roadmap)
- Production-scale retrieval (small article corpus, ~10,000s)
- Multi-region deployment, persistence sharding
- P2 Ledger audit chain (referenced via `computation_ref` stub; roadmap fills in)

---

## 6. Cortex × P1 (Cipher) × P2 (Ledger) — roadmap layering

Cortex is the **first slice of a three-product stack**. The other two are roadmap:

```
Cortex (memory fabric)               ← Hackathon MVP
   │ publishes articles with ↓
P1 Cipher (zk-attestation)           ← Roadmap: crypto proofs of computation
   │ "I computed this finding" proven cryptographically
   │ anchor proofs into ↓
P2 Ledger (audit chain)              ← Roadmap: signed, regulator-verifiable, append-only
   │ regulator-verifiable history of all fabric activity
```

Each layer reinforces the next:
- **Cortex memory** carries provenance metadata hooks
- **Cipher proof** fills the hook with cryptographic attestation ("did this agent actually run this?")
- **Ledger anchor** stores the proof in a tamper-evident, regulator-verifiable record

Hackathon ships Cortex (with hooks for the other two as "verified" placeholders in the UI). Roadmap fills in Cipher + Ledger over the following 6 months.

---

## 7. Demo scenarios (candidates)

Cortex is domain-agnostic by design. The hackathon demo requires **one committed scenario** for the deep walkthrough, with optional second-scenario montage to prove generality.

### 7.1 Scenario evaluation criteria

| Trait | Why it matters |
|---|---|
| Cross-org is real business reality | Judges instantly see "yes, that's a real problem today" |
| Provenance is competitively critical | Without provenance, demo is just shared RAG. Provenance must be hero. |
| Sovereignty is non-negotiable | If "just trust a vendor" seems viable, GPU-sovereignty deflates |
| Synthetic demo data is trivial | 3 weeks solo — cannot be crafting real-looking datasets |
| Decisions are auditable by watching | Judge can mentally trace "yes, I'd want this verified" in seconds |
| Multi-agent is natural | Otherwise looks contrived |

### 7.2 Candidate scenarios

#### F1 — Cybersecurity SOC consortium (Recommended)
Multiple Security Operations Centers' agents share threat findings via Cortex. SOC Alpha's agent detects a new TTP tied to threat actor X; SOC Beta's agent queries the fabric for "what's new on X?" → retrieves Alpha's finding **with full provenance** (which SOC, which analyst-bot, which telemetry, which timestamp). Neither SOC exposes probe placement, customer data, or analyst identities.
- **Strengths:** ISACs already do this manually with CSV feeds and trust agreements — agent-native fabric is the obvious 2028 product. Provenance *is* the currency in cyberthreat intel (credibility disputes, CVE assignment, attribution). Synthetic data is trivially public (CVEs, MITRE ATT&CK techniques, published IOC lists). Visual demo ("ATT&CK matrix lights up as findings flow between SOC consoles") is instant-grasp.
- **Weaknesses:** None material.

#### Healthcare — Hospital + Research Lab
Hospital's clinical agent retrieves findings from a research lab's literature-analysis agent. Patient data never leaves the hospital; research methods never leave the lab.
- **Strengths:** Strongest real-world stakes; EU AI Act + HIPAA resonance.
- **Weaknesses:** Synthetic clinical findings must look believable; harder to fabricate than CVEs.

#### Legal — Two law firms sharing precedent knowledge
Firm A's agent publishes a precedent analysis; Firm B's agent retrieves it with provenance. Neither firm exposes clients or strategy.
- **Strengths:** Smart on novelty; sovereignty native to legal domain (attorney-client privilege).
- **Weaknesses:** Weaker emotional stakes; judges have seen many legal AI demos.

#### Finance — Bank + insurance carrier
Bank's risk agent publishes a fraud-pattern finding; insurance carrier's agent retrieves it with provenance. Neither exposes customer data.
- **Strengths:** Audit/compliance resonance; visually plausible.
- **Weaknesses:** Synthetic financial data must look credible; less novel domain.

#### F2 — Pharma R&D real-world evidence loop
Pharma's clinical-trial-analysis agent + hospital network's real-world-outcomes agent. Pharma learns efficacy improvement in subgroup Y from real-world practice — without seeing a single patient record. Hospital learns new contraindication from pharma's trial data commitments.
- **Strengths:** Big-money domain; RWE is a real FDA regulatory category.
- **Weaknesses:** Demands believable clinical synthetic data (harder than CVEs).

#### F3 — Public health outbreak surveillance
Multiple hospitals' agents publish anonymized signals (respiratory case uptick, symptom cluster); CDC/WHO agent queries the fabric → reconstructs outbreak pattern with provenance per contributing hospital.
- **Strengths:** Emotionally heavy (post-COVID judges); sovereignty at its most absolute (state privacy + HIPAA).
- **Weaknesses:** Synthetic-data realism is make-or-break; politicized topic.

#### F4 — AV fleet edge-case learning
Fleet A's agent discovers a rare pedestrian-interaction pattern at a specific intersection type; Fleet B's agent queries the fabric before deploying to similar intersections → retrieves the finding with provenance. No fleet exposes raw training logs to competitors.
- **Strengths:** Massive 2028 fit (cross-fleet learning is THE unsolved problem in AV); visually amazing paired with CARLA simulator.
- **Weaknesses:** Simulator integration adds ~1 week; severe schedule risk for solo + 3 weeks.

#### F5 — AI safety incident registry (meta)
Multiple AI-deploying orgs' agents publish safety incident findings ("our agent did X unintentionally in scenario Y"); other orgs' agents query to check if their deployment exposes the same risk.
- **Strengths:** Self-referentially on-theme; meta-clever.
- **Weaknesses:** Less visceral stakes; inside-baseball for non-AI-safety judges.

### 7.3 Recommended scenario

**F1 (Cybersecurity SOC consortium)** is recommended as the demo scenario:
- ISACs are a *literal existing manual process* with an obvious 2028 automation target
- Provenance is native to the domain (credibility, attribution, CVE assignment)
- Synthetic data is free (CVEs, MITRE ATT&CK, public IOC lists)
- Sovereignty is non-negotiable, not feature-y
- VISUAL: console shows ATT&CK matrix, threat actor cards, finding flow between SOCs — instant-grasp

**Optional hedge:** ship Cortex domain-agnostic, demo F1 as the deep walkthrough, with a 30-second "also works in healthcare" montage segment to prove generality.

**Decision pending from user.**

---

## 8. AMD Radeon / ROCm integration

The 40-point AMD/ROCm axis is the load-bearing differentiator. Cortex's value proposition depends on local sovereign inference — CPU-only proofs nothing; GPU-on-Radeon proves a category.

### 8.1 What runs on Radeon

| Function | Model / library | Radeon integration path |
|---|---|---|
| Article embedding (publish time) | `nomic-embed-text` or `bge-small-en` (~130M params) | vLLM-on-ROCm or PyTorch-direct with ROCm wheel |
| Semantic retrieval (query time) | Same embedder + FAISS-gpu or HNSW | ROCm-supported FAISS build, or PyTorch tensor ops |
| Agent reasoning over retrieved articles | Open LLM (4–8B params) — stretch goal Aurora 30.5B MoE | vLLM-on-ROCm |
| Trust scoring / provenance graph | NetworkX-style graph algorithms, GPU-accelerated where useful | PyTorch-ROCm for matrix/graph ops |
| Benchmark panel | Queries/sec with vs without GPU | Same stack, dual measurements |

### 8.2 ROCm spike (Day 1 — critical path)

**Day 1 milestone:** any embedding model running inference on the AMD-provided Radeon GPU via ROCm, end to end, with a measured throughput number.

- If ROCm integration stalls → fall back to PyTorch+CUDA-on-borrowed-NVIDIA with "production deployment targets Radeon MI300X (already supported by Aurora)" narrative.
- Do NOT begin any other engineering work until this spike produces a working GPU embedding call.

### 8.3 Hackathon GPU access

Per the hackathon brief, "eligible participants may receive access to AMD Radeon GPU development resources during the competition period." The repo with instructions is at `AMD-DEV-CONTEST/Radeon-hackathon-2026-07/README.md` on GitHub. Registration in the AMD AI Developer Program is a prerequisite for prize payout (not for GPU access per se, but for awards).

---

## 9. Hackathon judging alignment

Track 2 (Agentic AI) — 100 points total.

| Criterion | Points | How Cortex wins |
|---|---|---|
| Functional completeness and application value | 60 | Two agents cooperate across a trust boundary using a working memory fabric with publish + query + derive loops. Solves a real domain problem (cyberthreat intel sharing via ISACs). The agent's task is useful — not a toy. |
| Scenario innovation and user experience | (within 60) | Cortex Console UI shows the fabric in real time — articles flowing between SOCs, provenance graph expanding, trust scores updating, scope filtering visible. Genuinely delightful to watch. |
| AMD Radeon GPU and ROCm optimization | 40 | Local inference (embed, retrieve, agent reasoning, trust scoring) all on Radeon via ROCm. Benchmark panel shows the GPU is load-bearing. Sovereignty pitch: "only feasible because Radeon keeps the computation sovereign." |

---

## 10. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **ROCm + embedding model integration** — driver/version issues eating 3–5 days | High | Day 1 spike before any other engineering. Fallback to CUDA-on-NVIDIA with Radeon-targeted narrative. |
| **Scope creep** — Cortex is vast; building the platform instead of the demo | High | Articulate single 2-minute demo narrative before writing code. Anything not serving that demo is roadmap. |
| **Single point of failure** — solo, every blocker stalls everything | Med | Day 1 ROCm spike + Day 2–3 minimum viable MemoryArticle + crypto → vertical slice up front → de-risk before UX. |
| **Demo scenario credibility** — judges need to instantly "get" why this is novel | High | Pick F1 (SOC consortium) where provenance is already the domain currency. |
| **Synthetic domain data quality** — if findings look fake, demo deflates | Med | F1 uses public CVE/ATT&CK data → trivially credible. Healthcare scenarios are higher risk. |
| **AMD GPU access timing** — registration approval might delay access | Med | Apply Day 0. Begin Day 1 work on local NVIDIA or CPU fallback; swap to Radeon when access lands. |

---

## 11. 3-week build plan

21 calendar days (Jul 15 – Aug 6); reserve ~3 days for demo recording + submission packaging.

### Week 1 (Days 1–7): Foundations + Spike

| Day | Work | Exit criteria |
|---|---|---|
| D1 | ROCm spike — get any embedder running on Radeon. Apply for AMD GPU access if not already approved. | A working `embed("text") → [vector]` call, executed on Radeon |
| D2–3 | `MemoryArticle` data model + crypto sign/verify. Define schemas, keypairs, signing flow. | Can sign and verify a MemoryArticle round-trip in Python |
| D4–5 | Local embedding node: embed on publish, similarity search on query. Use small corpus. | Publish → embed → store → query → ranked results |
| D6–7 | Broker service: route signed articles between two in-memory nodes by topic+scope. | Two nodes exchange articles only when scope permits |

### Week 2 (Days 8–14): Agents + UX

| Day | Work | Exit criteria |
|---|---|---|
| D8–9 | Build two demo agents for chosen scenario (likely F1). Each publishes + queries + derives. | Agents share knowledge across the fabric end-to-end |
| D10–12 | Cortex Console UI: real-time feed of articles between nodes, provenance panel, trust score display, scope filter toggle. | Judge could operate the UI cold |
| D13–14 | Derive loop polish: show provenance graph extending as agents compose new articles | Third article's provenance graph visibly includes its cited sources |

### Week 3 (Days 15–21): Demo + Polish + Submit

| Day | Work | Exit criteria |
|---|---|---|
| D15 | Benchmark panel: queries/sec Radeon vs CPU; latency per publish/query with vs without GPU | Numbers in the UI, ready for the judging deck |
| D16–17 | Demo script + recorded walkthrough (3-5 min video or live-demo script) | End-to-end demo renderable in 3-5 minutes |
| D18–19 | Polish: copy, error handling, UI edge cases | Demo is fault-tolerant enough to run live |
| D20 | Submission assembly: project spec PDF, README, demo video (3-5 min), PPT. Fork `AMD-DEV-CONTEST/Radeon-hackathon-2026-07` → open PR `"Track 2, Perciqa, Cortex"` | All submission artifacts ready, PR open |
| D21 (buffer) | Final tweaks, submit | Submitted before Aug 6, 11:59 PM EDT |

---

## 12. Open questions (need user decisions)

1. **Demo scenario** — Which of the candidates (F1 SOC / Healthcare / Legal / Finance / F2 Pharma / F3 Public health / F4 AV / F5 AI-safety registry) is the committed demo scenario?
2. **Montage vs single scenario** — Build Cortex domain-agnostic, demo with one main walkthrough + 30-second "also works in X" montage, or ship narrow with only one scenario?
3. **Headline agent LLM** — Aurora 30.5B MoE (high wow, AMD-supported officially, higher inference integration risk) vs smaller open model (Llama/Qwen 4–8B, lower risk, less dramatic)?
4. **UI surface** — Web (browser-based Console) vs TUI (terminal-based console)?
5. **Submission format** — Live demo vs pre-recorded video (per hackathon rules check).
6. **Name reservation** — Is "Cortex" the final product name, or a working title? Does Perciqa want to reserve a different label?

---

## 13. Success criteria (hackathon)

- **Top 3 placement in Track 2** ($1,500 minimum)
- Working demo with at least one scenario end-to-end
- Cortex Console visibly shows: article flow across orgs, provenance graph, trust scores, scope filtering
- AMD Radeon local inference measured and displayed in the UI
- Clean, documented, runnable repository with README + demo video

### Long-term success criteria (post-hackathon, out of scope for this PRD)

- Open-source Cortex release
- Adoption across ≥3 ISACs or equivalent industry consortiums
- P1 Cipher zk-proof integration
- P2 Ledger audit chain integration
- Commercial tier (Perciqa-hosted fabric coordination + enterprise broker)

---

## 14. References

- AMD AI DevMaster Hackathon — competition brief (this document's source)
- `AMD-DEV-CONTEST/Radeon-hackathon-2026-07/README.md` — GPU access instructions
- AMD AI Developer Program — registration prerequisite for prize eligibility
- Perciqa content plan — `docs/2026-07-12-content-plan.md` (planned "AMD vs NVIDIA local agent inference" article aligns with Cortex's local inference angle)
- Discord: https://discord.gg/zt9caur5B3
- Email: ai_dev_contests@amd.com

---

## 15. Revision history

| Date | Version | Author | Notes |
|---|---|---|---|
| 2026-07-15 | v0.1 | orbinix | Initial draft from brainstorming session. Scenarios + LLM choice pending user decisions. |