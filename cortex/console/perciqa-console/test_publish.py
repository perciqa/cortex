import asyncio, json, uuid
import websockets

async def test():
    uri = 'ws://localhost:7432'
    async with websockets.connect(uri) as ws:
        sub = {
            'type': 'subscribe',
            'msg_id': str(uuid.uuid4()),
            'src': 'did:percq:org:soc-alpha',
            'payload': {'node_id': 'test', 'topics': ['*'], 'scopes': ['public']}
        }
        await ws.send(json.dumps(sub))
        ack = json.loads(await ws.recv())
        print('Sub ack:', ack.get('type'))

        pub = {
            'type': 'publish',
            'msg_id': str(uuid.uuid4()),
            'src': 'did:percq:org:soc-alpha',
            'payload': {
                'event': 'article.published',
                'data': {
                    'article': {
                        'id': 'test-1',
                        'type': 'finding',
                        'content': 'Test article',
                        'trust_score': 0.5,
                        'scope': 'public',
                    }
                }
            }
        }
        await ws.send(json.dumps(pub))
        resp = json.loads(await ws.recv())
        print('Pub response:', json.dumps(resp, indent=2)[:500])

asyncio.run(test())
