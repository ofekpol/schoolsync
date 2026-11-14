"""Minimal CP-SAT timetable model: built-in rules only.

Not handled yet (later in plan 4): `consecutive`, user constraints, pinned
placements, `mode: evaluate`, weight profiles.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from ortools.sat.python import cp_model

Slot = tuple[int, int]  # (day, period)


def _slots(week: dict[str, Any]) -> list[Slot]:
    return [(d["day"], p["period"]) for d in week["days"] for p in d["periods"]]


def _failed(error: str) -> dict[str, Any]:
    return {"version": 1, "status": "failed", "error": error, "score": 0, "placements": [], "violations": []}


def _add_at_most_one(model: cp_model.CpModel, x: dict[tuple[int, Slot], Any],
                     members: dict[str, list[int]], slots: list[Slot]) -> None:
    """Each entity (teacher or class) is in at most one block per slot."""
    for block_idx in members.values():
        if len(block_idx) < 2:
            continue
        for slot in slots:
            model.add_at_most_one(x[b, slot] for b in block_idx)


def _build(data: dict[str, Any], slots: list[Slot]) -> tuple[cp_model.CpModel, dict[tuple[int, Slot], Any], list[Any]]:
    model = cp_model.CpModel()
    blocks = data["blocks"]
    x = {(b, s): model.new_bool_var(f"x{b}_{s[0]}_{s[1]}") for b in range(len(blocks)) for s in slots}
    unplaced = []
    by_teacher: dict[str, list[int]] = defaultdict(list)
    by_class: dict[str, list[int]] = defaultdict(list)
    for b, block in enumerate(blocks):
        short = model.new_int_var(0, block["weeklyPeriods"], f"u{b}")
        model.add(sum(x[b, s] for s in slots) + short == block["weeklyPeriods"])
        unplaced.append(short)
        for t in block["teacherIds"]:
            by_teacher[t].append(b)
        for c in block["classIds"]:
            by_class[c].append(b)
    _add_at_most_one(model, x, by_teacher, slots)
    _add_at_most_one(model, x, by_class, slots)
    model.minimize(sum(unplaced))
    return model, x, unplaced


def solve(data: dict[str, Any], workers: int | None = None) -> dict[str, Any]:
    """Solve a SolverInput (parsed JSON) and return a SolverOutput dict."""
    slots = _slots(data["week"])
    model, x, unplaced = _build(data, slots)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(data["timeLimitSeconds"])
    if workers:
        solver.parameters.num_workers = workers
    status = solver.solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return _failed(solver.status_name(status))
    blocks = data["blocks"]
    placements = [
        {"blockId": blocks[b]["id"], "day": s[0], "period": s[1]}
        for (b, s), var in x.items() if solver.value(var)
    ]
    total = sum(solver.value(u) for u in unplaced)
    violations = []
    if total:
        short = [blocks[b] for b, u in enumerate(unplaced) if solver.value(u)]
        violations.append({
            "constraintId": None, "type": "unplaced", "hard": True, "count": total,
            "teacherIds": sorted({t for blk in short for t in blk["teacherIds"]}),
            "classIds": sorted({c for blk in short for c in blk["classIds"]}),
        })
    return {"version": 1, "status": "ok", "score": -float(total), "placements": placements,
            "violations": violations, "solverStatus": solver.status_name(status)}
