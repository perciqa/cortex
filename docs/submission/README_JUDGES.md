# Perciqa Cortex — Judge-Facing README

**Track:** AMD AI DevMaster Hackathon 2026 — Track 2 (Radeon/ROCm)

**One-line pitch:** A decentralized, cryptographically-proven agent-memory fabric
where two sovereign organizations' agents share findings without ever exchanging
raw data — every article carries its source hash, its producer DID, and a
machine-verifiable trust score.

## Submission artifacts

| Artifact | Path |
|---|---|
| Pitch deck outline | [`docs/submission/slides_outline.md`](../submission/slides_outline.md) |
| End-to-end smoke test | `pytest tests/e2e/test_demo_e2e_smoke.py` |
| Source code | [`scenarios/soc_consortium/`](../../scenarios/soc_consortium/) |
| Demo narration script | [`scenarios/soc_consortium/demo_script.md`](../../scenarios/soc_consortium/demo_script.md) |
| Console password | `judge@amd-hackathon.dev` / `cortex-demo-2026` |

## Architecture in one paragraph

Two tenant nodes (one per org) embed, sign, store, query, and derive memory
articles locally on AMD Radeon GPUs via ROCm. A single WebSocket broker routes
envelopes with topic+scope ACLs.

## Running the demo locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
python scenarios/soc_consortium/demo_run.py --no-record-optional
```

### With live LLM reasoning (Gemma 4 12B on inference pod)

```bash
ssh -i ~/.ssh/rocm_pod -p 31047 -fNL 8000:localhost:8000 root@36.150.116.206
VLLM_URL=http://localhost:8000/v1 python scenarios/soc_consortium/demo_run.py
```

The demo auto-detects `VLLM_URL` and routes agent reasoning through the live LLM.
Override model with `VLLM_MODEL` or API key with `VLLM_API_KEY`.

### Docker Compose (all services)

```bash
docker compose -f deploy/docker-compose.yml up
```

This starts the broker, two tenant nodes, and the console UI at `http://localhost:8080`.

## Console UI

The Cortex Console is available at:
- **Local Docker:** `http://localhost:8080` (no password)
- **Hosted:** `https://cortex.perciqa.com`

> **Hosted login credentials** — Email: `judge@amd-hackathon.dev` / Password: `cortex-demo-2026`

The Console shows:
- Real-time article flow between SOC Alpha and SOC Beta tenants
- MITRE ATT&CK matrix lighting up as findings arrive
- Provenance graph with signature verification status
- Trust score breakdown per article
- GPU vs CPU benchmark panel (embeds/sec, query latency)

## AMD angle (the 40-point axis)

- Embeddings: BAAI/bge-small-en-v1.5 on ROCm via PyTorch-on-ROCm
- Reasoning: Gemma 4 12B instruct via vLLM-on-ROCm (routed through `CortexAgent`'s reasoner; falls back to scripted if no inference pod is available)
- Bench: per-node sidecar measures Radeon vs CPU throughput for both the embed
  model and the reasoner
- Swappable: any OpenAI-compatible model via `VLLM_MODEL` env var

## Roadmap (post-hackathon)

1. Open-source the fabric protocol as `perciqa-cortex-spec`
2. Ship a hosted ISAC offering for SOC consortium customers
3. Extend to healthcare (RWE loop) and finance (fraud intel) registries
