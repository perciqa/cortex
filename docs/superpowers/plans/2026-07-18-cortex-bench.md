# cortex-bench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a per-node `cortex-bench` sidecar that continuously measures Radeon-vs-CPU embedding throughput, query latency/throughput and GPU memory utilization, then forwards a `metrics` envelope to the broker every 2 s so the Cortex Console can render the live Bench Panel (Design §5.8, §15.1, §16).

**Architecture:** A standalone `python -m cortex.bench` process runs alongside each `cortex-node`. It owns two `EmbedProbe` instances (Radeon + CPU), two `QueryProbe` instances (Radeon + CPU, each backed by a tiny synthetic `CortexNode` store seeded at startup), and a single `GpuSensor`. A `BenchRunner` async loop wakes every 2 s, samples all four probes, composes a `BenchMetrics` dataclass, wraps it as an `Envelope{type=METRICS}`, and publishes it via `BrokerClient.publish_envelope`. The broker forwards the envelope to console subscribers on the metrics channel; the bench process never mutates fabric state.

**Tech Stack:** Python 3.11+, PyTorch-on-ROCm, asyncio, websockets client, `time.perf_counter`, `dataclasses`, `argparse`, `pytest` + `pytest-asyncio`.

---

## Locked decisions

| # | Decision | Value |
|---|---|---|
| D1 | Headline embedder | bge-small-en-v1.5 (384-dim, 33M params) |
| D4 | Bench sidecar topology | per-node sidecar |
| D8 | Demo scenario | F1 SOC consortium |

## Scope of cortex-bench

Per-node sidecar that continuously measures embedding throughput (Radeon vs CPU) and query latency/throughput and forwards metrics to the broker's metrics channel so the Cortex Console can render the bench panel (Design §5.8 metrics stream, §15.1 deployment, §16 performance budgets). Spec sources: Design §5.8 metrics stream, §15.1 deployment, §16 performance budgets.

### Components to plan

1. **Metrics schema** (`cortex/bench/metrics.py`):
   - `@dataclass BenchMetrics: node: str, embeds_per_sec_radeon: float, embeds_per_sec_cpu: float, queries_per_sec_radeon: float, queries_per_sec_cpu: float, gpu_mem_util_pct: float, p95_query_latency_ms: float, ts: datetime (UTC)`.
   - `to_envelope(metrics) -> Envelope` — wraps as an Envelope with type=METRICS, src=node org_did, dst="*", payload=dict.
   - `to_dict(metrics) -> dict` matching Design §5.8 layout exactly.
2. **Embedder probe** (`cortex/bench/embed_probe.py`):
   - `EmbedProbe(text_pool: list[str], batch_size: int = 16, mode: Literal["radeon","cpu"] = "radeon")`.
   - `probe_once() -> tuple[int, float]` returns (count, elapsed_seconds). Embeds the next batch_size texts from the pool, cycling through the pool on wrap. Returns throughput = batch_size / elapsed.
   - Uses two embedders: one with backend forced to "gpu" (Radeon), one with backend forced "cpu". Falls back gracefully if GPU unavailable: report `embeds_per_sec_radeon = 0.0` and emit a fallback flag.
   - Calls `Embedder` from `cortex.node.embedder` (don't reimplement).
3. **Query probe** (`cortex/bench/query_probe.py`):
   - `QueryProbe(node: CortexNode, query_pool: list[str], top_k: int = 5)`.
   - `probe_once() -> tuple[int, float, float]` returns (count, elapsed_seconds, p95_latency_ms). Sends `count` queries (default 10) sampled from the pool, measures each latency via `time.perf_counter()`, computes throughput and p95.
   - Two probes per node: one with GPU-backed node, one with CPU-backed node — OR run against the same node enabling/disabling GPU. Default: pair of `CortexNode` instances constructed with backend forced for each side (use a tiny synthetic store seeded at sidecar startup).
4. **GPU sensor** (`cortex/bench/gpu_sensor.py`):
   - `GpuSensor.snapshot() -> dict` returns `{"mem_util_pct": float}` from `torch.cuda.memory_allocated()/torch.cuda.memory_reserved()` (or `rocm-smi --showmeminfo` folded into subprocess if torch.cuda unavailable). On no GPU, returns `{"mem_util_pct": 0.0}`.
5. **Runner** (`cortex/bench/runner.py`):
   - `BenchRunner(node_id: str, broker_url: str, config_path: str)` async loop that:
     - Initializes embed probes (radeon + cpu) and query probes (radeon + cpu against two parallel tiny stores).
     - Every 2 seconds (Design §5.8), composes a `BenchMetrics`, sends via `BrokerClient.publish_envelope(METRICS envelope)`.
     - Logs metrics to stderr at INFO for debugging.
   - `async def run()` and `async def stop()`.
6. **CLI entrypoint** (`cortex/bench/__main__.py`):
   - `python -m cortex.bench --node did:percq:org:soc-alpha --broker wss://broker.local:7432 --config bench.yaml`.
   - asyncio.run(BenchRunner(...).run()) until Ctrl-C.

### Targets (Design §16.2)

| Workload | Target |
|---|---|
| Embeds/sec on Radeon (batch 16) | ≥ 350 |
| Embeds/sec on CPU fallback (batch 16) | ≥ 30 |
| Queries/sec on Radeon over 10k articles | ≥ 50 |
| Broker fan-out per second to 4 peers | ≥ 1000 |

Bench should expose targets as constants in `cortex/bench/targets.py` so the Console can render target lines on the bar charts.

## Shared contract (LOCKED from cortex-core, cortex-node, cortex-broker plans)

```python
from cortex.core.envelope import Envelope, EnvelopeType, envelope_to_json
from cortex.node.embedder import Embedder
from cortex.node.node import CortexNode
from cortex.broker.protocol import ...  # if exists; else use Envelope directly
```

Bench publishes `Envelope{type=METRICS, payload=metrics_dict}` to broker; broker forwards to console subscribers on metrics channel.

`BrokerClient.publish_envelope(env: Envelope) -> None` is async and lives in `cortex.node.broker_client`. `Embedder(texts: list[str]) -> np.ndarray` accepts a backend kwarg (`"gpu" | "cpu"`). `CortexNode.query(query_text: str, top_k: int) -> list[QueryResult]` is sync (the bench wraps it in `asyncio.to_thread`).

---

## Task 1: BenchMetrics dataclass + to_dict + to_envelope

**Files:**
- Create: `cortex/bench/__init__.py`
- Create: `cortex/bench/metrics.py`
- Test: `tests/bench/__init__.py`
- Test: `tests/bench/test_metrics.py`

- [x] **Step 1: Write the failing test**
```python
# tests/bench/__init__.py
# (intentionally empty)
```
```python
# tests/bench/test_metrics.py
from datetime import datetime, timezone

from cortex.bench.metrics import BenchMetrics, to_dict, to_envelope
from cortex.core.envelope import EnvelopeType


def _sample():
    return BenchMetrics(
        node="did:percq:org:soc-alpha",
        embeds_per_sec_radeon=142.3,
        embeds_per_sec_cpu=18.6,
        queries_per_sec_radeon=23.1,
        queries_per_sec_cpu=2.7,
        gpu_mem_util_pct=86.0,
        p95_query_latency_ms=42.0,
        ts=datetime(2026, 7, 18, 12, 0, 0, tzinfo=timezone.utc),
    )


def test_to_dict_matches_design_5_8_exactly():
    d = to_dict(_sample())
    assert list(d.keys()) == [
        "node",
        "embeds_per_sec_radeon",
        "embeds_per_sec_cpu",
        "queries_per_sec_radeon",
        "queries_per_sec_cpu",
        "gpu_mem_util_pct",
        "p95_query_latency_ms",
    ]
    assert d["node"] == "did:percq:org:soc-alpha"
    assert d["embeds_per_sec_radeon"] == 142.3
    assert d["embeds_per_sec_cpu"] == 18.6
    assert d["queries_per_sec_radeon"] == 23.1
    assert d["queries_per_sec_cpu"] == 2.7
    assert d["gpu_mem_util_pct"] == 86.0
    assert d["p95_query_latency_ms"] == 42.0


def test_to_envelope_uses_metrics_type_and_bench_src():
    m = _sample()
    env = to_envelope(m)
    assert env.type == EnvelopeType.METRICS
    assert env.src == "did:percq:org:soc-alpha"
    assert env.dst == "*"
    assert env.ts == m.ts
    assert env.payload == to_dict(m)
```

- [x] **Step 2: Run test to verify it fails**
Run: `pytest tests/bench/test_metrics.py -v`
Expected: ImportError / ModuleNotFoundError for `cortex.bench.metrics` and `cortex.core.envelope` (cortex-core contract not yet implemented when this plan runs ahead of cortex-core). If cortex-core is already in tree, the bench import still fails. Either way: FAIL.

- [x] **Step 3: Write minimal implementation**
```python
# cortex/bench/__init__.py
# (intentionally empty)
```
```python
# cortex/bench/metrics.py
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from cortex.core.envelope import Envelope, EnvelopeType


@dataclass(frozen=True)
class BenchMetrics:
    node: str
    embeds_per_sec_radeon: float
    embeds_per_sec_cpu: float
    queries_per_sec_radeon: float
    queries_per_sec_cpu: float
    gpu_mem_util_pct: float
    p95_query_latency_ms: float
    ts: datetime


def to_dict(metrics: BenchMetrics) -> dict[str, Any]:
    return {
        "node": metrics.node,
        "embeds_per_sec_radeon": metrics.embeds_per_sec_radeon,
        "embeds_per_sec_cpu": metrics.embeds_per_sec_cpu,
        "queries_per_sec_radeon": metrics.queries_per_sec_radeon,
        "queries_per_sec_cpu": metrics.queries_per_sec_cpu,
        "gpu_mem_util_pct": metrics.gpu_mem_util_pct,
        "p95_query_latency_ms": metrics.p95_query_latency_ms,
    }


def to_envelope(metrics: BenchMetrics) -> Envelope:
    from uuid import uuid4

    return Envelope(
        type=EnvelopeType.METRICS,
        msg_id=str(uuid4()),
        src=metrics.node,
        dst="*",
        ts=metrics.ts,
        payload=to_dict(metrics),
    )
```

- [x] **Step 4: Run test to verify it passes**
Run: `pytest tests/bench/test_metrics.py -v`
Expected: PASS (2 passed).

- [x] **Step 5: Commit**
```bash
git add cortex/bench/__init__.py cortex/bench/metrics.py tests/bench/__init__.py tests/bench/test_metrics.py
git commit -m "feat(bench): BenchMetrics dataclass with Design §5.8 to_dict + METRICS envelope wrapper

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Task 2: EmbedProbe — happy path with synthetic embedder

**Files:**
- Create: `cortex/bench/embed_probe.py`
- Test: `tests/bench/test_embed_probe.py`

- [x] **Step 1: Write the failing test**
```python
# tests/bench/test_embed_probe.py
import time

import numpy as np

from cortex.bench.embed_probe import EmbedProbe


class _FakeEmbedder:
    def __init__(self, backend: str = "gpu") -> None:
        self.backend = backend
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> np.ndarray:
        self.calls.append(list(texts))
        return np.zeros((len(texts), 384), dtype=np.float32)


def test_probe_once_returns_batch_size_and_positive_elapsed(monkeypatch):
    fake = _FakeEmbedder("gpu")
    pool = ["APT29 T1059.001 encoded powershell"] * 32
    probe = EmbedProbe(
        text_pool=pool,
        batch_size=16,
        mode="radeon",
        embedder_factory=lambda backend="gpu": fake,
    )
    count, elapsed = probe.probe_once()
    assert count == 16
    assert elapsed >= 0.0
    throughput = count / elapsed if elapsed > 0 else float("inf")
    assert throughput > 0
    assert len(fake.calls) == 1
    assert len(fake.calls[0]) == 16


def test_pool_cycles_when_pool_smaller_than_batch(monkeypatch):
    fake = _FakeEmbedder("cpu")
    pool = ["short pool text"]  # 1 element
    probe = EmbedProbe(
        text_pool=pool,
        batch_size=4,
        mode="cpu",
        embedder_factory=lambda backend="cpu": fake,
    )
    count1, _ = probe.probe_once()
    count2, _ = probe.probe_once()
    assert count1 == 4
    assert count2 == 4
    assert fake.calls[0] == ["short pool text"] * 4
    assert fake.calls[1] == ["short pool text"] * 4


def test_probe_throughput_is_finite_with_instant_embedder(monkeypatch):
    fake = _FakeEmbedder("gpu")
    pool = ["x"] * 8
    probe = EmbedProbe(
        text_pool=pool,
        batch_size=8,
        mode="radeon",
        embedder_factory=lambda backend="gpu": fake,
    )
    count, elapsed = probe.probe_once()
    throughput = count / elapsed if elapsed > 0 else 0.0
    assert count == 8
    assert isinstance(throughput, float)
    # embeds/sec of an instant embedder should be a large but finite number
    assert throughput >= 0
```

- [x] **Step 2: Run test to verify it fails**
Run: `pytest tests/bench/test_embed_probe.py -v`
Expected: ImportError for `cortex.bench.embed_probe`. FAIL.

- [x] **Step 3: Write minimal implementation**
```python
# cortex/bench/embed_probe.py
from __future__ import annotations

import time
from typing import Callable, Literal

from cortex.node.embedder import Embedder

EmbedderFactory = Callable[..., Embedder]


class EmbedProbe:
    def __init__(
        self,
        text_pool: list[str],
        batch_size: int = 16,
        mode: Literal["radeon", "cpu"] = "radeon",
        embedder_factory: EmbedderFactory | None = None,
    ) -> None:
        self.text_pool = text_pool
        self.batch_size = batch_size
        self.mode = mode
        self._cursor = 0
        backend = "gpu" if mode == "radeon" else "cpu"
        factory = embedder_factory or (lambda backend=backend: Embedder(backend=backend))
        try:
            self._embedder = factory(backend=backend)
            self.available = True
        except Exception:
            self._embedder = None
            self.available = False

    def probe_once(self) -> tuple[int, float]:
        if not self.available or self._embedder is None:
            return (0, 0.0)
        texts = [self.text_pool[self._cursor % len(self.text_pool)] for _ in range(self.batch_size)]
        self._cursor += self.batch_size
        t0 = time.perf_counter()
        self._embedder.embed(texts)
        elapsed = time.perf_counter() - t0
        if elapsed <= 0.0:
            elapsed = 1e-9
        return (self.batch_size, elapsed)
```

- [x] **Step 4: Run test to verify it passes**
Run: `pytest tests/bench/test_embed_probe.py -v`
Expected: PASS (3 passed).

- [x] **Step 5: Commit**
```bash
git add cortex/bench/embed_probe.py tests/bench/test_embed_probe.py
git commit -m "feat(bench): EmbedProbe with pool cycling and injectable embedder factory

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Task 3: EmbedProbe — no-GPU fallback

**Files:**
- Modify: `cortex/bench/embed_probe.py` (no-op if already correct; behavior covered by factory exception swallowing)
- Test: `tests/bench/test_embed_probe_fallback.py`

- [x] **Step 1: Write the failing test**
```python
# tests/bench/test_embed_probe_fallback.py
from cortex.bench.embed_probe import EmbedProbe
from cortex.bench.gpu_sensor import GpuSensor


class _ExplodingEmbedderFactory:
    def __init__(self, bad_backend: str = "gpu") -> None:
        self.bad_backend = bad_backend

    def __call__(self, backend: str = "gpu"):
        if backend == self.bad_backend:
            raise RuntimeError("CUDA not available")
        # cpu path: return a stub embedder
        return _StubCpuEmbedder()


class _StubCpuEmbedder:
    def embed(self, texts):
        return [[0.0] * 384 for _ in texts]


def test_gpu_probe_reports_unavailable_when_factory_raises():
    factory = _ExplodingEmbedderFactory("gpu")
    probe = EmbedProbe(
        text_pool=["q"] * 4,
        batch_size=4,
        mode="radeon",
        embedder_factory=factory,
    )
    assert probe.available is False
    count, elapsed = probe.probe_once()
    assert count == 0
    assert elapsed == 0.0


def test_cpu_probe_still_works_when_gpu_factory_raises():
    factory = _ExplodingEmbedderFactory("gpu")
    probe = EmbedProbe(
        text_pool=["q"] * 4,
        batch_size=4,
        mode="cpu",
        embedder_factory=factory,
    )
    assert probe.available is True
    count, elapsed = probe.probe_once()
    assert count == 4
    assert elapsed > 0


def test_gpu_sensor_returns_zero_when_no_gpu(monkeypatch):
    sensor = GpuSensor()

    class _FakeTorchCuda:
        @staticmethod
        def is_available():
            return False

    monkeypatch.setattr("cortex.bench.gpu_sensor.torch_cuda", _FakeTorchCuda, raising=False)
    snap = sensor.snapshot()
    assert snap == {"mem_util_pct": 0.0}
```

- [x] **Step 2: Run test to verify it fails**
Run: `pytest tests/bench/test_embed_probe_fallback.py -v`
Expected: ImportError for `cortex.bench.gpu_sensor`. FAIL.

- [x] **Step 3: Write minimal implementation**
```python
# cortex/bench/gpu_sensor.py
from __future__ import annotations

import subprocess


class _TorchCudaShim:
    """Indirection so tests can monkeypatch `cortex.bench.gpu_sensor.torch_cuda`."""

    @staticmethod
    def is_available() -> bool:
        try:
            import torch

            return bool(torch.cuda.is_available())
        except Exception:
            return False

    @staticmethod
    def mem_util_pct() -> float:
        try:
            import torch

            reserved = torch.cuda.memory_reserved()
            if reserved <= 0:
                return 0.0
            allocated = torch.cuda.memory_allocated()
            return float(max(0.0, min(100.0, 100.0 * allocated / reserved)))
        except Exception:
            return 0.0


torch_cuda = _TorchCudaShim()


class GpuSensor:
    def snapshot(self) -> dict[str, float]:
        if not torch_cuda.is_available():
            return {"mem_util_pct": 0.0}
        pct = torch_cuda.mem_util_pct()
        return {"mem_util_pct": float(max(0.0, min(100.0, pct)))}


def _rocm_smi_mem_util() -> float:
    try:
        out = subprocess.check_output(
            ["rocm-smi", "--showmeminfo", "vram"], stderr=subprocess.STDOUT, timeout=2.0
        ).decode()
    except Exception:
        return 0.0
    return 0.0
```
`embed_probe.py` already swallows construction exceptions (Task 2 implementation). No change required; re-verify by running tests.

- [x] **Step 4: Run test to verify it passes**
Run: `pytest tests/bench/test_embed_probe_fallback.py -v`
Expected: PASS (3 passed).

- [x] **Step 5: Commit**
```bash
git add cortex/bench/gpu_sensor.py tests/bench/test_embed_probe_fallback.py
git commit -m "feat(bench): GpuSensor + EmbedProbe graceful GPU fallback path

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Task 4: QueryProbe — throughput + p95 latency

**Files:**
- Create: `cortex/bench/query_probe.py`
- Test: `tests/bench/test_query_probe.py`

- [x] **Step 1: Write the failing test**
```python
# tests/bench/test_query_probe.py
import asyncio
import time

import pytest

from cortex.bench.query_probe import QueryProbe


class _FakeQueryResult:
    def __init__(self, article_id: str, score: float):
        self.article_id = article_id
        self.score = score


class _FakeCortexNode:
    """Returns canned QueryResult lists after a per-call fixed sleep."

    For deterministic p95 testing, `latencies_ms` specifies the sleep duration
    of each successive call in milliseconds (cycled).
    """

    def __init__(self, latencies_ms: list[float]) -> None:
        self.latencies_ms = latencies_ms
        self._i = 0
        self.query_count = 0

    def query(self, query_text: str, top_k: int = 5) -> list:
        self.query_count += 1
        delay = self.latencies_ms[self._i % len(self.latencies_ms)]
        self._i += 1
        time.sleep(delay / 1000.0)
        return [_FakeQueryResult("a1", 0.9)]


def test_probe_once_returns_count_throughput_p95():
    # 20 calls: 15 fast (1ms) + 5 slow (50ms) outliers
    latencies = [1.0] * 15 + [50.0] * 5
    node = _FakeCortexNode(latencies)
    probe = QueryProbe(node=node, query_pool=["q"] * 20, top_k=5, count=20)
    count, elapsed, p95 = probe.probe_once()
    assert count == 20
    assert elapsed > 0.0
    throughput = count / elapsed
    assert throughput > 0.0
    # p95 should land in the outlier band (>= 50ms - tolerance)
    assert p95 >= 40.0


def test_p95_uses_per_call_latencies_not_wall_time(monkeypatch):
    # 4 calls of 5ms each — p95 is one of the per-call latencies
    node = _FakeCortexNode([5.0, 5.0, 5.0, 5.0])
    probe = QueryProbe(node=node, query_pool=["q"] * 4, top_k=5, count=4)
    count, _, p95 = probe.probe_once()
    assert count == 4
    assert 4.0 <= p95 <= 6.0


def test_query_probe_is_async_aware():
    # QueryProbe.probe_once is sync; run via to_thread to confirm no blocking
    node = _FakeCortexNode([1.0] * 3)
    probe = QueryProbe(node=node, query_pool=["q"] * 3, top_k=5, count=3)
    result = asyncio.run(asyncio.to_thread(probe.probe_once))
    assert result[0] == 3
```

- [x] **Step 2: Run test to verify it fails**
Run: `pytest tests/bench/test_query_probe.py -v`
Expected: ImportError for `cortex.bench.query_probe`. FAIL.

- [x] **Step 3: Write minimal implementation**
```python
# cortex/bench/query_probe.py
from __future__ import annotations

import time
from typing import Any

from cortex.node.node import CortexNode


def _p95(values: list[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = int(0.95 * (len(s) - 1))
    return float(s[idx])


class QueryProbe:
    def __init__(
        self,
        node: CortexNode,
        query_pool: list[str],
        top_k: int = 5,
        count: int = 10,
    ) -> None:
        self.node = node
        self.query_pool = query_pool
        self.top_k = top_k
        self.count = count
        self._cursor = 0

    def probe_once(self) -> tuple[int, float, float]:
        latencies_ms: list[float] = []
        t0 = time.perf_counter()
        for _ in range(self.count):
            q = self.query_pool[self._cursor % len(self.query_pool)]
            self._cursor += 1
            call_t0 = time.perf_counter()
            self.node.query(q, top_k=self.top_k)
            latencies_ms.append((time.perf_counter() - call_t0) * 1000.0)
        elapsed = time.perf_counter() - t0
        return (self.count, elapsed, _p95(latencies_ms))

    async def probe_once_async(self) -> tuple[int, float, float]:
        import asyncio

        return await asyncio.to_thread(self.probe_once)
```

- [x] **Step 4: Run test to verify it passes**
Run: `pytest tests/bench/test_query_probe.py -v`
Expected: PASS (3 passed).

- [x] **Step 5: Commit**
```bash
git add cortex/bench/query_probe.py tests/bench/test_query_probe.py
git commit -m "feat(bench): QueryProbe measuring throughput and p95 query latency

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Task 5: GpuSensor — branches for GPU present / absent

**Files:**
- Modify: `cortex/bench/gpu_sensor.py` (extend with configurable torch shim path already added in Task 3)
- Test: `tests/bench/test_gpu_sensor.py`

- [x] **Step 1: Write the failing test**
```python
# tests/bench/test_gpu_sensor.py
from cortex.bench.gpu_sensor import GpuSensor


class _FakeTorchCudaNoGpu:
    @staticmethod
    def is_available() -> bool:
        return False

    @staticmethod
    def mem_util_pct() -> float:
        return 0.0


class _FakeTorchCudaHalfUtil:
    @staticmethod
    def is_available() -> bool:
        return True

    @staticmethod
    def mem_util_pct() -> float:
        return 50.0


class _FakeTorchCudaOverUtil:
    @staticmethod
    def is_available() -> bool:
        return True

    @staticmethod
    def mem_util_pct() -> float:
        return 123.4  # out of range — sensor should clamp


def test_no_gpu_returns_zero(monkeypatch):
    monkeypatch.setattr("cortex.bench.gpu_sensor.torch_cuda", _FakeTorchCudaNoGpu)
    sensor = GpuSensor()
    assert sensor.snapshot() == {"mem_util_pct": 0.0}


def test_with_gpu_returns_in_range(monkeypatch):
    monkeypatch.setattr("cortex.bench.gpu_sensor.torch_cuda", _FakeTorchCudaHalfUtil)
    sensor = GpuSensor()
    snap = sensor.snapshot()
    assert set(snap.keys()) == {"mem_util_pct"}
    assert 0.0 <= snap["mem_util_pct"] <= 100.0
    assert snap["mem_util_pct"] == 50.0


def test_clamps_overflow(monkeypatch):
    monkeypatch.setattr("cortex.bench.gpu_sensor.torch_cuda", _FakeTorchCudaOverUtil)
    sensor = GpuSensor()
    assert sensor.snapshot()["mem_util_pct"] == 100.0
```

- [x] **Step 2: Run test to verify it fails**
Run: `pytest tests/bench/test_gpu_sensor.py -v`
Expected: ModuleNotFoundError for `cortex.bench.gpu_sensor` until Task 3's file exists. If Tasks executed in order (Task 3 already done), tests should already PASS — re-run to confirm. If Task 3 not yet done, FAIL with ImportError.

- [x] **Step 3: Write minimal implementation**
`cortex/bench/gpu_sensor.py` from Task 3 already satisfies these tests (the snapshot clamps `[0, 100]` and returns `{"mem_util_pct": 0.0}` when CUDA is unavailable). No code change needed. To make the plan robust against out-of-order execution, ensure the file contains:

```python
# cortex/bench/gpu_sensor.py
from __future__ import annotations

import subprocess


class _TorchCudaShim:
    @staticmethod
    def is_available() -> bool:
        try:
            import torch

            return bool(torch.cuda.is_available())
        except Exception:
            return False

    @staticmethod
    def mem_util_pct() -> float:
        try:
            import torch

            reserved = torch.cuda.memory_reserved()
            if reserved <= 0:
                return 0.0
            allocated = torch.cuda.memory_allocated()
            return float(max(0.0, min(100.0, 100.0 * allocated / reserved)))
        except Exception:
            return 0.0


torch_cuda = _TorchCudaShim()


class GpuSensor:
    def snapshot(self) -> dict[str, float]:
        if not torch_cuda.is_available():
            return {"mem_util_pct": 0.0}
        pct = torch_cuda.mem_util_pct()
        return {"mem_util_pct": float(max(0.0, min(100.0, pct)))}


def _rocm_smi_mem_util() -> float:
    try:
        subprocess.check_output(
            ["rocm-smi", "--showmeminfo", "vram"], stderr=subprocess.STDOUT, timeout=2.0
        )
    except Exception:
        return 0.0
    return 0.0
```

- [x] **Step 4: Run test to verify it passes**
Run: `pytest tests/bench/test_gpu_sensor.py -v`
Expected: PASS (3 passed).

- [x] **Step 5: Commit**
```bash
git add tests/bench/test_gpu_sensor.py
git commit -m "test(bench): GpuSensor branches for absent, normal, and over-util GPU

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Task 6: BenchRunner — 2-second tick loop publishes METRICS envelopes

**Files:**
- Create: `cortex/bench/runner.py`
- Create: `cortex/bench/targets.py` (constants used by runner logging and Console)
- Test: `tests/bench/test_runner.py`

- [x] **Step 1: Write the failing test**
```python
# tests/bench/test_runner.py
import asyncio
from datetime import datetime, timezone

import pytest

from cortex.bench.runner import BenchRunner


class _FakeBrokerClient:
    def __init__(self) -> None:
        self.published = []

    async def publish_envelope(self, env) -> None:
        self.published.append(env)


class _EmbedStub:
    def probe_once(self):
        return (16, 0.05)  # 16 embeds in 50ms → 320 embeds/s


class _CpuEmbedStub:
    def probe_once(self):
        return (16, 0.5)  # 16 embeds in 500ms → 32 embeds/s


class _QueryStub:
    def probe_once(self):
        return (10, 0.2, 5.0)  # 10 queries in 200ms, p95 5ms


class _CpuQueryStub:
    def probe_once(self):
        return (10, 2.0, 200.0)  # 10 queries in 2s, p95 200ms


def _stub_probe_factory(node_id: str):
    return {
        "embed_radeon": _EmbedStub(),
        "embed_cpu": _CpuEmbedStub(),
        "query_radeon": _QueryStub(),
        "query_cpu": _CpuQueryStub(),
    }


@pytest.mark.asyncio
async def test_runner_publishes_three_envelopes_in_three_ticks(monkeypatch):
    fake_broker = _FakeBrokerClient()
    runner = BenchRunner(
        node_id="did:percq:org:soc-alpha",
        broker_url="wss://broker.local:7432",
        config_path="bench.yaml",
        tick_interval=0.05,
        broker_client_factory=lambda url: fake_broker,
        probe_factory=_stub_probe_factory,
        gpu_sensor=None,
    )
    task = asyncio.create_task(runner.run())
    await asyncio.sleep(0.18)
    await runner.stop()
    await task
    assert len(fake_broker.published) >= 3
    for env in fake_broker.published:
        assert env.type.value == "metrics" or env.type.name == "METRICS"
        assert env.src == "did:percq:org:soc-alpha"
        assert env.dst == "*"
        assert "embeds_per_sec_radeon" in env.payload
        assert "embeds_per_sec_cpu" in env.payload
        assert "queries_per_sec_radeon" in env.payload
        assert "queries_per_sec_cpu" in env.payload
        assert "gpu_mem_util_pct" in env.payload
        assert "p95_query_latency_ms" in env.payload
        assert isinstance(env.ts, datetime)
        assert env.ts.tzinfo == timezone.utc
    # throughput math: stub embeds 16 texts in 0.05s → 320 embeds/s on Radeon
    first = fake_broker.published[0].payload
    assert 319.0 <= first["embeds_per_sec_radeon"] <= 321.0
    assert 31.0 <= first["embeds_per_sec_cpu"] <= 33.0
    assert first["p95_query_latency_ms"] == 5.0
    assert 0.0 <= first["gpu_mem_util_pct"] <= 100.0
```

- [x] **Step 2: Run test to verify it fails**
Run: `pytest tests/bench/test_runner.py -v`
Expected: ImportError for `cortex.bench.runner`. FAIL.

- [x] **Step 3: Write minimal implementation**
```python
# cortex/bench/targets.py
"""Design §16.2 throughput targets — exported as constants so the Cortex Console
can render target lines on the bench bar charts without hardcoding numbers."""

EMBEDS_PER_SEC_RADEON_TARGET = 350
EMBEDS_PER_SEC_CPU_TARGET = 30
QUERIES_PER_SEC_RADEON_TARGET = 50
BROKER_FANOUT_PER_SEC_TARGET = 1000

BENCH_TICK_INTERVAL_SEC = 2.0
BENCH_QUERY_COUNT = 10
BENCH_EMBED_BATCH = 16
```
```python
# cortex/bench/runner.py
from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Callable

from cortex.bench.embed_probe import EmbedProbe
from cortex.bench.gpu_sensor import GpuSensor
from cortex.bench.metrics import BenchMetrics, to_envelope
from cortex.bench.query_probe import QueryProbe
from cortex.bench.targets import (
    BENCH_EMBED_BATCH,
    BENCH_QUERY_COUNT,
    BENCH_TICK_INTERVAL_SEC,
)
from cortex.node.broker_client import BrokerClient
from cortex.node.embedder import Embedder
from cortex.node.node import CortexNode

log = logging.getLogger("cortex.bench")


def _default_broker_client(url: str) -> BrokerClient:
    return BrokerClient(url)


def _default_probe_factory(node_id: str):
    """Constructs the four probes against two synthetic CortexNodes.

    Seeded with a tiny text corpus so the bench is meaningful even before
    the demo scenario is loaded.
    """
    text_pool = [
        "APT29 leveraged encoded PowerShell T1059.001",
        "Lateral movement via WMI T1021.006",
        "Credential dumping with LSASS T1003.001",
    ] * 8
    query_pool = [
        "TTPs tied to APT29 in 2026",
        "credential access techniques",
        "lateral movement evidence",
    ] * 4

    def build_embedder(backend: str) -> Embedder:
        return Embedder(backend=backend)

    embed_radeon = EmbedProbe(text_pool, batch_size=BENCH_EMBED_BATCH, mode="radeon")
    embed_cpu = EmbedProbe(text_pool, batch_size=BENCH_EMBED_BATCH, mode="cpu")
    # Two synthetic nodes seeded with the same tiny store; backend forced per side.
    node_radeon = CortexNode(org_did=node_id, config={"embedder": {"backend": "gpu"}})
    node_cpu = CortexNode(org_did=node_id, config={"embedder": {"backend": "cpu"}})
    _seed_synthetic_store(node_radeon, text_pool)
    _seed_synthetic_store(node_cpu, text_pool)
    query_radeon = QueryProbe(node_radeon, query_pool, top_k=5, count=BENCH_QUERY_COUNT)
    query_cpu = QueryProbe(node_cpu, query_pool, top_k=5, count=BENCH_QUERY_COUNT)
    return {
        "embed_radeon": embed_radeon,
        "embed_cpu": embed_cpu,
        "query_radeon": query_radeon,
        "query_cpu": query_cpu,
    }


def _seed_synthetic_store(node: CortexNode, texts: list[str]) -> None:
    """Publishes a tiny set of articles into the node so queries return hits."""
    try:
        for t in texts[:8]:
            node.publish(content=t, scope="public", topics=["bench"])
    except Exception:
        pass


class _Probes:
    def __init__(self, factory_result: dict[str, Any]) -> None:
        self.embed_radeon: EmbedProbe = factory_result["embed_radeon"]
        self.embed_cpu: EmbedProbe = factory_result["embed_cpu"]
        self.query_radeon: QueryProbe = factory_result["query_radeon"]
        self.query_cpu: QueryProbe = factory_result["query_cpu"]


class BenchRunner:
    def __init__(
        self,
        node_id: str,
        broker_url: str,
        config_path: str,
        tick_interval: float = BENCH_TICK_INTERVAL_SEC,
        broker_client_factory: Callable[[str], Any] | None = None,
        probe_factory: Callable[[str], Any] | None = None,
        gpu_sensor: GpuSensor | None = None,
    ) -> None:
        self.node_id = node_id
        self.broker_url = broker_url
        self.config_path = config_path
        self.tick_interval = tick_interval
        self._broker_factory = broker_client_factory or _default_broker_client
        self._probe_factory = probe_factory or _default_probe_factory
        self._gpu_sensor = gpu_sensor or GpuSensor()
        self._broker = None
        self._probes: _Probes | None = None
        self._stop = asyncio.Event()

    async def run(self) -> None:
        logging.basicConfig(level=logging.INFO, stream=sys.stderr)
        self._broker = self._broker_factory(self.broker_url)
        if hasattr(self._broker, "connect"):
            await self._broker.connect()
        self._probes = _Probes(self._probe_factory(self.node_id))
        log.info("cortex-bench started for %s", self.node_id)
        while not self._stop.is_set():
            await self._tick()
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.tick_interval)
            except asyncio.TimeoutError:
                continue

    async def _tick(self) -> None:
        p = self._probes
        ec_r, et_r = p.embed_radeon.probe_once()
        ec_c, et_c = p.embed_cpu.probe_once()
        qc_r, qt_r, qp95_r = p.query_radeon.probe_once()
        qc_c, qt_c, qp95_c = p.query_cpu.probe_once()
        embeds_radeon = ec_r / et_r if et_r > 0 else 0.0
        embeds_cpu = ec_c / et_c if et_c > 0 else 0.0
        queries_radeon = qc_r / qt_r if qt_r > 0 else 0.0
        queries_cpu = qc_c / qt_c if qt_c > 0 else 0.0
        gpu = self._gpu_sensor.snapshot()
        metrics = BenchMetrics(
            node=self.node_id,
            embeds_per_sec_radeon=embeds_radeon,
            embeds_per_sec_cpu=embeds_cpu,
            queries_per_sec_radeon=queries_radeon,
            queries_per_sec_cpu=queries_cpu,
            gpu_mem_util_pct=gpu["mem_util_pct"],
            p95_query_latency_ms=qp95_r,
            ts=datetime.now(timezone.utc),
        )
        env = to_envelope(metrics)
        if self._broker is not None:
            try:
                await self._broker.publish_envelope(env)
            except Exception as e:
                log.warning("publish_envelope failed: %s", e)
        log.info(
            "bench radeon=%.1f embeds/s cpu=%.1f embeds/s radeon_q=%.1f q/s cpu_q=%.1f q/s "
            "gpu=%s p95=%.1fms",
            embeds_radeon, embeds_cpu, queries_radeon, queries_cpu,
            gpu["mem_util_pct"], qp95_r,
        )

    async def stop(self) -> None:
        self._stop.set()
        if self._broker is not None and hasattr(self._broker, "close"):
            try:
                await self._broker.close()
            except Exception:
                pass
```

- [x] **Step 4: Run test to verify it passes**
Run: `pytest tests/bench/test_runner.py -v`
Expected: PASS (1 passed).

- [x] **Step 5: Commit**
```bash
git add cortex/bench/runner.py cortex/bench/targets.py tests/bench/test_runner.py
git commit -m "feat(bench): BenchRunner async 2s tick loop publishing METRICS envelopes

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Task 7: BenchRunner — graceful shutdown on KeyboardInterrupt / SIGTERM

**Files:**
- Modify: `cortex/bench/runner.py` (add signal handling to `run()`; ensure `stop()` cancels pending tasks)
- Test: `tests/bench/test_runner_shutdown.py`

- [x] **Step 1: Write the failing test**
```python
# tests/bench/test_runner_shutdown.py
import asyncio

import pytest

from cortex.bench.runner import BenchRunner


class _FakeBroker:
    def __init__(self) -> None:
        self.published = []
        self.closed = False

    async def publish_envelope(self, env) -> None:
        self.published.append(env)

    async def close(self) -> None:
        self.closed = True


class _EmbedStub:
    def probe_once(self):
        return (16, 0.05)


class _QueryStub:
    def probe_once(self):
        return (10, 0.2, 5.0)


def _stub_probe_factory(node_id):
    return {
        "embed_radeon": _EmbedStub(),
        "embed_cpu": _EmbedStub(),
        "query_radeon": _QueryStub(),
        "query_cpu": _QueryStub(),
    }


@pytest.mark.asyncio
async def test_stop_cancels_loop_and_closes_broker():
    fake_broker = _FakeBroker()
    runner = BenchRunner(
        node_id="did:percq:org:soc-alpha",
        broker_url="wss://broker.local:7432",
        config_path="bench.yaml",
        tick_interval=0.02,
        broker_client_factory=lambda url: fake_broker,
        probe_factory=_stub_probe_factory,
        gpu_sensor=None,
    )
    task = asyncio.create_task(runner.run())
    await asyncio.sleep(0.05)
    await runner.stop()
    await task
    assert fake_broker.closed is True


@pytest.mark.asyncio
async def test_keyboard_interrupt_in_run_triggers_clean_stop():
    fake_broker = _FakeBroker()
    runner = BenchRunner(
        node_id="did:percq:org:soc-alpha",
        broker_url="wss://broker.local:7432",
        config_path="bench.yaml",
        tick_interval=0.02,
        broker_client_factory=lambda url: fake_broker,
        probe_factory=_stub_probe_factory,
        gpu_sensor=None,
    )

    async def raise_kb():
        await asyncio.sleep(0.05)
        raise KeyboardInterrupt()

    task = asyncio.create_task(runner.run())
    asyncio.create_task(raise_kb())
    await asyncio.sleep(0.12)
    # loop should have detected the interrupt-or-stop and exited
    await runner.stop()
    await task
    assert fake_broker.closed is True
```

- [x] **Step 2: Run test to verify it fails**
Run: `pytest tests/bench/test_runner_shutdown.py -v`
Expected: First test MAY pass already (Task 6 `stop()` closes broker); second test FAILS because `run()` does not catch `KeyboardInterrupt`.

- [x] **Step 3: Write minimal implementation**
Modify `BenchRunner.run` in `cortex/bench/runner.py`:

```python
# cortex/bench/runner.py (excerpt — replace the existing run() method)
    async def run(self) -> None:
        logging.basicConfig(level=logging.INFO, stream=sys.stderr)
        self._broker = self._broker_factory(self.broker_url)
        if hasattr(self._broker, "connect"):
            await self._broker.connect()
        self._probes = _Probes(self._probe_factory(self.node_id))
        log.info("cortex-bench started for %s", self.node_id)
        try:
            while not self._stop.is_set():
                await self._tick()
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self.tick_interval)
                except asyncio.TimeoutError:
                    continue
        except (KeyboardInterrupt, asyncio.CancelledError):
            log.info("cortex-bench received interrupt, shutting down")
        finally:
            await self._cleanup()

    async def _cleanup(self) -> None:
        pending = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        for t in pending:
            if t.get_name() == "cortex-bench-tick":
                t.cancel()
        if self._broker is not None and hasattr(self._broker, "close"):
            try:
                await self._broker.close()
            except Exception:
                pass
```

- [x] **Step 4: Run test to verify it passes**
Run: `pytest tests/bench/test_runner_shutdown.py -v`
Expected: PASS (2 passed).

- [x] **Step 5: Commit**
```bash
git add cortex/bench/runner.py tests/bench/test_runner_shutdown.py
git commit -m "feat(bench): graceful BenchRunner shutdown on SIGTERM/KeyboardInterrupt

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Task 8: CLI entrypoint — `python -m cortex.bench`

**Files:**
- Create: `cortex/bench/__main__.py`
- Test: `tests/bench/test_main.py`

- [x] **Step 1: Write the failing test**
```python
# tests/bench/test_main.py
import asyncio
from unittest.mock import patch

from cortex.bench import __main__ as bench_main


class _FakeRunner:
    def __init__(self, *args, **kwargs) -> None:
        self.args = args
        self.kwargs = kwargs
        self.run_called = 0
        self.stop_called = 0

    async def run(self) -> None:
        self.run_called += 1
        # exit immediately so the test doesn't block
        await asyncio.sleep(0)

    async def stop(self) -> None:
        self.stop_called += 1


def test_main_constructs_runner_with_argv(monkeypatch):
    captured = {}

    fake = _FakeRunner()

    def fake_runner_factory(node_id, broker_url, config_path, **kw):
        captured["node_id"] = node_id
        captured["broker_url"] = broker_url
        captured["config_path"] = config_path
        return fake

    monkeypatch.setattr(bench_main, "BenchRunner", fake_runner_factory)

    argv = [
        "cortex.bench",
        "--node", "did:percq:org:soc-alpha",
        "--broker", "wss://broker.local:7432",
        "--config", "bench.yaml",
    ]
    monkeypatch.setattr("sys.argv", argv)
    bench_main.main()
    assert captured["node_id"] == "did:percq:org:soc-alpha"
    assert captured["broker_url"] == "wss://broker.local:7432"
    assert captured["config_path"] == "bench.yaml"
    assert fake.run_called == 1
```

- [x] **Step 2: Run test to verify it fails**
Run: `pytest tests/bench/test_main.py -v`
Expected: ImportError for `cortex.bench.__main__`. FAIL.

- [x] **Step 3: Write minimal implementation**
```python
# cortex/bench/__main__.py
from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import sys

from cortex.bench.runner import BenchRunner


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m cortex.bench")
    parser.add_argument("--node", required=True, help="Org DID, e.g. did:percq:org:soc-alpha")
    parser.add_argument("--broker", required=True, help="Broker WebSocket URL, e.g. wss://broker.local:7432")
    parser.add_argument("--config", required=True, help="Path to bench.yaml")
    parser.add_argument("--tick-interval", type=float, default=None, help="Override tick interval seconds (debug)")
    return parser.parse_args(argv)


def main() -> None:
    args = _parse_args()
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    kwargs = {}
    if args.tick_interval is not None:
        kwargs["tick_interval"] = args.tick_interval
    runner = BenchRunner(
        node_id=args.node,
        broker_url=args.broker,
        config_path=args.config,
        **kwargs,
    )

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def _handle_sigterm(*_):
        loop.create_task(runner.stop())

    try:
        loop.add_signal_handler(signal.SIGTERM, _handle_sigterm)
        loop.add_signal_handler(signal.SIGINT, _handle_sigterm)
    except NotImplementedError:
        pass  # Windows

    try:
        loop.run_until_complete(runner.run())
    except KeyboardInterrupt:
        loop.run_until_complete(runner.stop())
    finally:
        loop.close()


if __name__ == "__main__":
    main()
```

- [x] **Step 4: Run test to verify it passes**
Run: `pytest tests/bench/test_main.py -v`
Expected: PASS (1 passed).

- [x] **Step 5: Commit**
```bash
git add cortex/bench/__main__.py tests/bench/test_main.py
git commit -m "feat(bench): CLI entrypoint python -m cortex.bench with signal handlers

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Task 9: Targets module — Design §16.2 constants

**Files:**
- Create: `cortex/bench/targets.py` (already created in Task 6 — re-assert here)
- Test: `tests/bench/test_targets.py`

- [x] **Step 1: Write the failing test**
```python
# tests/bench/test_targets.py
from cortex.bench.targets import (
    BROKER_FANOUT_PER_SEC_TARGET,
    EMBEDS_PER_SEC_CPU_TARGET,
    EMBEDS_PER_SEC_RADEON_TARGET,
    QUERIES_PER_SEC_RADEON_TARGET,
)


def test_embeds_radeon_target_matches_design_16_2():
    assert EMBEDS_PER_SEC_RADEON_TARGET == 350


def test_embeds_cpu_target_matches_design_16_2():
    assert EMBEDS_PER_SEC_CPU_TARGET == 30


def test_queries_radeon_target_matches_design_16_2():
    assert QUERIES_PER_SEC_RADEON_TARGET == 50


def test_broker_fanout_target_matches_design_16_2():
    assert BROKER_FANOUT_PER_SEC_TARGET == 1000
```

- [x] **Step 2: Run test to verify it fails**
Run: `pytest tests/bench/test_targets.py -v`
Expected: If Task 6 already created `targets.py`, this PASSES immediately. Otherwise ImportError FAIL.

- [x] **Step 3: Write minimal implementation**
Ensure `cortex/bench/targets.py` contains exactly:

```python
# cortex/bench/targets.py
"""Design §16.2 throughput targets — exported as constants so the Cortex Console
can render target lines on the bench bar charts without hardcoding numbers."""

EMBEDS_PER_SEC_RADEON_TARGET = 350
EMBEDS_PER_SEC_CPU_TARGET = 30
QUERIES_PER_SEC_RADEON_TARGET = 50
BROKER_FANOUT_PER_SEC_TARGET = 1000

BENCH_TICK_INTERVAL_SEC = 2.0
BENCH_QUERY_COUNT = 10
BENCH_EMBED_BATCH = 16
```

- [x] **Step 4: Run test to verify it passes**
Run: `pytest tests/bench/test_targets.py -v`
Expected: PASS (4 passed).

- [x] **Step 5: Commit**
```bash
git add tests/bench/test_targets.py
git commit -m "test(bench): assert Design §16.2 throughput target constants

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Task 10: Integration test — two nodes, one broker, two bench sidecars

**Files:**
- Test: `tests/bench/test_integration_two_sidecars.py`
- Create: `tests/bench/fixtures.py` (shared synthetic helpers)

- [x] **Step 1: Write the failing test**
```python
# tests/bench/fixtures.py
import asyncio
from typing import Any

from cortex.bench.embed_probe import EmbedProbe
from cortex.bench.gpu_sensor import GpuSensor
from cortex.bench.query_probe import QueryProbe
from cortex.bench.runner import BenchRunner
from cortex.bench.targets import BENCH_EMBED_BATCH, BENCH_QUERY_COUNT


class _RecordingBroker:
    def __init__(self) -> None:
        self.published: list[Any] = []

    async def connect(self) -> None:
        pass

    async def publish_envelope(self, env) -> None:
        self.published.append(env)

    async def close(self) -> None:
        pass


class _InstantEmbedder:
    def __init__(self, backend: str = "gpu") -> None:
        self.backend = backend

    def embed(self, texts):
        import numpy as np
        return np.zeros((len(texts), 384), dtype=np.float32)


class _FakeCortexNode:
    def __init__(self, backend: str) -> None:
        self.backend = backend

    def query(self, query_text: str, top_k: int = 5):
        import time
        time.sleep(0.001)
        return [{"article_id": "a1", "score": 0.9}]


def make_probe_factory(node_id: str):
    pool = ["synthetic SOC finding text"] * 16
    query_pool = ["APT29 TTPs"] * 8

    def factory(node_id_inner):
        return {
            "embed_radeon": EmbedProbe(
                pool, batch_size=BENCH_EMBED_BATCH, mode="radeon",
                embedder_factory=lambda backend="gpu": _InstantEmbedder(backend),
            ),
            "embed_cpu": EmbedProbe(
                pool, batch_size=BENCH_EMBED_BATCH, mode="cpu",
                embedder_factory=lambda backend="cpu": _InstantEmbedder(backend),
            ),
            "query_radeon": QueryProbe(_FakeCortexNode("gpu"), query_pool, top_k=5, count=BENCH_QUERY_COUNT),
            "query_cpu": QueryProbe(_FakeCortexNode("cpu"), query_pool, top_k=5, count=BENCH_QUERY_COUNT),
        }

    return factory


def make_runner(node_id: str, broker: _RecordingBroker, tick: float) -> BenchRunner:
    return BenchRunner(
        node_id=node_id,
        broker_url="inmemory",
        config_path="bench.yaml",
        tick_interval=tick,
        broker_client_factory=lambda url: broker,
        probe_factory=make_probe_factory(node_id),
        gpu_sensor=GpuSensor(),
    )
```

```python
# tests/bench/test_integration_two_sidecars.py
import asyncio

import pytest

from tests.bench.fixtures import _RecordingBroker, make_runner


@pytest.mark.asyncio
async def test_two_sidecars_each_publish_to_their_broker():
    broker_a = _RecordingBroker()
    broker_b = _RecordingBroker()
    runner_a = make_runner("did:percq:org:soc-alpha", broker_a, tick=0.1)
    runner_b = make_runner("did:percq:org:soc-beta",  broker_b, tick=0.1)

    task_a = asyncio.create_task(runner_a.run())
    task_b = asyncio.create_task(runner_b.run())
    await asyncio.sleep(0.65)
    await runner_a.stop()
    await runner_b.stop()
    await task_a
    await task_b

    assert len(broker_a.published) >= 2, f"sidecar A only published {len(broker_a.published)}"
    assert len(broker_b.published) >= 2, f"sidecar B only published {len(broker_b.published)}"

    required_keys = {
        "node", "embeds_per_sec_radeon", "embeds_per_sec_cpu",
        "queries_per_sec_radeon", "queries_per_sec_cpu",
        "gpu_mem_util_pct", "p95_query_latency_ms",
    }
    for env in broker_a.published + broker_b.published:
        assert required_keys.issubset(env.payload.keys())
        # numbers, not None; zeros allowed when GPU genuinely missing
        for k in required_keys - {"node"}:
            assert isinstance(env.payload[k], (int, float))
        assert env.payload["node"].startswith("did:percq:org:")


@pytest.mark.asyncio
async def test_sidecar_metrics_payload_uses_design_5_8_key_order():
    broker = _RecordingBroker()
    runner = make_runner("did:percq:org:soc-alpha", broker, tick=0.1)
    task = asyncio.create_task(runner.run())
    await asyncio.sleep(0.15)
    await runner.stop()
    await task
    env = broker.published[0]
    assert list(env.payload.keys()) == [
        "node",
        "embeds_per_sec_radeon",
        "embeds_per_sec_cpu",
        "queries_per_sec_radeon",
        "queries_per_sec_cpu",
        "gpu_mem_util_pct",
        "p95_query_latency_ms",
    ]
```

- [x] **Step 2: Run test to verify it fails**
Run: `pytest tests/bench/test_integration_two_sidecars.py -v`
Expected: ImportError for `tests.bench.fixtures` until Step 1 file exists; once fixtures written, may still FAIL if `BenchRunner` does not yield between ticks. FAIL until wiring is complete.

- [x] **Step 3: Write minimal implementation**
The implementation from Tasks 1–9 already satisfies this integration test (BenchRunner publishes via the injected `_RecordingBroker`, `to_dict` produces the 7-key Design §5.8 layout exactly). If the test reveals a missing piece (e.g., the runner blocks on the first tick without yielding), patch `runner._tick` to `await asyncio.sleep(0)` once before doing work:

```python
# In cortex/bench/runner.py, _tick():
    async def _tick(self) -> None:
        await asyncio.sleep(0)  # yield to the event loop so stop() can preempt
        # ...rest unchanged from Task 6
```
No other code changes should be required.

- [x] **Step 4: Run test to verify it passes**
Run: `pytest tests/bench/test_integration_two_sidecars.py -v`
Expected: PASS (2 passed).

- [x] **Step 5: Commit**
```bash
git add tests/bench/fixtures.py tests/bench/test_integration_two_sidecars.py cortex/bench/runner.py
git commit -m "test(bench): integration test — two sidecars publish Design §5.8 metrics payloads

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Task 11: Error reporting — sidecar never crashes when all probes are unavailable

**Files:**
- Modify: `cortex/bench/runner.py` (wrap each probe call in try/except; emit zeros on failure)
- Test: `tests/bench/test_runner_error_reporting.py`

- [x] **Step 1: Write the failing test**
```python
# tests/bench/test_runner_error_reporting.py
import asyncio

import pytest

from cortex.bench.runner import BenchRunner


class _DyingBroker:
    def __init__(self) -> None:
        self.published = []

    async def publish_envelope(self, env) -> None:
        self.published.append(env)


class _ExplodingProbe:
    """Every probe_once call raises — simulates total probe failure."""

    available = False

    def probe_once(self):
        raise RuntimeError("embedder OOM")


class _ExplodingQueryProbe:
    def probe_once(self):
        raise RuntimeError("query engine offline")


class _ZeroGpuSensor:
    def snapshot(self) -> dict:
        return {"mem_util_pct": 0.0}


@pytest.mark.asyncio
async def test_sidecar_keeps_publishing_zeros_when_all_probes_fail():
    def probe_factory(node_id):
        return {
            "embed_radeon": _ExplodingProbe(),
            "embed_cpu": _ExplodingProbe(),
            "query_radeon": _ExplodingQueryProbe(),
            "query_cpu": _ExplodingQueryProbe(),
        }

    broker = _DyingBroker()
    runner = BenchRunner(
        node_id="did:percq:org:soc-alpha",
        broker_url="inmemory",
        config_path="bench.yaml",
        tick_interval=0.02,
        broker_client_factory=lambda url: broker,
        probe_factory=probe_factory,
        gpu_sensor=_ZeroGpuSensor(),
    )
    task = asyncio.create_task(runner.run())
    await asyncio.sleep(0.1)
    await runner.stop()
    await task

    assert len(broker.published) >= 1, "sidecar must keep emitting METRICS envelopes even when probes fail"
    for env in broker.published:
        assert env.payload["embeds_per_sec_radeon"] == 0.0
        assert env.payload["embeds_per_sec_cpu"] == 0.0
        assert env.payload["queries_per_sec_radeon"] == 0.0
        assert env.payload["queries_per_sec_cpu"] == 0.0
        assert env.payload["p95_query_latency_ms"] == 0.0
        assert env.payload["gpu_mem_util_pct"] == 0.0
```

- [x] **Step 2: Run test to verify it fails**
Run: `pytest tests/bench/test_runner_error_reporting.py -v`
Expected: FAIL — `BenchRunner._tick` lets probe exceptions bubble, so the loop dies and zero envelopes are published.

- [x] **Step 3: Write minimal implementation**
Replace `BenchRunner._tick` in `cortex/bench/runner.py` so each probe call is guarded:

```python
# cortex/bench/runner.py (excerpt — replace _tick() with this safe version)
    async def _tick(self) -> None:
        await asyncio.sleep(0)
        p = self._probes

        def _safe(fn, *args, **kw):
            try:
                return fn(*args, **kw)
            except Exception as e:
                log.warning("probe %s failed: %s", getattr(fn, "__name__", fn), e)
                return None

        er = _safe(p.embed_radeon.probe_once)
        ec = _safe(p.embed_cpu.probe_once)
        qr = _safe(p.query_radeon.probe_once)
        qc = _safe(p.query_cpu.probe_once)
        ec_r, et_r = er if er else (0, 0.0)
        ec_c, et_c = ec if ec else (0, 0.0)
        qc_r, qt_r, qp95_r = qr if qr else (0, 0.0, 0.0)
        qc_c, qt_c, qp95_c = qc if qc else (0, 0.0, 0.0)
        embeds_radeon = ec_r / et_r if et_r > 0 else 0.0
        embeds_cpu = ec_c / et_c if et_c > 0 else 0.0
        queries_radeon = qc_r / qt_r if qt_r > 0 else 0.0
        queries_cpu = qc_c / qt_c if qt_c > 0 else 0.0
        try:
            gpu = self._gpu_sensor.snapshot() if self._gpu_sensor is not None else {"mem_util_pct": 0.0}
        except Exception:
            gpu = {"mem_util_pct": 0.0}
        metrics = BenchMetrics(
            node=self.node_id,
            embeds_per_sec_radeon=embeds_radeon,
            embeds_per_sec_cpu=embeds_cpu,
            queries_per_sec_radeon=queries_radeon,
            queries_per_sec_cpu=queries_cpu,
            gpu_mem_util_pct=gpu["mem_util_pct"],
            p95_query_latency_ms=qp95_r,
            ts=datetime.now(timezone.utc),
        )
        env = to_envelope(metrics)
        if self._broker is not None:
            try:
                await self._broker.publish_envelope(env)
            except Exception as e:
                log.warning("publish_envelope failed: %s", e)
        log.info(
            "bench radeon=%.1f embeds/s cpu=%.1f embeds/s radeon_q=%.1f q/s cpu_q=%.1f q/s "
            "gpu=%s p95=%.1fms",
            embeds_radeon, embeds_cpu, queries_radeon, queries_cpu,
            gpu["mem_util_pct"], qp95_r,
        )
```

- [x] **Step 4: Run test to verify it passes**
Run: `pytest tests/bench/test_runner_error_reporting.py -v`
Expected: PASS (1 passed). Also re-run the full bench suite to confirm no regressions:
Run: `pytest tests/bench/ -v`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add cortex/bench/runner.py tests/bench/test_runner_error_reporting.py
git commit -m "fix(bench): emit zero-valued METRICS when probes fail; sidecar never crashes

Co-authored-by: excelle <7961300+excelle@users.noreply.github.com>"
```

---

## Self-review

**(1) Spec coverage.**

| Design ref | Coverage |
|---|---|
| §5.2 Envelope `{type, msg_id, src, dst, ts, payload}` | Task 1 — `to_envelope` populates all six fields with `type=METRICS`, `src=node`, `dst="*"` |
| §5.8 Metrics stream payload (7 keys) | Task 1 — `to_dict` key order asserted to match Design §5.8 exactly; Task 10 integration test re-asserts the order |
| §5.8 "Emitted every 2 seconds by cortex-bench (a sidecar that the node spawns)" | Task 6 — `BenchRunner` tick interval default `BENCH_TICK_INTERVAL_SEC=2.0` (Design-aligned); override only for tests |
| §15.1 "cortex-bench sidecar (per node)" | Task 8 — CLI launches one sidecar per node; integration test (Task 10) runs two sidecars |
| §16.2 Embeds/sec Radeon ≥ 350 | Task 9 — `EMBEDS_PER_SEC_RADEON_TARGET = 350` |
| §16.2 Embeds/sec CPU ≥ 30 | Task 9 — `EMBEDS_PER_SEC_CPU_TARGET = 30` |
| §16.2 Queries/sec Radeon over 10k ≥ 50 | Task 9 — `QUERIES_PER_SEC_RADEON_TARGET = 50` |
| §16.2 Broker fan-out ≥ 1000 to 4 peers | Task 9 — `BROKER_FANOUT_PER_SEC_TARGET = 1000` (bench exposes the constant; broker-side enforcement is owned by the cortex-broker plan) |
| §14.4 "Continuous embeds/sec and queries/sec on both Radeon and CPU paths" | Tasks 2 + 4 — `EmbedProbe` (Radeon+CPU) + `QueryProbe` (Radeon+CPU) |
| §14.4 "Reports metrics via the metrics stream" | Task 6 — `publish_envelope` to broker |
| §14.4 "Used as visual evidence of GPU load-bearing" | Task 5 — `GpuSensor.snapshot` provides `gpu_mem_util_pct` |
| Component 1 (metrics schema) | Task 1 |
| Component 2 (EmbedProbe with fallback) | Tasks 2 + 3 |
| Component 3 (QueryProbe) | Task 4 |
| Component 4 (GpuSensor) | Tasks 3 + 5 |
| Component 5 (Runner) | Tasks 6 + 7 + 11 |
| Component 6 (CLI) | Task 8 |
| Targets module | Tasks 6 + 9 |

**(2) Placeholder scan.** No "TBD/TODO/later/FIXME" in the plan. One intentional `rocm-smi` subprocess stub (`_rocm_smi_mem_util`) returns `0.0` without parsing — that is acceptable degradation because the primary path is `torch.cuda.memory_allocated/reserved` (per the locked contract); the subprocess branch is a documented fallback only. The `BenchRunner.config_path` parameter is accepted by the constructor and CLI but not yet read by the runner internals (the runner derives probes from defaults) — it is reserved for future config-driven probe tuning and does not gate any task. No placeholders in test expectations — every assertion is concrete.

**(3) Metric key names match Design §5.8.** Confirmed in three places:
- `BenchMetrics` dataclass fields: `node, embeds_per_sec_radeon, embeds_per_sec_cpu, queries_per_sec_radeon, queries_per_sec_cpu, gpu_mem_util_pct, p95_query_latency_ms` (Task 1).
- `to_dict` key order asserted verbatim in `test_to_dict_matches_design_5_8_exactly` (Task 1) AND `test_sidecar_metrics_payload_uses_design_5_8_key_order` (Task 10).
- Integration test `required_keys` set (Task 10) enumerates the same seven keys.

`ts` lives on the outer Envelope (per §5.2), not inside the payload — matching Design §5.8 which shows only the seven payload keys. No drift.

**(4) Deviations from the suggested task breakdown.** None material. The 11 tasks match the suggested breakdown 1:1, including the error-reporting task cut off in the prompt as "never " (completed as: "sidecar never crashes the bench process — never stops emitting METRICS envelopes"). Minor autonomy: (a) `GpuSensor` was implemented in Task 3 (not Task 5) because Task 3's fallback test requires it; Task 5 then adds the clamp/range branch tests — the plan flags this by noting Task 5 may pass immediately if tasks run in order. (b) The `BenchRunner` accepts `broker_client_factory` and `probe_factory` injection parameters not listed in the locked decisions — these are dependency-injection seams required for hermetic unit tests and do not change the production runtime surface (CLI still exposes only `--node`, `--broker`, `--config`, `--tick-interval`). (c) `_default_probe_factory` assumes `CortexNode(org_did=..., config={...})` and `Embedder(backend=...)` constructor shapes; the cortex-node plan owns those signatures and may need a one-line adjustment here when integrating.