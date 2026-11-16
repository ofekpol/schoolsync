"""python solver/bench/run.py <input.json> --limit 60 [--workers N]

Runs the solver in a subprocess; prints and appends one JSON result line.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import psutil

ROOT = Path(__file__).resolve().parents[2]
RESULTS = Path(__file__).parent / "results.jsonl"
POLL_SECONDS = 0.2


def peak_rss_mb(proc: subprocess.Popen[bytes]) -> float:
    peak = 0
    while proc.poll() is None:
        try:
            ps = psutil.Process(proc.pid)
            peak = max(peak, ps.memory_info().rss + sum(c.memory_info().rss for c in ps.children(recursive=True)))
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass  # child exiting; the caller waits on it
        time.sleep(POLL_SECONDS)
    return peak / 1024 / 1024


def run(src: Path, limit: int, workers: int | None) -> dict[str, object]:
    data = json.loads(src.read_text(encoding="utf-8"))
    data["timeLimitSeconds"] = limit
    with tempfile.TemporaryDirectory() as tmp:
        in_path, out_path = Path(tmp, "in.json"), Path(tmp, "out.json")
        in_path.write_text(json.dumps(data), encoding="utf-8")
        cmd = [sys.executable, "-m", "solver.cli", str(in_path), str(out_path)]
        if workers:
            cmd += ["--workers", str(workers)]
        start = time.perf_counter()
        proc = subprocess.Popen(cmd, cwd=ROOT)
        peak = peak_rss_mb(proc)
        proc.wait()
        wall = time.perf_counter() - start
        if proc.returncode != 0 and not out_path.exists():
            raise RuntimeError(f"solver exited {proc.returncode} without output")
        out = json.loads(out_path.read_text(encoding="utf-8"))
    unplaced = sum(v["count"] for v in out["violations"] if v["type"] == "unplaced")
    return {
        "input": src.stem, "limit": limit, "workers": workers or "default",
        "wallSeconds": round(wall, 1), "status": out.get("solverStatus", out["status"]),
        "peakRssMb": round(peak), "unplaced": unplaced,
        "teachers": len(data["teacherIds"]), "blocks": len(data["blocks"]),
        "lessons": sum(b["weeklyPeriods"] for b in data["blocks"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("src", type=Path)
    parser.add_argument("--limit", type=int, default=60)
    parser.add_argument("--workers", type=int, default=None)
    args = parser.parse_args()
    result = run(args.src, args.limit, args.workers)
    line = json.dumps(result)
    print(line)
    with RESULTS.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


if __name__ == "__main__":
    main()
