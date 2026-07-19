# ROCm / Radeon Cloud Deployment

## SSH Access

| Pod | Port | Key | Purpose |
|-----|------|-----|---------|
| cortex | `31069` | `/tmp/cortex_ssh_key` | Cortex dev + demo (cycled) |
| inference | `31047` | `~/.ssh/rocm_pod` | Gemma 4 12B inference server |

```bash
# Cortex dev pod (when active)
ssh -i /tmp/cortex_ssh_key root@36.150.116.206 -p 31069

# Inference pod (Gemma 4 12B API server)
ssh -i ~/.ssh/rocm_pod root@36.150.116.206 -p 31047
```

> Pods are ephemeral — ports cycle on restart. Check `docs/rocma-notes.md` for latest ports.

## Inference Server (Gemma 4 12B)

An OpenAI-compatible API server runs on port `31047` serving `google/gemma-4-12B` (instruction-tuned).
Also available: `/workspace/aurora-code-merged` (fine-tuned Qwen 3.6 35B A3B).

### Quick test (via SSH tunnel or direct):

```bash
# List models
curl -s http://localhost:8000/v1/models | jq .

# Chat completion
curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemma-4-12B",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Write hello world in Rust"}
    ],
    "max_tokens": 200,
    "temperature": 0.1
  }' | jq .choices[0].message.content
```

### SSH tunnel (from local machine):

```bash
ssh -i ~/.ssh/rocm_pod -p 31047 -fNL 8000:localhost:8000 root@36.150.116.206
# Then use http://localhost:8000/v1 locally
```

### Connect from Python:

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="not-needed")
resp = client.chat.completions.create(
    model="google/gemma-4-12B",
    messages=[{"role": "user", "content": "Hello"}],
)
```

## Environment (Cortex Pod — Port 31069)

| Property | Value |
|----------|-------|
| GPU | AMD Radeon Graphics (gfx1100, RDNA3) |
| VRAM | 51.5 GB |
| Python | 3.12.3 |
| PyTorch | 2.6.0+rocm6.1 (in `/root/venv`) |
| ROCm | 7.2 |
| vLLM | source install at `/app/vllm/` |
| Disk | ~3.5 TB |

```bash
source /root/venv/bin/activate
```

All nodes auto-detect the GPU via `torch.cuda.is_available()` when `embedder_backend_override="auto"`.

## Running the Cortex Demo

### Verified: Single-node pipeline (broker + node + embed + trust + query)

A working test file exists at `/root/cortex/tps_orig.py` on the remote instance.

```bash
source /root/venv/bin/activate && cd /root/cortex
python3 tps_orig.py
```

### With live LLM reasoning (using inference server at :8000):

```bash
source /root/venv/bin/activate && cd /root/cortex
python scenarios/soc_consortium/demo_run.py --reasoner vllm --vllm-url http://localhost:8000/v1
```

### Record demo video:

```bash
python scripts/record-demo.py --reasoner vllm --record-video
```

### Known Issue: ROCm JIT cache collision

On the Cortex pod (ROCm 6.1 / PyTorch 2.6), **newly created `.py` files that load SentenceTransformer models may segfault** during model loading. The error is intermittent and related to PyTorch's JIT cache colliding with ROCm's code object management. Workarounds:

1. Re-run the script — it often works on the second attempt
2. Use the `tps_orig.py` file as a template (copy and extend it using `shutil.copy2`)
3. Export `PYTORCH_NO_CUDA_MEMORY_CACHING=1` before running

## Verifying GPU

```bash
rocm-smi
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'Device count: {torch.cuda.device_count()}'); print(f'Device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"}')"
```
