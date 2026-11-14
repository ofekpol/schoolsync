"""Vercel Python function: POST a SolverInput, get a SolverOutput.

Benchmark spike (plan 4, task 1). Timing and peak memory come back in headers.
"""
from __future__ import annotations

import json
import os
import resource
import time
from http.server import BaseHTTPRequestHandler

from solver.model import solve

MAX_BODY_BYTES = 4_500_000  # Vercel's request body limit


def _authorized(header: str | None) -> bool:
    token = os.environ.get("SOLVER_TOKEN")
    if token:
        return header == f"Bearer {token}"
    return os.environ.get("VERCEL_ENV") != "production"  # no token: previews only


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
        if not _authorized(self.headers.get("Authorization")):
            return self._send(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            return self._send(413, {"error": "bad_body_size"})
        try:
            data = json.loads(self.rfile.read(length))
            workers = int(self.headers.get("X-Workers") or 0) or None
            start = time.perf_counter()
            out = solve(data, workers)
        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            return self._send(400, {"error": f"{type(exc).__name__}: {exc}"})
        peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024  # Linux: KiB
        self._send(200, out, {
            "X-Solve-Seconds": f"{time.perf_counter() - start:.1f}",
            "X-Peak-Rss-Mb": str(peak_mb),
            "X-Cpu-Count": str(os.cpu_count()),
        })
