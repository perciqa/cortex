"""Day-1 ROCm spike: get bge-small-en-v1.5 producing embeddings on Radeon (or fallback)."""
import time

import torch
from torch import Tensor
from transformers import AutoModel, AutoTokenizer

MODEL = "BAAI/bge-small-en-v1.5"  # or local path like "/tmp/bge-model-raw"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def main(batch: int = 16) -> None:
    tok = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModel.from_pretrained(MODEL).to(DEVICE).eval()
    texts = ["findings on APT29 T1059.001 encoded powershell"] * batch
    t0 = time.perf_counter()
    enc = tok(texts, padding=True, truncation=True, max_length=512, return_tensors="pt").to(DEVICE)
    with torch.inference_mode():
        out: Tensor = model(**enc).last_hidden_state.mean(dim=1)
    out = torch.nn.functional.normalize(out, dim=-1)
    dt = (time.perf_counter() - t0) * 1000.0
    print(f"device={DEVICE} hip={getattr(torch.version, 'hip', None)}")
    print(f"batch={batch} shape={tuple(out.shape)} dtype={out.dtype} latency_ms={dt:.2f}")
    print(f"throughput={batch/(dt/1000):.1f} embeds/sec")


if __name__ == "__main__":
    import sys
    main(batch=int(sys.argv[1]) if len(sys.argv) > 1 else 16)
