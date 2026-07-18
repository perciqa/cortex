# Model Quantization for ROCm — Bonus Track

> Track 2 Bonus Points: *Core inference running using Radeon cloud model API with quantization or distillation or other optimization methods.*

## Approach: GPTQ Quantization via AutoGPTQ

### Recommended Model

| Model | Quantized Size | Quality Impact | Speedup vs FP16 |
|---|---|---|---|
| `TheBloke/Llama-3-8B-Instruct-GPTQ` (4-bit) | ~5.5 GB | Negligible | 2-3× throughput |
| `TheBloke/Llama-3-8B-Instruct-GPTQ:gptq-8bit` | ~8 GB | Virtually none | 1.5× throughput |

### Deployment with vLLM on ROCm

vLLM natively supports GPTQ models. Serve the quantized model:

```bash
vllm serve TheBloke/Llama-3-8B-Instruct-GPTQ \
  --quantization gptq \
  --dtype auto \
  --max-model-len 4096 \
  --gpu-memory-utilization 0.9 \
  --host 0.0.0.0 \
  --port 8000
```

### Alternative: AWQ Quantization

AWQ models are also supported by vLLM:

```bash
pip install autoawq
vllm serve TheBloke/Llama-3-8B-Instruct-AWQ \
  --quantization awq \
  --dtype auto \
  --max-model-len 4096
```

### Alternative: Distilled Model (TinyLlama)

If VRAM is limited on the Radeon Cloud instance:

```bash
vllm serve TinyLlama/TinyLlama-1.1B-Chat-v1.0 \
  --max-model-len 2048
```

Benchmark expected: ~3× faster than Llama-3 8B FP16, at ~60% of the reasoning quality.

## Verification

After deploying the quantized model, run the demo with:

```bash
python scripts/record-demo.py \
  --reasoner vllm \
  --vllm-url http://localhost:8000/v1
```

Check the recording report for GPU memory utilization and throughput numbers.

## Dependency Installation

```bash
# For GPTQ support
pip install auto-gptq optimum

# For AWQ support  
pip install autoawq

# vLLM with ROCm support
pip install vllm
```
