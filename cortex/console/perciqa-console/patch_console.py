import re

path = "/workspace/cortex/console/__main__.py"
with open(path) as f:
    content = f.read()

demo_code = r'''
import json

DEMO_ARTICLES = [
    {"id":"a1","type":"finding","content":"SOC Alpha detected anomalous outbound TLS handshake to 185.220.101.23:443 at 2026-07-19T14:23:11Z - possible C2 beaconing. Correlation with process injection alert T1055.012 on workstation WKS-0442.","trust_score":0.91,"scope":"partner","cites":[]},
    {"id":"a2","type":"insight","content":"Observed pattern: credential access attempts (T1555) spike 3x during 02:00-05:00 UTC across both consortium members. Likely automated password spraying from Tor exit nodes. Recommend implementing geofencing for off-hours access.","trust_score":0.78,"scope":"partner","cites":[]},
    {"id":"a3","type":"warning","content":"Signature mismatch in article provenance chain at depth 2: org_signature for node soc-beta.agent-7 does not match expected key fingerprint. Possible key rotation without notification or tampered payload. See T1574.002.","trust_score":0.65,"scope":"private","cites":[]},
    {"id":"a4","type":"precedent","content":"Similar supply chain compromise observed in SOC Beta telemetry 2026-06-28: attacker deployed malicious RMM tool via signed update channel. Mitigation: enforce certificate pinning on all agent update endpoints. Maps to T1195.001.","trust_score":0.88,"scope":"public","cites":[]},
    {"id":"a5","type":"procedure","content":"Standard operating procedure for TLS inspection: copy cert, run trust verification, monitor audit logs. T1072.001 covers automation of deployment flows.","trust_score":0.72,"scope":"public","cites":[]},
    {"id":"a6","type":"finding","content":"SOC Beta reports successful RCE via crafted GraphQL query to tenant API gateway (T1190). Initial access via unpatched Apollo Server 4.10.2 vulnerability CVE-2026-1234.","trust_score":0.94,"scope":"private","cites":[]},
]
for _a in DEMO_ARTICLES:
    events_ring.append({"event":"article.published","data":{"article":_a}})
    attack.on_event({"event":"article.published","data":{"article":_a}})
print(f"Seeded {len(DEMO_ARTICLES)} demo articles")
'''

marker = "app.state.subscriber = sub"
assert marker in content, "marker not found!"
content = content.replace(marker, marker + "\n" + demo_code)

with open(path, "w") as f:
    f.write(content)
print("Patched __main__.py")
