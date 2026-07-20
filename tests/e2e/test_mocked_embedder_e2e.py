"""E2E orchestration test with mocked embedder and vector index.

No PyTorch/transformers/hnswlib required — avoids all C-extension segfaults
on Python 3.14.

Exercises the full stack:
  broker -> nodes -> seed -> agents -> trust -> query -> derive -> provenance

Also tests the vLLM reasoner path with a mocked vLLM client.
"""

import asyncio
import contextlib
import json
import socket
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest

from cortex.broker.server import BrokerServer
from cortex.node.node import CortexNode
from cortex.sdk.client import CortexClient


class FakeEmbedder:
    """Stand-in for Embedder that never imports torch/transformers."""

    def __init__(
        self,
        model: str = "",
        backend: str = "cpu",
        batch_size: int = 4,
        fallback_on_oom: bool = True,
        on_embed_failed=None,
    ):
        self.model_name = model
        self.requested_backend = backend
        self.batch_size = batch_size
        self.effective_batch_size = batch_size
        self.fallback_on_oom = fallback_on_oom
        self.on_embed_failed = on_embed_failed
        self.fallback_to_cpu = True
        self._device = "cpu"
        self._model = None
        self._tokenizer = None
        self._torch = None

    def _load(self):
        pass

    def _check_gpu(self) -> bool:
        return False

    def embed(self, texts: list[str]) -> np.ndarray:
        return np.zeros((len(texts), 384), dtype=np.float16)

    def embed_one(self, text: str) -> np.ndarray:
        return np.zeros(384, dtype=np.float16)


class FakeVectorIndex:
    """Brute-force cosine-similarity index — no native C extensions."""

    def __init__(self, dim: int = 384, **kwargs):
        self.dim = dim
        self._vectors: dict[str, np.ndarray] = {}

    def add(self, article_id: str, embedding: np.ndarray) -> None:
        self._vectors[article_id] = np.asarray(embedding, dtype=np.float32).flatten()

    def search(self, query_vec: np.ndarray, top_k: int) -> list[tuple[str, float]]:
        q = np.asarray(query_vec, dtype=np.float32).flatten()
        q_norm = np.linalg.norm(q)
        if q_norm == 0:
            scores = [(aid, 0.5) for aid in self._vectors]
        else:
            scores = []
            for aid, vec in self._vectors.items():
                dot = np.dot(q, vec)
                norm = np.linalg.norm(vec)
                sim = dot / (q_norm * norm) if norm > 0 else 0.5
                scores.append((aid, float(sim)))
        scores.sort(key=lambda x: -x[1])
        return scores[:top_k]

    def size(self) -> int:
        return len(self._vectors)

    def save(self, path: Path) -> None:
        pass

    def load(self, path: Path) -> None:
        pass


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _generate_key(p: Path) -> Path:
    p.parent.mkdir(parents=True, exist_ok=True)
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    k = Ed25519PrivateKey.generate()
    pem = k.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    p.write_bytes(pem)
    p.chmod(0o600)
    return p


def _write_node_cfg(p, org, agent, keys, b_url, reg):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(f"""\
node:
  org_did: {org}
  agent_did: {agent}
  key_paths:
    org: {keys['org']}
    agent: {keys['agent']}
broker: {{url: {b_url}, registry: {reg}, replay_window_sec: 600}}
embedder: {{model: BAAI/bge-small-en-v1.5, backend: cpu, batch_size: 4, fallback_on_oom: true}}
vector_index:
  backend: hnswlib
  metric: cosine
  hnsw:
    M: 16
    ef_construction: 100
    ef_search: 32
trust:
  default_org_reputation: 0.85
  reputation_overrides: {{}}
  half_life_days: 90
  min_trust_default: 0.3
query: {{default_top_k: 5, deadline_ms: 4000, min_trust: 0.0}}
logging: {{level: WARNING, file: {p.parent / 'n.log'}}}
""")


def node_get_article(node, article_id: str):
    if node.store is None:
        return None
    row = node.store.get(article_id)
    if row is None:
        return None
    from datetime import datetime

    from cortex.core.article import MemoryArticle, Provenance
    prov = Provenance(
        producer_agent="", producer_org="",
        computation_ref=None, source_data_hash=None,
        source_data_schema=None, run_id="",
        timestamp=datetime.fromisoformat(row["created_at"]),
    )
    return MemoryArticle(
        id=row["id"], type=row["type"], content=row["content"],
        payload=json.loads(row["payload_json"]),
        embedding=None, embedding_model=None,
        provenance=prov, scope=row["scope"],
        agent_signature=row["agent_sig"],
        org_signature=row["org_sig"],
        cites=json.loads(row["cites_json"] or "[]"),
        trust_score=row["trust_score"],
        trust_expiration=None,
    )


@pytest.fixture
def mock_deps():
    """Replace Embedder and HNSWIndex with fakes for the test scope."""
    with patch("cortex.node.node.Embedder", FakeEmbedder), \
         patch("cortex.node.embedder.Embedder", FakeEmbedder), \
         patch("cortex.node.vector_index.HNSWIndex", FakeVectorIndex), \
         patch("cortex.node.node.HNSWIndex", FakeVectorIndex):
        yield


async def _setup_env(tmp_path: Path):
    """Create broker + 2 nodes with mocked deps. Returns (na, nb, broker, btask)."""
    bp = _free_port()
    reg = tmp_path / "reg.json"
    reg.write_text(json.dumps({
        "did:percq:org:soc-alpha": {"pubkey": "A", "name": "Alpha", "topics": ["*"]},
        "did:percq:org:soc-beta": {"pubkey": "B", "name": "Beta", "topics": ["*"]},
    }))
    broker = BrokerServer(registry_path=reg, host="127.0.0.1", port=bp)
    btask = asyncio.create_task(broker.serve())
    await asyncio.sleep(0.1)
    b_url = f"ws://127.0.0.1:{bp}"

    ka = {"org": _generate_key(tmp_path / "alpha" / "org.pem"),
          "agent": _generate_key(tmp_path / "alpha" / "agent.pem")}
    kb = {"org": _generate_key(tmp_path / "beta" / "org.pem"),
          "agent": _generate_key(tmp_path / "beta" / "agent.pem")}
    ca = tmp_path / "a" / "cfg.yaml"
    cb = tmp_path / "b" / "cfg.yaml"
    _write_node_cfg(ca, "did:percq:org:soc-alpha", "did:percq:agent:alpha-bot-1", ka, b_url, reg)
    _write_node_cfg(cb, "did:percq:org:soc-beta", "did:percq:agent:beta-bot-1", kb, b_url, reg)

    na = CortexNode(org_did="did:percq:org:soc-alpha", agent_did="did:percq:agent:alpha-bot-1",
                    key_paths=ka, broker_url=b_url, config_path=ca,
                    embedder_backend_override="cpu")
    nb = CortexNode(org_did="did:percq:org:soc-beta", agent_did="did:percq:agent:beta-bot-1",
                    key_paths=kb, broker_url=b_url, config_path=cb,
                    embedder_backend_override="cpu")
    return na, nb, broker, btask


async def _start_nodes(na, nb):
    await na.start()
    await nb.start()
    await asyncio.sleep(0.1)


async def _teardown(na, nb, broker, btask):
    await na.stop()
    await nb.stop()
    await broker.stop()
    btask.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await btask


@pytest.mark.asyncio
async def test_mocked_seed_and_alpha(mock_deps, tmp_path):
    """Full stack: broker -> nodes -> seed -> agent_alpha -> provenance."""
    na, nb, broker, btask = await _setup_env(tmp_path)
    await _start_nodes(na, nb)

    assert isinstance(na.embedder, FakeEmbedder)
    assert isinstance(na.vector_index, FakeVectorIndex)

    try:
        from scenarios.soc_consortium.agent_alpha import run as alpha_run
        from scenarios.soc_consortium.seed import seed_articles

        ids = seed_articles(na, nb)
        assert len(ids) == 10, f"expected 10 seeded articles, got {len(ids)}"

        await asyncio.sleep(0.5)

        client_a = CortexClient(na)
        result = alpha_run(client_a, queries="T1059.001 APT29 indicators",
                           min_trust=0.0, top_k=5, step="all")
        assert "insight_article_id" in result, str(result)
        assert len(result.get("sources", [])) == 3, result["sources"]

        insight = node_get_article(na, result["insight_article_id"])
        assert insight is not None
        assert insight.type == "insight"
        assert len(insight.cites) == 3, insight.cites

        assert insight.trust_score is not None
        assert insight.trust_score > 0.0
        assert insight.agent_signature is not None and len(insight.agent_signature) > 0
        assert insight.org_signature is not None and len(insight.org_signature) > 0

        qr = client_a.search("APT29 insight", scopes={"public"}, top_k=5, min_trust=0.0)
        insight_ids = [
            r.article_id for r in qr
            if r.article is not None and r.article.type == "insight"
        ]
        assert result["insight_article_id"] in insight_ids

    finally:
        await _teardown(na, nb, broker, btask)


@pytest.mark.asyncio
async def test_mocked_vllm_reasoner(mock_deps, tmp_path):
    """Agent alpha with --reasoner vllm and mocked vLLM client."""
    na, nb, broker, btask = await _setup_env(tmp_path)
    await _start_nodes(na, nb)

    try:
        from scenarios.soc_consortium.agent_alpha import run as alpha_run
        from scenarios.soc_consortium.seed import seed_articles

        ids = seed_articles(na, nb)
        assert len(ids) == 10

        sent_prompts = []

        def mock_chat(self, messages):
            sent_prompts.append(messages)
            return "Synthetic insight: APT29 indicators corroborate T1059.001 across findings."

        with patch("cortex.sdk.llm.vLLMClient.chat", mock_chat):
            client_a = CortexClient(na)
            result = alpha_run(client_a, queries="T1059.001 APT29 indicators",
                               min_trust=0.0, top_k=5, step="all",
                               reasoner="vllm", vllm_url="http://localhost:9999/v1")

        assert "insight_article_id" in result, str(result)
        assert len(sent_prompts) == 1, "vLLM.chat should have been called once"

        prompt_text = str(sent_prompts[0])
        assert "T1059.001" in prompt_text

        assert result.get("body") == \
            "Synthetic insight: APT29 indicators corroborate T1059.001 across findings."

        insight = node_get_article(na, result["insight_article_id"])
        assert insight is not None
        assert insight.type == "insight"
        assert len(insight.cites) == 3

    finally:
        await _teardown(na, nb, broker, btask)


@pytest.mark.asyncio
async def test_mocked_full_flow_with_beta(mock_deps, tmp_path):
    """Complete demo: seed -> alpha -> beta -> provenance depth >= 2."""
    na, nb, broker, btask = await _setup_env(tmp_path)
    await _start_nodes(na, nb)

    try:
        from scenarios.soc_consortium.agent_alpha import run as alpha_run
        from scenarios.soc_consortium.agent_beta import run as beta_run
        from scenarios.soc_consortium.seed import seed_articles

        ids = seed_articles(na, nb)
        assert len(ids) == 10

        client_a = CortexClient(na)
        alpha_result = alpha_run(client_a, step="all")
        assert "insight_article_id" in alpha_result
        alpha_insight_id = alpha_result["insight_article_id"]

        client_beta = CortexClient(na)
        beta_result = beta_run(client_beta, na)
        assert "warning_article_id" in beta_result

        warning = node_get_article(na, beta_result["warning_article_id"])
        assert warning is not None
        assert warning.type == "warning"
        assert alpha_insight_id in warning.cites
        for fid in beta_result.get("new_findings", []):
            assert fid in warning.cites

        alpha_insight = node_get_article(na, alpha_insight_id)
        assert alpha_insight is not None
        assert len(alpha_insight.cites) > 0
        seed_cited = [c for c in alpha_insight.cites if c in ids]
        assert len(seed_cited) >= 1

    finally:
        await _teardown(na, nb, broker, btask)
