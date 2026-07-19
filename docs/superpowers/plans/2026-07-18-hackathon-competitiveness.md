# Hackathon Competitiveness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close critical gaps identified in the hackathon competitiveness analysis (68/120 → target 100+/120)

**Architecture:** Changes span 4 layers: (1) Docker/Deploy — GPU support, (2) Demo pipeline — GPU auto-detect + live vLLM reasoning, (3) Agent SDK — conversational memory, (4) Submission deliverables — PDF spec, demo recording script

**Tech Stack:** Python 3.12, ROCm 7.2, vLLM, PyTorch, weasyprint/md-to-pdf

---

### Task 1: Fix Dockerfile for ROCm + GPU deps

**Files:**
- Modify: `deploy/Dockerfile`

- [ ] **Change base image to `rocm/pytorch:latest` and install `.[gpu]`**

Edit `deploy/Dockerfile`:
- Base: `FROM rocm/pytorch:latest` (ROCm+PyTorch pre-installed)
- Install: `pip install --no-cache-dir -e ".[gpu]"` instead of `.[cpu]`
- Add port for vLLM server (8000)

### Task 2: Fix demo_run.py to auto-detect GPU

**Files:**
- Modify: `scenarios/soc_consortium/demo_run.py`
- Modify: `scenarios/soc_consortium/agent_alpha.py`
- Modify: `scenarios/soc_consortium/agent_beta.py`

- [ ] **Change `embedder_backend_override="cpu"` to `embedder_backend_override="auto"` in demo_run.py**

In `demo_run.py`, lines 96 and 99, change `embedder_backend_override="cpu"` to `embedder_backend_override="auto"`.

- [ ] **Change `embedder_backend_override="cpu"` to `embedder_backend_override="auto"` in agent_alpha.py main()**

Line 126 in `agent_alpha.py`: `embedder_backend_override="cpu"` → `embedder_backend_override="auto"`

- [ ] **Change `embedder_backend_override="cpu"` to `embedder_backend_override="auto"` in agent_beta.py main()**

Line 162 in `agent_beta.py`: `embedder_backend_override="cpu"` → `embedder_backend_override="auto"`

### Task 3: Wire vLLM reasoning through demo_run.py

**Files:**
- Modify: `scenarios/soc_consortium/demo_run.py`

- [ ] **Add `--reasoner` flag to demo_run.py CLI and pass through to alpha_run**

In `demo_run.py`:
- Add `reasoner` parameter to `run_demo()` function
- In the `main()` CLI, add `--reasoner` argument with choices `["scripted", "vllm"]`
- Pass it through to `alpha_run(client_a, step="all", reasoner=reasoner)`
- Add vLLM URL env var support (default `http://localhost:8000/v1`)

### Task 4: Add conversational memory to agent loop

**Files:**
- Create: `cortex/sdk/memory.py`
- Modify: `cortex/sdk/llm.py`

- [ ] **Create `cortex/sdk/memory.py` with `ConversationMemory` class**

```python
from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass
class ConversationTurn:
    role: str  # "user" | "assistant" | "tool"
    content: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class ConversationMemory:
    max_turns: int = 20
    turns: list[ConversationTurn] = field(default_factory=list)

    def add_turn(self, role: str, content: str) -> None:
        self.turns.append(ConversationTurn(role=role, content=content))
        if len(self.turns) > self.max_turns:
            self.turns = self.turns[-self.max_turns:]

    def to_messages(self) -> list[dict]:
        return [{"role": t.role, "content": t.content} for t in self.turns]

    def clear(self) -> None:
        self.turns.clear()
```

- [ ] **Update `CortexAgent` in `cortex/sdk/agent.py` to use `ConversationMemory`**

Add `memory: ConversationMemory` field to `CortexAgent.__init__`. After each `agent_step` call in `run_task`, store the user input and assistant output in memory. Add a `chat()` method that appends to memory and calls `run_task`.

- [ ] **Add `memory` integration to `agent_step` in `cortex/sdk/llm.py`**

Add optional `memory: ConversationMemory | None = None` parameter. If provided, prepend memory turns to the messages list before the current user/system prompt.

### Task 5: Create PDF generation for project-spec

**Files:**
- Create: `scripts/generate-spec-pdf.py`
- Result: `docs/submission/project-spec.pdf`

- [ ] **Create `scripts/generate-spec-pdf.py`**

A Python script that:
1. Reads `docs/submission/project-spec.md`
2. Converts markdown to styled HTML using a template
3. Renders HTML to PDF using `weasyprint` (or `playwright` or `pdfkit`)

### Task 6: Create demo video recording script

**Files:**
- Create: `scripts/record-demo.py`

- [ ] **Create `scripts/record-demo.py`**

A helper script that:
1. Launches the full demo pipeline (broker → nodes → seed → agents → console)
2. Optionally records the console window to a video file using `ffmpeg` screen capture
3. Exports timing logs and GPU metrics alongside the recording

### Task 7: Add quantization support

**Files:**
- Create: `docs/submission/quantization.md`
- Modify: `pyproject.toml` (optional deps)

- [ ] **Create quantization documentation and optional dependencies**

Document how to use GPTQ/AWQ quantized Llama-3 models with vLLM on ROCm. Add `auto-gptq` or `optimum` to optional deps.
