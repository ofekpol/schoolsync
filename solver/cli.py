"""python -m solver.cli <in.json> <out.json> [--workers N]"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from solver.model import _failed, solve


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("dst")
    parser.add_argument("--workers", type=int, default=None)
    args = parser.parse_args(argv)
    try:
        data = json.loads(Path(args.src).read_text(encoding="utf-8"))
        out = solve(data, args.workers)
    except (json.JSONDecodeError, KeyError, OSError) as exc:
        Path(args.dst).write_text(json.dumps(_failed(f"{type(exc).__name__}: {exc}")), encoding="utf-8")
        return 1
    Path(args.dst).write_text(json.dumps(out), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
