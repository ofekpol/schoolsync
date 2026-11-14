import json
from pathlib import Path

from solver.model import solve

FIXTURE = Path(__file__).parent.parent / "fixtures" / "tiny.json"


def test_tiny_fixture_is_fully_placed() -> None:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    out = solve(data)
    assert out["status"] == "ok"
    blocks = {b["id"]: b for b in data["blocks"]}
    for block_id, block in blocks.items():
        assert sum(p["blockId"] == block_id for p in out["placements"]) == block["weeklyPeriods"]
    seen: set[tuple[str, str, int, int]] = set()
    for p in out["placements"]:
        block = blocks[p["blockId"]]
        for kind, ids in (("t", block["teacherIds"]), ("c", block["classIds"])):
            for entity in ids:
                key = (kind, entity, p["day"], p["period"])
                assert key not in seen
                seen.add(key)
    assert not any(v["type"] == "unplaced" and v["count"] > 0 for v in out["violations"])
