#!/usr/bin/env python3
"""Record the demo pipeline for hackathon submission video.

Launches the full Perciqa Cortex demo, records GPU metrics, and
optionally captures screen video via ffmpeg.

Usage:
    python scripts/record-demo.py [--output-dir docs/submission] [--record-video]

Requires: ffmpeg (for video recording)
"""
import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


async def run_demo_and_record(
    output_dir: Path,
    record_video: bool = False,
    reasoner: str = "scripted",
    vllm_url: str = "http://localhost:8000/v1",
) -> dict:
    """Run the demo pipeline, capture metrics, optionally record video."""
    import contextlib

    from scenarios.soc_consortium.demo_run import run_demo

    metrics_log: list[dict] = []

    def _capture_gpu_metrics():
        """Capture GPU metrics using rocm-smi or fallback."""
        try:
            result = subprocess.run(
                ["rocm-smi", "--showmeminfo", "vram", "--json"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                return {"rocm_smi": data, "ts": datetime.now(UTC).isoformat()}
        except (FileNotFoundError, json.JSONDecodeError, subprocess.TimeoutExpired):
            pass
        try:
            import torch
            if torch.cuda.is_available():
                return {
                    "allocated_gb": torch.cuda.memory_allocated() / 1e9,
                    "reserved_gb": torch.cuda.memory_reserved() / 1e9,
                    "device_count": torch.cuda.device_count(),
                    "device_name": (
                        torch.cuda.get_device_name(0)
                        if torch.cuda.device_count() > 0 else "N/A"
                    ),
                    "ts": datetime.now(UTC).isoformat(),
                }
        except ImportError:
            pass
        return {
            "note": "GPU metrics unavailable (no ROCm/GPU)",
            "ts": datetime.now(UTC).isoformat(),
        }

    # Start metrics collection in background
    async def _metrics_collector():
        while True:
            await asyncio.sleep(2.0)
            metrics_log.append(_capture_gpu_metrics())

    collector_task = asyncio.create_task(_metrics_collector())

    # Collect timing markers
    timings: dict[str, float] = {}
    _start = time.monotonic()

    try:
        timings["demo_start"] = time.monotonic() - _start
        state = await run_demo(
            state_dir=output_dir,
            video_dir=output_dir,
            no_record=not record_video,
            reasoner=reasoner,
            vllm_url=vllm_url,
        )
        timings["demo_end"] = time.monotonic() - _start
    finally:
        collector_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await collector_task

    # Save metrics
    report = {
        "timestamp": datetime.now(UTC).isoformat(),
        "timings_sec": timings,
        "demo_duration_sec": timings.get("demo_end", 0) - timings.get("demo_start", 0),
        "gpu_metrics": metrics_log,
        "state": {k: v for k, v in state.items() if k != "alpha_result"},
    }
    report_path = output_dir / "demo-recording-report.json"
    report_path.write_text(json.dumps(report, indent=2))
    print(f"Recording report saved to {report_path}")
    return report


def launch_ffmpeg_screencast(
    output_path: Path, display: str | None = None
) -> subprocess.Popen | None:
    """Launch ffmpeg screen recording in background."""
    if not output_path.parent.exists():
        output_path.parent.mkdir(parents=True, exist_ok=True)

    if sys.platform == "darwin":
        # macOS: use avfoundation
        cmd = [
            "ffmpeg", "-y",
            "-f", "avfoundation",
            "-capture_cursor", "1",
            "-i", f"{display or '1'}:none",
            "-t", "300",
            "-vcodec", "h264_videotoolbox",
            "-pix_fmt", "yuv420p",
            str(output_path),
        ]
    else:
        # Linux: use x11grab
        disp = display or os.environ.get("DISPLAY", ":0")
        cmd = [
            "ffmpeg", "-y",
            "-f", "x11grab",
            "-draw_mouse", "1",
            "-video_size", "1920x1080",
            "-i", disp,
            "-t", "300",
            "-vcodec", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "ultrafast",
            str(output_path),
        ]

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"ffmpeg recording started (PID {proc.pid}) → {output_path}")
        return proc
    except FileNotFoundError:
        print("WARNING: ffmpeg not found. Install ffmpeg for video recording.", file=sys.stderr)
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Record Perciqa Cortex demo for hackathon submission")
    ap.add_argument("--output-dir", default=str(REPO / "docs" / "submission"),
                    help="Directory for recording output")
    ap.add_argument("--record-video", action="store_true",
                    help="Record screen video via ffmpeg")
    ap.add_argument("--display",
                    help="Display/input device for ffmpeg (default: auto-detect per platform)")
    ap.add_argument("--reasoner", choices=["scripted", "vllm"], default="scripted",
                    help="Agent reasoning backend")
    ap.add_argument("--vllm-url", default="http://localhost:8000/v1",
                    help="vLLM API endpoint")
    args = ap.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    video_proc = None
    if args.record_video:
        video_path = output_dir / "demo-recording.mp4"
        video_proc = launch_ffmpeg_screencast(video_path, args.display)
        # Brief delay to let ffmpeg initialize
        time.sleep(1.0)

    vllm_url = os.environ.get("VLLM_URL", args.vllm_url)

    try:
        report = asyncio.run(run_demo_and_record(
            output_dir=output_dir,
            record_video=args.record_video,
            reasoner=args.reasoner,
            vllm_url=vllm_url,
        ))
        duration = report.get("demo_duration_sec", 0)
        print(f"\nDemo completed in {duration:.1f}s")
        print(f"GPU metrics captured: {len(report.get('gpu_metrics', []))} samples")
        print(f"Report saved to {output_dir / 'demo-recording-report.json'}")
        print(f"Demo replay state: {output_dir / 'demo_state.json'}")
    finally:
        if video_proc is not None:
            video_proc.terminate()
            video_proc.wait()
            print("ffmpeg recording stopped")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
