from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Callable
from pathlib import Path

log = logging.getLogger("cortex.node.broker")


class BrokerClient:
    def __init__(
        self,
        url: str,
        org_did: str,
        registry_path: Path,
        replay_window_sec: int = 600,
        on_event: Callable[..., None] | None = None,
        on_metrics: Callable[..., None] | None = None,
        on_publish: Callable[..., None] | None = None,
        on_query: Callable[..., list[dict]] | None = None,
        outbound_spill_dir: Path = Path("./cortex-node/outbound"),
        outbound_cap: int = 10000,
        spill_threshold: int = 10000,
    ) -> None:
        self.url = url
        self.org_did = org_did
        self.registry_path = Path(registry_path)
        self.replay_window_sec = replay_window_sec
        self.on_event = on_event or (lambda *_: None)
        self.on_metrics = on_metrics or (lambda *_: None)
        self.on_publish = on_publish or (lambda *_: None)
        self.on_query = on_query or (lambda e: [])
        self.outbound_spill_dir = Path(outbound_spill_dir)
        self.outbound_cap = outbound_cap
        self.spill_threshold = spill_threshold
        self._outbound: asyncio.Queue = asyncio.Queue()
        self._ws = None
        self._connected = False
        self._stop = asyncio.Event()
        self._sender_task: asyncio.Task | None = None
        self._reader_task: asyncio.Task | None = None
        self._spill_seq = 0
        self._pending_query_results: dict[str, asyncio.Future] = {}

    async def _connect_socket(self) -> None:
        import websockets
        self._ws = await websockets.connect(self.url)
        self._connected = True

    async def connect(self) -> None:
        await self._connect_socket()
        self._sender_task = asyncio.create_task(self._sender_loop())
        self._reader_task = asyncio.create_task(self._reader_loop())

    async def _reader_loop(self) -> None:
        ws = self._ws
        if ws is None:
            return
        try:
            async for msg in ws:
                try:
                    env = json.loads(msg)
                except Exception:
                    continue
                t = env.get("type")
                if t == "event":
                    self.on_event(env.get("event"), env.get("article_id"), env.get("payload", {}))
                elif t == "metrics":
                    self.on_metrics(env.get("payload", {}))
                elif t == "publish":
                    result = self.on_publish(env)
                    if asyncio.iscoroutine(result):
                        asyncio.ensure_future(result)
                elif t == "query_result":
                    qid = (env.get("payload") or {}).get("query_id")
                    if qid and qid in self._pending_query_results:
                        self._pending_query_results[qid].set_result(env)
                elif t == "query":
                    results = self.on_query(env) or []
                    resp = {
                        "type": "query_result",
                        "msg_id": env.get("msg_id", ""),
                        "src": self.org_did,
                        "dst": env.get("src", "*"),
                        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "payload": {
                            "query_id": (env.get("payload") or {}).get("query_id", ""),
                            "results": results,
                        },
                    }
                    asyncio.ensure_future(self.publish_envelope(resp))
        except Exception:
            self._connected = False

    async def stop(self) -> None:
        self._stop.set()
        for task in (self._sender_task, self._reader_task):
            if task:
                try:
                    await asyncio.wait_for(task, timeout=1.0)
                except TimeoutError:
                    task.cancel()
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:
                pass

    async def publish_envelope(self, env: dict) -> None:
        if self._outbound.qsize() >= self.spill_threshold:
            self._spill_to_disk(env)
            self.on_event("node.queue.spilled", None, {"qsize": self._outbound.qsize()})
            return
        await self._outbound.put(env)

    async def query_fanout(self, query_env: dict) -> dict:
        qid = (query_env.get("payload") or {}).get("query_id", query_env.get("msg_id"))
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._pending_query_results[qid] = fut
        await self.publish_envelope(query_env)
        deadline_ms = int((query_env.get("payload") or {}).get("deadline_ms", 500))
        try:
            result = await asyncio.wait_for(fut, timeout=deadline_ms / 1000.0 + 0.5)
        except (TimeoutError, asyncio.CancelledError):
            result = {"type": "query_result", "results": [], "src": self.org_did}
        finally:
            self._pending_query_results.pop(qid, None)
        return result

    def _spill_to_disk(self, env: dict) -> None:
        self.outbound_spill_dir.mkdir(parents=True, exist_ok=True)
        self._spill_seq += 1
        (self.outbound_spill_dir / f"{int(time.time()*1000)}_{self._spill_seq}.json").write_text(
            json.dumps(env, separators=(",", ":")), encoding="utf-8"
        )

    async def _sender_loop(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                if not self._connected:
                    await self._reconnect()
                    backoff = 1.0
                env = await asyncio.wait_for(self._outbound.get(), timeout=0.5)
                if self._ws is None:
                    await self._outbound.put(env)
                    continue
                await self._ws.send(json.dumps(env, separators=(",", ":")))
            except TimeoutError:
                continue
            except Exception as e:
                log.warning("broker send error: %s", e)
                self._connected = False
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    async def _reconnect(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                await self._connect_socket()
                return
            except Exception as e:
                log.warning("broker reconnect failed: %s", e)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
