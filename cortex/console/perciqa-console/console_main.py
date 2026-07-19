from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass
from pathlib import Path

import uvicorn

from cortex.console.attack_matrix import AttackMatrixTracker
from cortex.console.backend import create_app_with_broker
from cortex.console.fanout import Fanout
from cortex.console.node_registry import NodeRegistry
from cortex.console.ring_buffer import EventRingBuffer, MetricsRingBuffer

DEMO_ARTICLES = [
    {"id": "a1", "type": "finding", "content": "SOC Alpha detected anomalous outbound TLS handshake to 185.220.101.23:443 - possible C2 beaconing. T1055.012.", "trust_score": 0.91, "scope": "partner", "cites": [], "payload": {"attack_id": "T1055"}},
    {"id": "a2", "type": "insight", "content": "Credential access attempts (T1555) spike 3x during 02:00-05:00 UTC. Likely password spraying from Tor exit nodes.", "trust_score": 0.78, "scope": "partner", "cites": []},
    {"id": "a3", "type": "warning", "content": "Signature mismatch in article provenance chain at depth 2. Possible key rotation without notification. T1574.002.", "trust_score": 0.65, "scope": "private", "cites": []},
    {"id": "a4", "type": "precedent", "content": "Supply chain compromise via malicious RMM tool signed update channel. Enforce cert pinning. T1195.001.", "trust_score": 0.88, "scope": "public", "cites": []},
    {"id": "a5", "type": "procedure", "content": "TLS inspection SOP: copy cert, verify trust, monitor audit logs. T1072.001.", "trust_score": 0.72, "scope": "public", "cites": []},
    {"id": "a6", "type": "finding", "content": "RCE via crafted GraphQL query to tenant API gateway (T1190). CVE-2026-1234.", "trust_score": 0.94, "scope": "private", "cites": [], "payload": {"attack_id": "T1190"}},
]


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="cortex.console")
    p.add_argument("--port", type=int, default=8080)
    p.add_argument("--static", default="frontend/dist")
    p.add_argument("--registry", default="org_registry.json")
    p.add_argument("--host", default="0.0.0.0")
    return p.parse_args(argv)


@dataclass
class Lifecycle:
    subscriber: object | None

    async def stop(self):
        pass


def build_app(static_dir, registry_path):
    fanout = Fanout()
    attack = AttackMatrixTracker()
    events_ring = EventRingBuffer(1000)
    metrics_ring = MetricsRingBuffer(60)
    nodes = NodeRegistry()

    for _a in DEMO_ARTICLES:
        payload = {"event": "article.published", "data": {"article": _a}}
        events_ring.append(payload)
        attack.on_event(payload)
    logging.info("Seeded %d demo articles", len(DEMO_ARTICLES))

    app = create_app_with_broker(
        static_dir=static_dir, registry_path=registry_path,
        fanout=fanout, broker_url=None,
        node_registry=nodes, attack_matrix=attack,
    )
    app.state.events_ring = events_ring
    app.state.metrics_ring = metrics_ring
    return app, Lifecycle(subscriber=None)


def main():
    args = parse_args()
    logging.basicConfig(level=logging.INFO)
    static_dir = Path(args.static)
    registry_path = Path(args.registry)
    app, lifecycle = build_app(static_dir=static_dir, registry_path=registry_path)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
