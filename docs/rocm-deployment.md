# ROCm / Radeon Cloud Deployment

## SSH Access

Single pod serves both inference (vLLM) and Cortex services:

| Pod | Port | Key | Purpose |
|-----|------|-----|---------|
| unified | `31047` | `~/.ssh/rocm_pod` | vLLM + broker + nodes + console |

```bash
ssh -i ~/.ssh/rocm_pod root@36.150.116.206 -p 31047
```

> Ports may cycle on pod restart. Check current port if connection fails.

## Environment

| Property | Value |
|----------|-------|
| GPU | AMD Radeon Graphics (gfx1100, RDNA3) |
| VRAM | 51.5 GB |
| Python | 3.12.3 (system) |
| PyTorch | 2.13.0+rocm7.2 (in venv — `pip install` with `--index-url https://download.pytorch.org/whl/rocm7.2`) |
| ROCm | 7.2.1 |
| vLLM | 0.25.1 (`pip install vllm` — torch auto-downgraded to 2.11.0 by pip, then ROCm torch reinstalled with `--no-deps`) |
| Code | `/workspace/cortex/` (rsync'd from local dev machine) |
| venv | `/workspace/cortex/.venv/` |
| Disk | ~3.5 TB |

```bash
. /workspace/cortex/.venv/bin/activate
```

GPU auto-detection via `torch.cuda.is_available()` works when `embedder.backend: auto`.

## Services

All services run persistently in the background via `setsid` and `disown`. They survive SSH session disconnection.

| Service | Port | Config | Start command |
|---------|------|--------|--------------|
| Broker | 7432 | `configs/broker.yaml` | `python -m cortex.broker --config configs/broker.yaml` |
| Node Alpha | — | `configs/alpha.yaml` | `python -m cortex.cli start --config configs/alpha.yaml` |
| Node Beta | — | `configs/beta.yaml` | `python -m cortex.cli start --config configs/beta.yaml` |
| Console | 8080 | `registry/org_registry.json` | `python -m cortex.console --port 8080 --host 0.0.0.0 --broker ws://localhost:7432 --static /workspace/cortex/cortex/console/frontend/dist --registry /workspace/cortex/registry/org_registry.json` |
| vLLM | 8000 | Gemma 4 12B | `vllm serve google/gemma-4-12B --port 8000 --host 0.0.0.0 --max-model-len 8192 --dtype auto --gpu-memory-utilization 0.9` |

### Start all services from local machine:

```bash
ssh -i ~/.ssh/rocm_pod root@36.150.116.206 -p 31047 '
  set -m
  cd /workspace/cortex

  # Start broker
  /workspace/cortex/.venv/bin/python -m cortex.broker --config configs/broker.yaml \
    </dev/null >>logs/broker.log 2>&1 &
  disown $!

  sleep 2

  # Start console (auto-adds ?channel=event to broker URL)
  /workspace/cortex/.venv/bin/python -m cortex.console --port 8080 --host 0.0.0.0 \
    --broker ws://localhost:7432 \
    --static /workspace/cortex/cortex/console/frontend/dist \
    --registry /workspace/cortex/registry/org_registry.json \
    </dev/null >>logs/console.log 2>&1 &
  disown $!

  echo "Started"
'
```

### SSH tunnel for local access:

```bash
ssh -i ~/.ssh/rocm_pod -p 31047 -fNL 9090:localhost:8080 root@36.150.116.206
# Console: http://localhost:9090/
# API:     http://localhost:9090/api/attack-matrix
# API:     http://localhost:9090/api/tenants
```

## Cloudflare Tunnel (perciqa-console frontend)

The Next.js frontend (`cortex/console/perciqa-console/`) runs on the pod at port `3001` and is exposed publicly via Cloudflare Tunnel on a local machine (not the pod). The tunnel routes `https://cortex.perciqa.com` → cloudflared (local) → SSH tunnel → pod:3001.

### Architecture

```
Browser → https://cortex.perciqa.com → Cloudflare Edge → cloudflared (local) → SSH :3001 → pod :3001 → Next.js
                                                                                           pod :8080  → Cortex Console API
                                                                       → SSH :8080 → pod :8080  → Cortex Console API
```

### Prerequisites

- Cloudflare API token with `Cloudflare Tunnel:Edit` permission
- Tunnel ID: `d5b6d0c5-ac24-491f-9a1c-2fd163a2e548` (named "Cortex")
- cloudflared installed locally (macOS: `brew install cloudflared`)

### Start the tunnel stack

Run these commands locally in order:

```bash
# 1. SSH tunnels to the pod (two ports)
ssh -i ~/.ssh/rocm_pod -p 31047 -fNL 3001:localhost:3001 root@36.150.116.206
ssh -i ~/.ssh/rocm_pod -p 31047 -fNL 8080:localhost:8080 root@36.150.116.206

# 2. Verify tunnels work
curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/login   # should be 200
curl -s http://localhost:8080/api/attack-matrix                        # should return JSON

# 3. Start Cloudflare Tunnel (uses your account's token)
cloudflared tunnel run --token '<TOKEN>'
```

The tunnel fetches its ingress config from Cloudflare's API. The published application route is configured in the dashboard:
- **Hostname**: `cortex.perciqa.com`
- **Service**: `http://localhost:3001`
- **Type**: HTTP
- **TLS Origin**: off (the tunnel-to-origin leg uses plain HTTP)

### Restarting (when SSH tunnels die)

SSH tunnels are fragile and may drop after hours of inactivity. Restart in order:

```bash
kill $(lsof -ti:3001 -ti:8080 2>/dev/null) 2>/dev/null
ssh -i ~/.ssh/rocm_pod -p 31047 -fNL 3001:localhost:3001 root@36.150.116.206
ssh -i ~/.ssh/rocm_pod -p 31047 -fNL 8080:localhost:8080 root@36.150.116.206
```

Double-check the frontend is still running on the pod:
```bash
ssh -i ~/.ssh/rocm_pod -p 31047 root@36.150.116.206 \
  "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/login"
# If 000, restart it:
ssh -i ~/.ssh/rocm_pod -p 31047 root@36.150.116.206 \
  "cd /workspace/cortex/console/perciqa-console && NEXT_PUBLIC_ENABLE_ARGUS=false nohup node_modules/.bin/next start -p 3001 > /tmp/frontend.log 2>&1 &"
```

### Feature flags

| Env var | Default | Effect |
|---------|---------|--------|
| `NEXT_PUBLIC_ENABLE_ARGUS` | `false` | When `true`, shows Argus section in sidebar |

Set at build time (substituted into client bundles):
```bash
NEXT_PUBLIC_ENABLE_ARGUS=false npm run build
```

## Initial Setup (from clean pod)

### 1. Create venv and install PyTorch (ROCm)

```bash
cd /workspace/cortex
python3 -m venv .venv
.venv/bin/pip install --upgrade pip setuptools wheel
.venv/bin/pip install torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/rocm7.2
```

Verify GPU:
```bash
.venv/bin/python -c "import torch; print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0))"
# → True, AMD Radeon Graphics
```

### 2. Install vLLM (with ROCm torch workaround)

```bash
.venv/bin/pip install vllm  # auto-downgrades torch to CUDA variant
.venv/bin/pip uninstall -y torch torchvision torchaudio
.venv/bin/pip install torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/rocm7.2
.venv/bin/pip install --no-deps vllm  # keep ROCm torch
```

### 3. Install project deps

```bash
cd /workspace/cortex
.venv/bin/pip install -e '.[gpu,sdk]'
```

### 4. Upload the BGE embedding model

The pod has no internet. Upload the model from a machine that has it cached:

```bash
rsync -avz ~/.cache/huggingface/hub/models--BAAI--bge-small-en-v1.5/ \
  root@36.150.116.206:/root/.cache/huggingface/hub/models--BAAI--bge-small-en-v1.5/ \
  -e "ssh -i ~/.ssh/rocm_pod -p 31047"
chown -R root:root /root/.cache/huggingface/hub/models--BAAI--bge-small-en-v1.5/
```

### 5. Generate keys and config

```bash
cd /workspace/cortex
mkdir -p configs/keys registry logs

# Generate Ed25519 keys
.venv/bin/python -c '
from cortex.node.keys import ensure_keys
from pathlib import Path
Path("configs/keys").mkdir(parents=True, exist_ok=True)
ensure_keys(Path("configs/keys/alpha_org.pem"))
ensure_keys(Path("configs/keys/alpha_agent.pem"), kind="agent")
ensure_keys(Path("configs/keys/beta_org.pem"))
ensure_keys(Path("configs/keys/beta_agent.pem"), kind="agent")
'

# Create registry with real public keys
.venv/bin/python -c '
import json
from pathlib import Path
from cryptography.hazmat.primitives import serialization
keys = {}
for label, path in [("soc-alpha", "configs/keys/alpha_org.pem"), ("soc-beta", "configs/keys/beta_org.pem")]:
    with open(path, "rb") as f:
        key = serialization.load_pem_private_key(f.read(), password=None)
    pub = key.public_key()
    pub_pem = pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    keys[label] = pub_pem
registry = {
    "did:percq:org:soc-alpha": {"pubkey": keys["soc-alpha"], "name": "SOC Alpha", "topics": ["*"]},
    "did:percq:org:soc-beta": {"pubkey": keys["soc-beta"], "name": "SOC Beta", "topics": ["*"]},
}
Path("registry/org_registry.json").write_text(json.dumps(registry, indent=2))
'

# Create broker config
cat > configs/broker.yaml << 'EOF'
broker:
  host: 0.0.0.0
  port: 7432
  registry_path: /workspace/cortex/registry/org_registry.json
  replay_window_sec: 600
EOF

# Create node configs (see start_services.sh in repo for full versions)
```

### 6. Sync the codebase

```bash
rsync -avz --exclude='.venv' --exclude='__pycache__' --exclude='.git' \
  --exclude='node_modules' --exclude='dist' --exclude='*.pyc' \
  /path/to/local/cortex/ root@36.150.116.206:/workspace/cortex/ \
  -e "ssh -i ~/.ssh/rocm_pod -p 31047"
```

### 7. Start vLLM server

```bash
cd /workspace/cortex
VLLM_TARGET_DEVICE=rocm HIP_VISIBLE_DEVICES=0 nohup .venv/bin/vllm serve \
  google/gemma-4-12B --port 8000 --host 0.0.0.0 \
  --max-model-len 8192 --dtype auto --gpu-memory-utilization 0.9 \
  > vllm.log 2>&1 &
```

## Running the Demo

### With live LLM reasoning (Gemma 4 12B):

```bash
cd /workspace/cortex
VLLM_URL=http://localhost:8000/v1 PYTHONPATH=. \
  .venv/bin/python scenarios/soc_consortium/demo_run.py \
  --reasoner vllm --vllm-url http://localhost:8000/v1 --no-record-optional
```

### With scripted reasoner (no GPU needed for reasoning):

```bash
cd /workspace/cortex
PYTHONPATH=. .venv/bin/python scenarios/soc_consortium/demo_run.py \
  --no-record-optional
```

## Bugs Fixed in This Session (2026-07-19)

### Broker: `_parse_ts` failed on ISO timestamps

`datetime.strptime` with format `%z` requires `+HHMM` but `datetime.isoformat()` produces `+HH:MM`. Fixed to use `datetime.fromisoformat()` which handles both formats.

**File:** `cortex/broker/server.py` — `_parse_ts` method

### Broker: `OrgRegistry` missing `lookup` method

`_handle_publish` called `self.registry.lookup(src_org)` but the method is named `get`. Added a `lookup` method that returns the pubkey string directly.

**File:** `cortex/broker/registry.py` — added `lookup` method

### Broker: verified `agent_signature` against org's public key

The broker verified `art.agent_signature` against the org's Ed25519 public key, but the agent signature is created with the agent's private key (different key pair). Fixed to verify `org_signature` (falling back to `agent_signature` if org sig is null).

**File:** `cortex/broker/server.py` — line 269

### Broker config: `registry_path` key mismatch

YAML config uses `registry_path` but the config loader looked for `registry`. Fixed to check `registry_path` first, falling back to `registry`.

**File:** `cortex/broker/config.py` — line 26

### Node: `BrokerClient` never sent SUBSCRIBE envelope

The broker expects the first message from any WebSocket connection to be a `subscribe` envelope. Without it, the broker waits 10 seconds then closes the connection. The `BrokerClient.connect()` method was modified to send a `subscribe` envelope immediately after the WebSocket handshake.

**File:** `cortex/node/broker_client.py` — `connect` method

### Console event subscriber URL

The console's `BrokerSubscriber` connected to `ws://localhost:7432` without the `?channel=event` parameter, so it never received events from the broker. Fixed `__main__.py` to append `?channel=event` to the broker URL if not already present.

**File:** `cortex/console/__main__.py` — `build_app` function

### Event payload: missing article data

The broker's `article.published` event only included `article_id`, `src_org`, `topic`, and `scope` — not the full article payload. The `AttackMatrixTracker` needs `article.payload.attack_id`. Fixed to include the full article dict.

**File:** `cortex/broker/server.py` — `_handle_publish` method

### Python 3.14 local dev: hnswlib segfault

hnswlib segfaults on Python 3.14 in certain call patterns. Added `NumpyIndex` — a pure-NumPy brute-force vector index — as a fallback backend in `cortex/node/vector_index.py`. Configurable via `vector_index.backend: numpy` in node YAML config.

**File:** `cortex/node/vector_index.py` — added `NumpyIndex` class  
**File:** `cortex/node/node.py` — added `"numpy"` backend branch

## Key Configuration Files

All paths relative to `/workspace/cortex/`:

| File | Purpose |
|------|---------|
| `configs/broker.yaml` | Broker host/port/registry path |
| `configs/alpha.yaml` | Node-alpha: GPU embedder, numpy vector index, registered org keys |
| `configs/beta.yaml` | Node-beta: same structure as alpha |
| `configs/keys/alpha_org.pem` | Ed25519 private key for SOC Alpha org |
| `configs/keys/alpha_agent.pem` | Ed25519 private key for Alpha's agent |
| `configs/keys/beta_org.pem` | Ed25519 private key for SOC Beta org |
| `configs/keys/beta_agent.pem` | Ed25519 private key for Beta's agent |
| `registry/org_registry.json` | Maps org DIDs to Ed25519 public keys + metadata |
| `logs/broker.log` | Broker runtime log |
| `logs/console.log` | Console runtime log |
| `logs/alpha.log` | Node-alpha runtime log |
| `logs/beta.log` | Node-beta runtime log |
| `start_services.sh` | Helper to start broker + console |

## Verifying GPU

```bash
rocm-smi
.venv/bin/python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0)}')"
```

## Common Issues

### vLLM can't detect ROCm device

Install `amdsmi` or set `VLLM_TARGET_DEVICE=rocm`:
```bash
pip install amdsmi
export VLLM_TARGET_DEVICE=rocm
```

### vLLM install downgrades torch from ROCm → CUDA

`pip install vllm` pulls `torch==2.11.0+cu130` (CUDA). After install, reinstall ROCm torch and use `--no-deps`:
```bash
pip uninstall -y torch torchvision torchaudio
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/rocm7.2
pip install --no-deps vllm
```

### Embedding model not found (no internet on pod)

Upload the model from a local machine:
```bash
rsync -avz ~/.cache/huggingface/hub/models--BAAI--bge-small-en-v1.5/ \
  root@36.150.116.206:/root/.cache/huggingface/hub/models--BAAI--bge-small-en-v1.5/ \
  -e "ssh -i ~/.ssh/rocm_pod -p 31047"
```

Or configure the node YAML to use a local path:
```yaml
embedder:
  model: /root/.cache/huggingface/hub/models--BAAI--bge-small-en-v1.5/snapshots/<hash>
```

### Background processes die on SSH logout

Use `setsid -w` or `set -m` + `disown` (both demonstrated in the start commands above). tmux is also available on the pod.

### Registry has dummy pubkeys (`"A"`, `"B"`)

The broker verifies publish signatures against the org's Ed25519 public key. Dummy keys cause all publishes to be rejected and no events broadcast. Generate real keys and update the registry as shown in step 5 of initial setup.
