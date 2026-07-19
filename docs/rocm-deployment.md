# ROCm / Radeon Cloud Deployment

## SSH Access

| Field | Value |
|-------|-------|
| Host | `36.150.116.206` |
| Port | `31069` |
| User | `root` |
| Key | `/tmp/cortex_ssh_key` |

```bash
ssh -i /tmp/cortex_ssh_key root@36.150.116.206 -p 31069
```

## Environment

## Environment (Verified)

| Property | Value |
|----------|-------|
| GPU | AMD Radeon Graphics (gfx1100, RDNA3) |
| VRAM | 51.5 GB |
| Python | 3.12.3 |
| PyTorch | 2.6.0+rocm6.1 (in `/root/venv`) |
| ROCm | 7.2 |
| vLLM | source install at `/app/vllm/` |
| Disk | ~3.5 TB |

Before running any Python commands, activate the venv:

```bash
source /root/venv/bin/activate
```

All nodes auto-detect the GPU via `torch.cuda.is_available()` when `embedder_backend_override="auto"`.

## Model Deployment

The embedding model must be available locally (no internet access on Radeon Cloud):

```bash
# Upload model (from local machine):
rsync -av -e "ssh -i /tmp/cortex_ssh_key -p 31069" /tmp/bge-small-en-v1.5/ root@36.150.116.206:/root/cortex/models/bge-small-en-v1.5/
```

## Running the Demo

### Verified: Single-node pipeline (broker + node + embed + trust + query)

A working test file exists at `/root/cortex/tps_orig.py` on the remote instance.

```bash
# Activate environment
source /root/venv/bin/activate && cd /root/cortex

# Run the verified test (starts broker, node, embeds, scores trust, queries)
python3 tps_orig.py
```

### Full demo (when vLLM is running):

```bash
# Start vLLM server (background)  
vllm serve meta-llama/Llama-3-8B-Instruct \
  --dtype auto \
  --max-model-len 4096 \
  --gpu-memory-utilization 0.9 \
  --host 0.0.0.0 \
  --port 8000 &

# Run the demo
python scenarios/soc_consortium/demo_run.py

# Or record with metrics
python scripts/record-demo.py --record-video
```

### Known Issue: ROCm JIT cache collision

On this instance (ROCm 6.1 / PyTorch 2.6), **newly created `.py` files that load SentenceTransformer models may segfault** during model loading. The error is intermittent and related to PyTorch's JIT cache colliding with ROCm's code object management. Workarounds:

1. Re-run the script — it often works on the second attempt
2. Use the `tps_orig.py` file as a template (copy and extend it with `shutil.copy2`)
3. Export `PYTORCH_NO_CUDA_MEMORY_CACHING=1` before running

## Verifying GPU

```bash
rocm-smi
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'Device count: {torch.cuda.device_count()}'); print(f'Device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"N/A\"}')"
```
