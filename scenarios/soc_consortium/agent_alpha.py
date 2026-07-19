"""SOC Alpha agent: query → derive insight."""
import argparse
import json
import os
from pathlib import Path

from cortex.sdk.llm import ScriptedReasoner, vLLMClient


def step_query(client, queries: str, min_trust: float = 0.0, top_k: int = 5) -> list[dict]:
    results = client.search(queries, scopes={"public"}, top_k=top_k, min_trust=min_trust)
    return [
        {"article_id": r.article_id, "content_preview": r.article.content[:120],
         "trust": r.trust_score}
        for r in results
    ]


def step_derive(client, retrieved: list[dict],
                reasoner: str = "scripted",
                llm: vLLMClient | None = None) -> dict:
    article_ids = [r["article_id"] for r in retrieved[:3]]
    if len(article_ids) < 3:
        raise RuntimeError(f"Need at least 3 retrieved findings, got {len(article_ids)}")

    if reasoner == "vllm" and llm is not None:
        previews = "\n".join(
            f"- {r['article_id']}: {r['content_preview'][:200]}"
            for r in retrieved[:3]
        )
        prompt = (
            "You are a SOC analyst reviewing threat intelligence findings. "
            "Synthesize a concise insight article from the following findings "
            "attributed to APT29, identifying the coordinated campaign and "
            "key TTPs (especially T1059.001). Provide a short paragraph.\n\n"
            f"Findings:\n{previews}"
        )
        body = llm.chat([{"role": "user", "content": prompt}])
    else:
        text = "Inferred coordinated APT29 activity leveraging T1059.001 across findings "
        text += ", ".join(article_ids) + ". Corroborated by source-hash provenance chain."
        r = ScriptedReasoner(steps=[{"final": text}])
        body = r.step({}, [])["final"]

    payload = {"query": "T1059.001 APT29 indicators",
               "source_article_ids": article_ids,
               "tactic": "Execution", "technique_id": "T1059.001"}

    insight_id = client.publish_insight(
        content=body, payload=payload, scope="public", cites=article_ids,
    )
    return {"insight_article_id": insight_id, "sources": article_ids, "body": body}


def run(client, queries: str = "T1059.001 APT29 indicators",
        min_trust: float = 0.0, top_k: int = 5, step: str = "all",
        reasoner: str = "scripted", vllm_url: str = "http://localhost:8000/v1") -> dict:
    """Run agent alpha: query and/or derive. Returns result dict."""
    llm: vLLMClient | None = None
    if reasoner == "vllm":
        llm = vLLMClient(base_url=vllm_url)

    result = {}
    if step in ("query", "all"):
        retrieved = step_query(client, queries, min_trust, top_k)
        result["retrieved"] = retrieved
        if step == "query":
            return result

    if step in ("derive", "all"):
        retrieved = result.get("retrieved", [])
        if not retrieved:
            retrieved = step_query(client, queries, min_trust, top_k)
        derive_result = step_derive(client, retrieved, reasoner=reasoner, llm=llm)
        result.update(derive_result)

    if llm is not None:
        llm.close()

    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--broker", required=True)
    ap.add_argument("--node", required=True)
    ap.add_argument("--queries", default="T1059.001 APT29 indicators")
    ap.add_argument("--reasoner", choices=["scripted", "vllm"], default="scripted")
    ap.add_argument("--vllm-url", default="http://localhost:8000/v1",
                    help="vLLM API endpoint (overridden by VLLM_URL env var)")
    ap.add_argument("--min-trust", type=float, default=0.0)
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument("--step", choices=["query", "derive", "all"], default="all")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    vllm_url = os.environ.get("VLLM_URL", args.vllm_url)

    import asyncio

    from cortex.node.keys import ensure_keys
    from cortex.node.node import CortexNode

    async def _run():
        keys = {"org": ensure_keys(Path("/tmp/cortex-alpha/org.pem")),
                "agent": ensure_keys(Path("/tmp/cortex-alpha/agent.pem"), kind="agent")}
        tmp = Path("/tmp/cortex-alpha")
        tmp.mkdir(parents=True, exist_ok=True)
        reg = tmp / "reg.json"
        reg.write_text('{"did:percq:org:soc-alpha":{"pubkey":"A","name":"Alpha","topics":["*"]}}')

        cfg = tmp / "alpha.yaml"
        cfg.write_text(f"""\
node:
  org_did: did:percq:org:soc-alpha
  agent_did: did:percq:agent:alpha-bot-1
  key_paths:
    org: {keys['org']}
    agent: {keys['agent']}
broker:
  url: {args.broker}
  registry: {reg}
  replay_window_sec: 600
embedder:
  model: BAAI/bge-small-en-v1.5
  backend: cpu
  batch_size: 4
  fallback_on_oom: true
vector_index:
  backend: hnswlib
  metric: cosine
  hnsw:
    M: 16
    ef_construction: 100
    ef_search: 32
trust:
  default_org_reputation: 0.85
  half_life_days: 90
  min_trust_default: 0.3
query:
  default_top_k: 5
  deadline_ms: 4000
  min_trust: 0.0
logging:
  level: WARNING
  file: /tmp/cortex-alpha/n.log
""")

        from cortex.sdk.client import CortexClient
        node = CortexNode(
            org_did="did:percq:org:soc-alpha",
            agent_did="did:percq:agent:alpha-bot-1",
            key_paths=keys, broker_url=args.broker, config_path=cfg,
            embedder_backend_override="auto",
        )
        await node.start()
        client = CortexClient(node)
        result = run(client, args.queries, args.min_trust, args.top_k, args.step,
                      reasoner=args.reasoner, vllm_url=vllm_url)
        Path(args.out).write_text(json.dumps(result, indent=2))
        print("retrieved article_ids:", [r["article_id"] for r in result.get("retrieved", [])])
        if "insight_article_id" in result:
            print("insight published:", result["insight_article_id"])
        await node.stop()
        return 0

    return asyncio.run(_run())


if __name__ == "__main__":
    raise SystemExit(main())
