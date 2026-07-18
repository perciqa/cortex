# Perciqa Cortex — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working **Perciqa Cortex** hackathon MVP — a decentralized agent-memory fabric with cryptographic provenance — to AMD AI DevMaster Hackathon 2026 (Track 2), with a domain-agnostic protocol, an F1 (Cybersecurity SOC consortium) demo walkthrough, and a 30-second healthcare montage.

**Architecture:** Federated pub/sub (not p2p mesh). Two sovereign tenant nodes (one per org) embed, sign, store, query, and derive **memory articles** locally on Radeon GPUs via ROCm; a single broker routes envelopes between tenants with topic+scope ACLs; a React Console reads the read-only event/metrics streams for the live demo; a benchmark sidecar produces the AMD-load-bearing visual evidence.

**Tech Stack:** Python 3.11+, PyTorch-on-ROCm, `bge-small-en-v1.5` embedder, FAISS-gpu / hnswlib, SQLite, NetworkX, `cryptography` (Ed25519), `websockets` (RFC 6455), FastAPI, React + Vite + TypeScript + Tailwind + vis-network + recharts, Llama-3 8B / Qwen-2.5 7B via vLLM-on-ROCm for agent reasoning.

---

## 0. Resolved decisions (binds all sub-plans)

These supersede the "pending" rows in PRD §12 and Design §19. Every sub-plan MUST treat them as fixed.

| # | Decision | Value |
|---|---|---|
| D1 | Headline embedder | `bge-small-en-v1.5` (384-dim, 33M params) |
| D2 | Headline agent reasoning LLM | Small open model via vLLM-on-ROCm (default Llama-3 8B; Qwen-2.5 7B fallback). Aurora 30.5B MoE = stretch only |
| D3 | UI framework | React SPA + FastAPI backend (Vite + TS + Tailwind) |
| D4 | Bench sidecar topology | Per-node sidecar (richer UI signal) |
| D5 | Article content field cap | 2,000 characters natural language |
| D6 | Replay window | 600 s |
| D7 | Trust formula weights | `0.6 * base_trust + 0.4 * source_trust - source_penalty` |
| D8 | Demo scenario | F1 Cybersecurity SOC consortium (deep walkthrough) |
| D9 | Generality strategy | Domain-agnostic core + F1 deep demo + ~30 s healthcare montage |
| D10 | Submission format | Pre-recorded video primary, live-capable backup |
| D11 | Product name | "Perciqa Cortex" (working title, not final) |

## 1. Repository layout (target)

Mirrors Design §18. The implementer will create this tree in the first task of the master plan; each module plan extends it.

```
cortex/
├── README.md                            # already exists at repo root
├── docs/
│   ├── 2026-07-15-cortex-prd.md         # already exists
│   ├── 2026-07-15-cortex-design.md      # already exists
│   └── superpowers/plans/               # created by this planning step
├── pyproject.toml
├── cortex/
│   ├── __init__.py
│   ├── core/                            # see cortex-core plan
│   ├── node/                            # see cortex-node plan
│   ├── broker/                          # see cortex-broker plan
│   ├── sdk/                             # see cortex-sdk plan
│   ├── console/                         # see cortex-console plan
│   └── bench/                           # see cortex-bench plan
├── scenarios/
│   └── soc_consortium/                  # see cortex-scenario-demo plan
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── deploy/
│   ├── docker-compose.yml
│   └── Makefile
└── docs/submission/                     # judge-facing artifacts
```

## 2. Module dependency graph

```
                 ┌─────────────┐
                 │ cortex-core │  (no deps)
                 └──────┬──────┘
                        │
        ┌───────────────┼────────────────┐
        │               │                │
        ▼               ▼                ▼
┌──────────────┐ ┌────────────┐  ┌──────────────┐
│ cortex-node  │ │cortex-broker│  │ cortex-bench │
└──────┬───────┘ └──────┬──────┘  └──────┬───────┘
       │                │                │
       └──────────┬─────┘                │
                  │                      │
                  ▼                      │
          ┌────────────┐                  │
          │ cortex-sdk │ ◀───────────────┘
          └──────┬─────┘
                 │
                 ▼
        ┌────────────────┐
        │ cortex-console │ (also subscribes to broker events)
        └────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │ cortex-scenario    │ (demo scripts; uses sdk + node)
        └────────────────────┘
```

**Sequence enforced by master plan:**
1. `cortex-core` first (no deps)
2. `cortex-core` + `cortex-broker` in parallel (broker only depends on envelopes from core)
3. `cortex-node` once core is stable (depends on core + broker wire format)
4. `cortex-sdk` once `CortexNode` class surfaces exist
5. `cortex-bench` can start in parallel with `cortex-sdk` (depends on node)
6. `cortex-console` once the broker event/metrics contract is frozen
7. `cortex-scenario-demo` last (uses sdk + console URL + bench metrics)

## 3. Schedule (3 weeks, solo). Maps to PRD §11

Week 1 — Foundations + Spike [` DONE ✅`]
- ✅ D1 — ROCm spike (see Task 0 below). Succeeded — 1,004 embeds/sec on MI300X.
- ✅ D2–3 — `cortex-core` (data model, crypto, canonical serialization).
- ✅ D4–5 — `cortex-node` (embedder + ArticleStore + VectorIndex + local publish/query).
- ✅ D6–7 — `cortex-broker` (WebSocket, ACL, registry, fan-out).

Week 2 — Agents + UX [` DONE ✅`]
- ✅ D8–9 — `cortex-sdk` + scenario agent scripts (publish → query → derive loop).
- ✅ D10–12 — `cortex-console` (React SPA, FastAPI backend, ATT&CK matrix, provenance graph).
- ✅ D13–14 — `cortex-bench` + derive-loop polish.

Week 3 — Demo + Submit
- ✅ D15 — Bench panel integration into Console.
- ✅ D16–17 — Demo script written at `scenarios/soc_consortium/demo_script.md`. 🔴 **Video not yet recorded**.
- ✅ D18–19 — Healthcare montage at `scenarios/soc_consortium/montage_healthcare.py`.
- ✅ D20 — Submission assembly: project spec, README, PPTX pitch deck done. PR opened at `AMD-DEV-CONTEST/Radeon-hackathon-2026-07#10`.
- 🔴 D21 — Final tweaks + submit. **Blocked on demo video recording.**

## 4. Sub-plan index

| Plan | Covers | File |
|---|---|---|
| 1 | Data model, crypto, canonical JSON, Article lifecycle | [`2026-07-18-cortex-core.md`](./2026-07-18-cortex-core.md) |
| 2 | Embedder, ArticleStore, VectorIndex, ProvenanceGraph, TrustEngine, broker client, `CortexNode` class | [`2026-07-18-cortex-node.md`](./2026-07-18-cortex-node.md) |
| 3 | WebSocket broker, ACL, registry, event/metrics channels, query fan-out | [`2026-07-18-cortex-broker.md`](./2026-07-18-cortex-broker.md) |
| 4 | `CortexClient`, LangChain + LlamaIndex adapters | [`2026-07-18-cortex-sdk.md`](./2026-07-18-cortex-sdk.md) |
| 5 | FastAPI backend, React SPA, all 7 views, visual language | [`2026-07-18-cortex-console.md`](./2026-07-18-cortex-console.md) |
| 6 | Bench harness, Radeon vs CPU metrics, Prometheus exporter | [`2026-07-18-cortex-bench.md`](./2026-07-18-cortex-bench.md) |
| 7 | F1 scenario data, two agents, healthcare montage, demo recording | [`2026-07-18-cortex-scenario-demo.md`](./2026-07-18-cortex-scenario-demo.md) |

## 5. Boilerplate task: scaffold repo + tooling (run once)

This is the single shared setup task. Every sub-plan assumes it is already done.

**Files:**
- Create: `pyproject.toml`
- Create: `cortex/__init__.py`, `cortex/core/__init__.py`, `cortex/node/__init__.py`, `cortex/broker/__init__.py`, `cortex/sdk/__init__.py`, `cortex/console/__init__.py`, `cortex/bench/__init__.py`
- Create: `tests/__init__.py`, `tests/unit/__init__.py`, `tests/integration/__init__.py`, `tests/e2e/__init__.py`
- Create: `tests/conftest.py`
- Create: `deploy/Makefile`, `deploy/docker-compose.yml` (stubs)
- Modify: `.gitignore` (add `__pycache__/`, `*.pyc`, `.venv/`, `node_modules/`, `cortex-node/` runtime paths)

- [x] **Step 1: Confirm Python version**

Run: `python3 --version`
Expected: `Python 3.11.x` or newer. If older, install Python 3.11+ before continuing.

- [x] **Step 2: Write `pyproject.toml`** with the following content.

```toml
[project]
name = "percq-cortex"
version = "0.1.0"
description = "Decentralized agent memory fabric with cryptographic provenance"
readme = "README.md"
requires-python = ">=3.11"
authors = [{ name = "orbinix" }]
license = { text = "TBD" }

dependencies = [
    "cryptography>=42.0",
    "pydantic>=2.6",
    "pyyaml>=6.0",
    "websockets>=12.0",
    "fastapi>=0.111",
    "uvicorn[standard]>=0.30",
    "numpy>=1.26",
    "networkx>=3.3",
    "httpx>=0.27",
]

[project.optional-dependencies]
gpu = [
    "torch>=2.3",
    "faiss-gpu>=1.8",
]
cpu = [
    "hnswlib>=0.8",
    "sentence-transformers>=3.0",
]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "pytest-cov>=5.0",
    "ruff>=0.4",
    "mypy>=1.10",
    "requests>=2.32",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
addopts = "-ra --strict-markers"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "SIM", "RET"]

[tool.mypy]
python_version = "3.11"
strict = true
ignore_missing_imports = true
```

- [x] **Step 3: Create package skeletons**

Run:

```bash
mkdir -p cortex/{core,node,broker,sdk,console,bench}
mkdir -p tests/{unit,integration,e2e}
mkdir -p scenarios/soc_consortium/dataset
mkdir -p deploy docs/submission
for d in cortex cortex/core cortex/node cortex/broker cortex/sdk cortex/console cortex/bench \
         tests tests/unit tests/integration tests/e2e; do
  touch "$d/__init__.py"
done
```

- [x] **Step 4: Write `tests/conftest.py`**

```python
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
```

- [x] **Step 5: Write `.gitignore` additions**

Append to existing `.gitignore`:

```
__pycache__/
*.pyc
.venv/
node_modules/
cortex-node/
*.sqlite
*.bin
vectors/
keys/
logs/
.pytest_cache/
.mypy_cache/
.ruff_cache/
htmlcov/
.coverage
```

- [x] **Step 6: Create venv and install dev deps**

Run:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev,cpu]"
```

Expected: installation succeeds. GPU extras are installed during the ROCm spike task below.

- [x] **Step 7: Sanity test that pytest runs**

Run: `pytest -q`
Expected: `no tests ran in X.XXs` (zero tests, no errors).

- [x] **Step 8: Commit**

```bash
git add pyproject.toml cortex/ tests/ deploy/ .gitignore
git commit -m "feat: scaffold cortex package skeleton, pyproject, test harness"
```

## 6. Task 0 — ROCm spike (PRD §8.2 critical path)

MUST succeed before any other engineering work begins. Falls back to CUDA-on-NVIDIA with "production deployment targets Radeon MI300X (already supported by Aurora)" narrative if Radeon integration stalls.

**Files:**
- Create: `spikes/rocm_embed_spike.py`
- Create: `spikes/README.md`

- [x] **Step 1: Apply for AMD AI Developer Program** (if not already approved). Visit the URL from `AMD-DEV-CONTEST/Radeon-hackathon-2026-07/README.md` on GitHub. Record the registration confirmation email timestamp in `spikes/README.md`.

- [x] **Step 2: Detect Radeon availability**

Run: `rocm-smi 2>&1 | head -20 || echo "no rocm-smi"`
Expected: either a MI300X / RX 7900 device listing, or a "no rocm-smi" message (triggers fallback).

- [x] **Step 3: If Radeon present — install ROCm-enabled PyTorch**

Run: `pip install torch torchvision --index-url https://download.pytorch.org/whl/rocm6.1`
Expected: install succeeds; `python -c "import torch; print(torch.cuda.is_available())"` prints `True` and `torch.version.hip` is non-empty.

If Radeon NOT present, install CPU fallback (and document in `spikes/README.md`): `pip install --upgrade torch torchvision && python -c "import torch; print('cuda:', torch.cuda.is_available())"`.

- [x] **Step 4: Write `spikes/rocm_embed_spike.py`**

```python
"""Day-1 ROCm spike: get bge-small-en-v1.5 producing embeddings on Radeon (or fallback)."""
import time
import torch
from torch import Tensor
from transformers import AutoModel, AutoTokenizer

MODEL = "BAAI/bge-small-en-v1.5"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def main(batch: int = 16) -> None:
    tok = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModel.from_pretrained(MODEL).to(DEVICE).eval()
    texts = ["findings on APT29 T1059.001 encoded powershell"] * batch
    t0 = time.perf_counter()
    enc = tok(texts, padding=True, truncation=True, max_length=512, return_tensors="pt").to(DEVICE)
    with torch.inference_mode():
        out: Tensor = model(**enc).last_hidden_state.mean(dim=1)
    out = torch.nn.functional.normalize(out, dim=-1)
    dt = (time.perf_counter() - t0) * 1000.0
    print(f"device={DEVICE} hip={getattr(torch.version, 'hip', None)}")
    print(f"batch={batch} shape={tuple(out.shape)} dtype={out.dtype} latency_ms={dt:.2f}")
    print(f"throughput={batch/(dt/1000):.1f} embeds/sec")


if __name__ == "__main__":
    import sys
    main(batch=int(sys.argv[1]) if len(sys.argv) > 1 else 16)
```

- [x] **Step 5: Run the spike on GPU**

Run: `python spikes/rocm_embed_spike.py 16`
Expected: prints `device=cuda hip='6.1.x.x'` (or `device=cpu` in fallback), shape `(16, 384)`, latency under 80 ms on Radeon.

- [x] **Step 6: Record the measured number**

Append to `spikes/README.md`:

```markdown
# ROCm Spike — 2026-07-18

- Device: <fill from rocm-smi>
- Model: BAAI/bge-small-en-v1.5
- Batch 16 latency (ms): <fill>
- Throughput (embeds/sec): <fill>
- Notes: <any fallback narrative>
```

- [x] **Step 7: If Radeon failed and you fell back to CPU, document the production-target narrative**, and continue — the rest of the build works on CPU; the bench sidecar (cortex-bench plan) will still display CPU numbers, with a placeholder for Radeon numbers when access lands.

- [x] **Step 8: Commit**

```bash
git add spikes/
git commit -m "spike: verify bge-small-en embeddings on Radeon via ROCm"
```

---

## 7. Self-review of the master plan

**Spec coverage check.** PRD §5.1 component inventory → each component is owned by one sub-plan file. PRD §11 D1 ROCm spike → master Task 0. PRD §11 D15 benchmark panel → cortex-bench plan. PRD §11 D16 demo recording → cortex-scenario-demo plan. PRD §7.3 F1 + montage → cortex-scenario-demo plan. Design §18 repo layout → §1 of this master plan. Design §19 decisions D1–D11 → §0 of this master file (all resolved).

**Placeholder scan.** No "TBD/TODO/later" outside the placeholder for the production-narrative paragraph in Task 0 Step 7 (intentional — the recorder fills it in based on spike result). The `LICENSE` text is "TBD" in `pyproject.toml` because the user explicitly chose to defer licensing per README §117.

**Cross-plan type consistency.** The sub-plans will all use:
- `ArticleId = str` (sha256 hex)
- `AgentDID = str` (`did:percq:agent:<uuid>`)
- `OrgDID = str` (`did:percq:org:<slug>`)
- `MemoryArticle` and `Provenance` dataclasses defined in `cortex/core/article.py` (cortex-core plan)
- Envelope JSON shapes defined in `cortex/broker/protocol.py` (cortex-broker plan)
- `CortexNode.publish / query / derive` signatures defined in `cortex/node/node.py` (cortex-node plan)

If any sub-plan redefines these, fix in self-review.

## 8. Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-18-cortex-master.md` plus seven sub-plans.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Required sub-skill: `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Pick an approach before starting Task 0 (ROCm spike) — the spike is the gating item and should be first regardless of choice.