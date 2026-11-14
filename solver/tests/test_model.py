import json
from pathlib import Path

from solver.cli import main
from solver.model import solve

U = "00000000-0000-4000-8000-"


def uid(n: int) -> str:
    return f"{U}{n:012d}"


def week(periods_per_day: list[int]) -> dict:
    return {
        "days": [
            {
                "day": d,
                "periods": [{"period": p, "start": f"{7 + p:02d}:00", "end": f"{7 + p:02d}:45"} for p in range(1, n + 1)],
            }
            for d, n in enumerate(periods_per_day)
        ]
    }


def make(blocks: list[dict], periods: list[int], classes: int = 1, teachers: int = 1) -> dict:
    return {
        "version": 1, "mode": "solve", "profile": "balanced", "timeLimitSeconds": 10,
        "week": week(periods),
        "classIds": [uid(100 + i) for i in range(classes)],
        "teacherIds": [uid(200 + i) for i in range(teachers)],
        "blocks": blocks, "constraints": [], "placements": [],
    }


def block(n: int, periods: int, classes: list[str], teachers: list[str]) -> dict:
    return {"id": uid(n), "subjectId": None, "weeklyPeriods": periods,
            "classIds": classes, "teacherIds": teachers, "consecutive": False}


def test_block_without_classes_is_placed() -> None:
    out = solve(make([block(1, 2, [], [uid(200)])], [3]))
    assert out["status"] == "ok" and len(out["placements"]) == 2


def test_teacher_overbooked_reports_unplaced() -> None:
    t = uid(200)
    data = make([block(1, 3, [uid(100)], [t]), block(2, 3, [], [t])], [2, 2], teachers=1)
    out = solve(data)  # 4 slots, 6 wanted
    unplaced = [v for v in out["violations"] if v["type"] == "unplaced"]
    assert out["status"] == "ok" and unplaced[0]["count"] == 2 and len(out["placements"]) == 4


def test_short_friday_uses_week_slots() -> None:
    out = solve(make([block(1, 5, [], [uid(200)])], [3, 2]))
    assert len(out["placements"]) == 5
    assert all(p["period"] <= 2 for p in out["placements"] if p["day"] == 1)


def test_cli_bad_json_writes_failed_output(tmp_path: Path) -> None:
    src, dst = tmp_path / "in.json", tmp_path / "out.json"
    src.write_text("{nope", encoding="utf-8")
    assert main([str(src), str(dst)]) == 1
    assert json.loads(dst.read_text(encoding="utf-8"))["status"] == "failed"
