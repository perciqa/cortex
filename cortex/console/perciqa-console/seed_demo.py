import asyncio
import json
import uuid
from datetime import datetime, timezone

ARTICLES = [
    {'type': 'finding', 'content': 'SOC Alpha detected anomalous outbound TLS handshake to 185.220.101.23:443 at 2026-07-19T14:23:11Z — possible C2 beaconing. Correlation with process injection alert T1055.012 on workstation WKS-0442.', 'trust_score': 0.91, 'scope': 'partner'},
    {'type': 'insight', 'content': 'Observed pattern: credential access attempts (T1555) spike 3x during 02:00-05:00 UTC across both consortium members. Likely automated password spraying from Tor exit nodes. Recommend implementing geofencing for off-hours access.', 'trust_score': 0.78, 'scope': 'partner'},
    {'type': 'warning', 'content': 'Signature mismatch in article provenance chain at depth 2: org_signature for node soc-beta.agent-7 does not match expected key fingerprint. Possible key rotation without notification or tampered payload. See T1574.002.', 'trust_score': 0.65, 'scope': 'private'},
    {'type': 'precedent', 'content': 'Similar supply chain compromise observed in SOC Beta telemetry 2026-06-28: attacker deployed malicious RMM tool via signed update channel. Mitigation: enforce certificate pinning on all agent update endpoints. Maps to T1195.001.', 'trust_score': 0.88, 'scope': 'public'},
    {'type': 'procedure', 'content': 'Standard operating procedure for TLS inspection: copy cert, run trust verification, monitor audit logs. T1072.001 covers automation of deployment flows.', 'trust_score': 0.72, 'scope': 'public'},
    {'type': 'finding', 'content': 'SOC Beta reports successful RCE via crafted GraphQL query to tenant API gateway (T1190). Initial access via unpatched Apollo Server 4.10.2 vulnerability CVE-2026-1234.', 'trust_score': 0.94, 'scope': 'private'},
]

import websockets

def ts():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

async def seed():
    uri = 'ws://localhost:7432'
    async with websockets.connect(uri) as ws:
        sub = {
            'type': 'subscribe', 'ts': ts(),
            'msg_id': str(uuid.uuid4()),
            'src': 'did:percq:org:soc-alpha',
            'payload': {'node_id': 'demo-seed', 'topics': ['*'], 'scopes': ['public', 'partner', 'private']}
        }
        await ws.send(json.dumps(sub))
        ack = json.loads(await ws.recv())
        print('Subscribed:', ack.get('type'))

        for i, art in enumerate(ARTICLES):
            env = {
                'type': 'publish', 'ts': ts(),
                'msg_id': str(uuid.uuid4()),
                'src': 'did:percq:org:soc-alpha',
                'payload': {
                    'event': 'article.published',
                    'data': {
                        'article': {
                            'id': f'demo-{i+1}',
                            'type': art['type'],
                            'content': art['content'],
                            'trust_score': art['trust_score'],
                            'scope': art['scope'],
                            'cites': [],
                            'agent_signature': f'sig:agent:demo-{i+1}',
                            'org_signature': f'sig:org:demo-{i+1}',
                        }
                    }
                }
            }
            await ws.send(json.dumps(env))
            resp = json.loads(await ws.recv())
            status = resp.get('type', '?')
            if status != 'ack':
                print(f'  {i+1}/{len(ARTICLES)}: {art["type"]} -> {status}: {resp.get("payload", {}).get("code", "")}')
            else:
                print(f'  {i+1}/{len(ARTICLES)}: {art["type"]} -> ack')

asyncio.run(seed())
print('Seed complete!')
