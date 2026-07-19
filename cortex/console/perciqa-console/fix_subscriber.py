"""Script to rewrite broker_subscriber.py to connect as a subscriber."""
import re

path = "/workspace/cortex/console/broker_subscriber.py"
with open(path) as f:
    content = f.read()

# The subscriber should connect to the broker without channel param
# and send a SUBSCRIBE message to register as a node
old_run = '''    async def run(self) -> None:
        backoff = self._min_backoff
        event_uri = self._uri + '?channel=event'
        while not self._stop.is_set():
            try:
                async with websockets.connect(event_uri) as ws:
                    log.info('broker connected: %s', event_uri)
                    backoff = self._min_backoff
                    while not self._stop.is_set():
                        raw = await ws.recv()
                        try:
                            env = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        if env.get('type') == 'event':
                            self._fanout.publish_event(env.get('payload', {}))
                        elif env.get('type') == 'metrics':
                            self._fanout.publish_metrics(env.get('payload', {}))
            except (OSError, websockets.ConnectionClosed):
                if self._stop.is_set():
                    break
                log.warning('broker disconnected; retrying in %.1fs', backoff)
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=backoff)
                except TimeoutError:
                    pass
                backoff = min(self._max_backoff, backoff * 2)'''

new_run = '''    async def run(self) -> None:
        backoff = self._min_backoff
        while not self._stop.is_set():
            try:
                async with websockets.connect(self._uri) as ws:
                    log.info('broker connected: %s', self._uri)
                    import uuid
                    sub = {
                        "type": "subscribe",
                        "msg_id": str(uuid.uuid4()),
                        "src": "did:percq:org:soc-alpha",
                        "ts": "2026-01-01T00:00:00Z",
                        "payload": {"node_id": "console-backend", "topics": ["*"], "scopes": ["public", "partner", "private"]}
                    }
                    await ws.send(json.dumps(sub))
                    ack = json.loads(await ws.recv())
                    log.info('subscribed to broker: %s', ack.get("type"))
                    backoff = self._min_backoff
                    while not self._stop.is_set():
                        raw = await ws.recv()
                        try:
                            env = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        if env.get("type") == "event":
                            self._fanout.publish_event(env.get("payload", {}))
                        elif env.get("type") == "metrics":
                            self._fanout.publish_metrics(env.get("payload", {}))
            except (OSError, websockets.ConnectionClosed):
                if self._stop.is_set():
                    break
                log.warning('broker disconnected; retrying in %.1fs', backoff)
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=backoff)
                except TimeoutError:
                    pass
                backoff = min(self._max_backoff, backoff * 2)'''

content = content.replace(old_run, new_run)

with open(path, "w") as f:
    f.write(content)
print("Fixed")
