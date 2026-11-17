from solver.tests.test_model import block, make, uid
from solver.model import solve


def test_repeated_teacher_id_in_block_still_places() -> None:
    out = solve(make([block(1, 2, [uid(100)], [uid(200), uid(200)])], [3]))
    assert len(out["placements"]) == 2
