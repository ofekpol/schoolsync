import pytest

from api.solve import MAX_SOLVE_SECONDS, authorized, clamp_request


def test_token_required_when_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SOLVER_TOKEN", "s3cret")
    assert authorized("Bearer s3cret")
    assert not authorized("Bearer nope")
    assert not authorized(None)


def test_no_token_open_on_preview_closed_on_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SOLVER_TOKEN", raising=False)
    monkeypatch.setenv("VERCEL_ENV", "preview")
    assert authorized(None)
    monkeypatch.setenv("VERCEL_ENV", "production")
    assert not authorized(None)


def test_clamp_bounds_time_and_workers() -> None:
    data: dict[str, object] = {"timeLimitSeconds": 10**9}
    assert clamp_request(data, "-3") is None
    assert data["timeLimitSeconds"] == MAX_SOLVE_SECONDS
    data = {"timeLimitSeconds": 0}
    assert clamp_request(data, "100000") is not None
    assert data["timeLimitSeconds"] == 1
