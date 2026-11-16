"""Vercel Python function: POST a SolverInput, get a SolverOutput.

Benchmark spike (plan 4, task 1). Timing and peak memory come back in headers.
"""
from __future__ import annotations

import hmac
import json
import os
import time
from http.server import BaseHTTPRequestHandler

from solver.model import solve

MAX_BODY_BYTES = 4_500_000  # Vercel's request body limit
MAX_SOLVE_SECONDS = 280  # maxDuration 300 minus room to serialise the answer
BAD_INPUT = (ValueError, KeyError, TypeError, AttributeError, IndexError)


def authorized(header: str | None) -> bool:
    token = os.environ.get("SOLVER_TOKEN")
    if token:
        return hmac.compare_digest(header or "", f"Bearer {token}")
    # shortcut: no token = open on previews (they sit behind Vercel Authentication); set SOLVER_TOKEN before production.
    return os.environ.get("VERCEL_ENV") != "production"


def clamp_request(data: dict[str, object], workers_header: str | None) -> int | None:
    """Bounds caller-controlled compute; returns the worker count to use."""
    limit = int(data["timeLimitSeconds"])  # type: ignore[call-overload]
    data["timeLimitSeconds"] = min(max(limit, 1), MAX_SOLVE_SECONDS)
    workers = int(workers_header or 0)
    return min(workers, os.cpu_count() or 1) if workers > 0 else None


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict[str, object], extra: dict[str, str] | None = None) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler API)
        import resource  # Linux only; imported here so tests run on Windows

        if not authorized(self.headers.get("Authorization")):
            return self._send(401, {"error": "unauthorized"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if length <= 0 or length > MAX_BODY_BYTES:
            return self._send(413, {"error": "bad_body_size"})
        try:
            data = json.loads(self.rfile.read(length))
            workers = clamp_request(data, self.headers.get("X-Workers"))
            start = time.perf_counter()
            out = solve(data, workers)
        except BAD_INPUT as exc:
            return self._send(400, {"error": f"{type(exc).__name__}: {exc}"})
        peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024  # KiB on Linux; lifetime peak
        self._send(200, out, {
            "X-Solve-Seconds": f"{time.perf_counter() - start:.1f}",
            "X-Peak-Rss-Mb": str(peak_mb),
            "X-Cpu-Count": str(os.cpu_count()),
        })
