# timeTable plan 4, task 1: solver benchmark and host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure a minimal CP-SAT solver on a 250-teacher synthetic input and the staging Kfar Galim board, then decide where it runs (Vercel Python function or a small container).

**Architecture:** `solver/` is a Python package that reads `SolverInput` JSON and writes `SolverOutput` JSON. The model has one boolean per (lesson block, slot), a teacher-at-most-once and class-at-most-once constraint per slot, and a per-block "unplaced" slack minimised so a result always returns. A TS script writes the two benchmark inputs to a git-ignored folder; a Python script runs the solver as a subprocess and records wall time, status, peak RSS and unplaced count.

**Tech Stack:** Python 3.13 (venv in `solver/.venv`), `ortools`, `pytest`, `psutil` (bench only); TS via `tsx` (already a devDependency).

**Spec:** `docs/superpowers/specs/2026-11-13-timetable-design.md` (addendum of 2026-11-14); outline in `docs/superpowers/plans/2026-11-13-timetable-00-split.md`, "Plan 4".

## Global Constraints

- Contract is `lib/timetable/solver-contract.ts` version 1; not changed here. Output `placements` omit `pinned`; `violations[].constraintId` is null for built-ins `teacher_clash`, `class_clash`, `unplaced`.
- Python: type hints, dataclasses, no bare `except`, functions < 50 lines, files < 400 lines.
- No dependency added to `package.json`. Python deps pinned in `solver/requirements.txt`. Venv at `solver/.venv`, git-ignored; nothing global.
- Staging only, via `.env.staging.local` (loaded by the user). Never print secrets, tokens, names or ids of real people. Production is never read.
- Benchmark files that could hold real ids live in `solver/bench/` (git-ignored). Only `solver/bench/.gitkeep`-free code and the numbers are committed.
- Branch `feature/timetable-solver` from `staging`. No worktrees. No Vercel production change; preview only. Ask before any payment.
- Files owned by Track B (`lib/timetable/constraints/`, `components/**/setup/`, etc.) are not touched.

## Review Focus

- A block with `teacherIds: []` or `classIds: []` (a meeting has no classes): must still place, not crash or be skipped.
- A block whose `weeklyPeriods` exceeds the free slots of one of its teachers: must return `unplaced > 0` with status `ok`, not infeasible.
- Input with a week whose days have different period counts (Friday 5): slots must come from the week, not a rectangle.
- Time limit hit before optimal: status still `ok` with best found placements.
- Malformed input JSON: exit non-zero and emit `status: "failed"` with an `error`.

## File Structure

- Create `solver/model.py` (build + solve, ~120 lines), `solver/cli.py` (read/write JSON, `python -m solver.cli in out`), `solver/__init__.py`.
- Create `solver/tests/test_tiny.py`; extra tests in `solver/tests/test_model.py` for the Review Focus cases.
- Create `solver/requirements.txt` (runtime: `ortools`), `solver/requirements-dev.txt` (`-r requirements.txt`, `pytest`, `psutil`).
- Create `scripts/export-timetable-bench.ts` (writes `solver/bench/synthetic.json`, `solver/bench/kfar-galim.json`), `solver/bench/run.py` is committed; its outputs `solver/bench/*.json` are not.
- Modify `.gitignore` (`solver/.venv/`, `solver/bench/*.json`, `__pycache__/`).
- Create `api/solve.py` + `requirements.txt`-equivalent only on the throwaway preview branch step (Task 4); decided there whether any of it is kept.
- Modify spec (append section) and split doc (State column, migration rule).

---

### Task 1: Minimal solver, solves tiny.json

**Files:**
- Create: `solver/__init__.py`, `solver/model.py`, `solver/cli.py`, `solver/requirements.txt`, `solver/requirements-dev.txt`, `solver/tests/test_tiny.py`, `solver/tests/test_model.py`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `solver.model.solve(data: dict, workers: int | None = None) -> dict` taking a parsed `SolverInput` and returning a `SolverOutput` dict; `solver.cli.main(argv: list[str]) -> int` (`python -m solver.cli <in.json> <out.json> [--workers N]`).

- [ ] **Step 1: Create the venv and pin deps.** `python -m venv solver/.venv`, install `ortools pytest psutil`, write the exact installed versions to the two requirements files (`pip freeze` filtered to those packages and their direct pins). Add the ignores to `.gitignore`.
- [ ] **Step 2: Write failing tests.** `test_tiny.py::test_tiny_fixture_is_fully_placed` loads `solver/fixtures/tiny.json`, calls `solve`, asserts `status == "ok"`, every block has `weeklyPeriods` placements, no two placements share a (teacher, day, period) or (class, day, period), and `violations` has no `unplaced` entry with `count > 0`. `test_model.py`: `test_block_without_classes_is_placed`, `test_teacher_overbooked_reports_unplaced` (two blocks with one teacher needing more periods than the week has; asserts `unplaced.count == shortfall`, status `ok`), `test_short_friday_uses_week_slots` (a week with a 2-period day; no placement uses period 3 there), `test_cli_bad_json_writes_failed_output`.
- [ ] **Step 3: Run `solver/.venv/Scripts/python -m pytest solver` and confirm the tests fail** (module missing).
- [ ] **Step 4: Implement `solve`.** Slots = every (day, period) in `data["week"]`. `x[b, s]` BoolVar per block and slot; `placed_b + unplaced_b == weeklyPeriods` with `unplaced_b` an IntVar; per teacher and per class, per slot, `sum(x) <= 1` over blocks containing them; minimise `sum(unplaced_b)`; `max_time_in_seconds = timeLimitSeconds`, `num_workers = workers` if given. Output one placement per set `x`, one `unplaced` violation (constraintId null, hard true, count = total, with the affected teacher/class ids) when total > 0, `score = -total_unplaced`. `consecutive`, `constraints`, `placements` (pinned) and `mode: evaluate` are ignored here (later in plan 4); a comment says so.
- [ ] **Step 5: Implement `cli.main`.** Read input, call `solve`, write output; on `json.JSONDecodeError` or `KeyError` write `{version:1,status:"failed",error,score:0,placements:[],violations:[]}` and return 1.
- [ ] **Step 6: Run the tests, all green.**
- [ ] **Step 7: Commit** `feat: minimal CP-SAT timetable solver`.

### Task 2: Benchmark inputs and runner

**Files:**
- Create: `scripts/export-timetable-bench.ts`, `solver/bench/run.py`
- Modify: `package.json` is NOT touched; the script is run with `npx tsx --conditions=react-server scripts/export-timetable-bench.ts <synthetic|kfar-galim>`.

**Interfaces:**
- Consumes: `generateDemoPlan({staff, classCounts, seed, anonymize})` and `DEMO_CURRICULUM` from `lib/timetable/demo/`, `DEFAULT_WEEK` from `lib/timetable/week.ts`, `buildSolverInput(schoolId, boardId)`, `SolverInputSchema`.
- Produces: `solver/bench/synthetic.json`, `solver/bench/kfar-galim.json` (both valid `SolverInput`); `python solver/bench/run.py <input.json> --limit 60 --workers N` printing one JSON line `{input, limit, workers, wallSeconds, status, peakRssMb, unplaced, teachers, blocks}` and appending it to `solver/bench/results.jsonl` (ignored).

- [ ] **Step 1: Write the `synthetic` mode.** `generateDemoPlan` with `staff: []`, `classCounts` 6 grades x 8 classes, fixed seed, anonymize true; map keys (class `grade-number`, teacher `key`, subject name, block index) to deterministic UUIDs; validate with `SolverInputSchema.parse`; write file. Print only counts (teachers, classes, blocks, lesson total). If the generator yields far from 250 teachers, tune grade count or subject count in the script until it is within 10 percent and record how.
- [ ] **Step 2: Write the `kfar-galim` mode.** Load `.env.staging.local` the way `scripts/seed-timetable-demo.ts` does, call `assertSeedTargetAllowed`, look up the school by slug and the board named `הדגמה`, call `buildSolverInput`, write file, print counts only (expect 109 teachers, 744 blocks) plus the number of `problems`. Abort if the database is not the staging project.
- [ ] **Step 3: Write `solver/bench/run.py`.** Runs `python -m solver.cli` as a subprocess with the limit patched into the input copy, polls `psutil` RSS (including children) every 0.2 s for the peak, times wall clock, reads the output for status and the unplaced count.
- [ ] **Step 4: Smoke-run both against `tiny.json` (and the synthetic file) with a 5 s limit.** Expected: one JSON result line each.
- [ ] **Step 5: Commit** `chore: timetable benchmark inputs and runner`.

### Task 3: Run the benchmarks

**Files:** Create `solver/bench/results.jsonl` (ignored); numbers go to the spec in Task 5.

- [ ] **Step 1: Record the machine** (CPU model, logical cores, RAM) with one command.
- [ ] **Step 2: Run synthetic and Kfar Galim at 60 s and 300 s, with default workers and with `--workers 1`** (8 runs, about 22 minutes, in the background).
- [ ] **Step 3: Collect the table:** input, limit, workers, wall time, status, peak RSS, unplaced. Note whether the solver proved optimal (status OPTIMAL) or stopped at the limit (FEASIBLE).

### Task 4: Hosting decision

**Files:** a throwaway `api/solve.py` on the branch (kept only if it ships a useful proof).

- [ ] **Step 1: Read Vercel's current docs** (via the Vercel docs search tool or the docs site) for Python functions: max duration and memory on Hobby (with and without Fluid Compute), vCPU, bundle size limit, supported Python version, and OR-Tools wheel size (PyPI) plus its dependencies (numpy, pandas, protobuf, absl). Quote each number with its source URL.
- [ ] **Step 2: Add `api/solve.py`** (a handler that takes a `SolverInput` body and returns the `SolverOutput`, importing `solver.model`) and a Python requirements file Vercel picks up; push the branch so a preview deploys (preview builds are what the project does for non-main branches; no production deploy).
- [ ] **Step 3: Call the preview** with `tiny.json`, then with the Kfar Galim input at the time limit the benchmark showed is needed (preview is behind Vercel login: use a bypass secret only if the user supplies it; otherwise the logged-in browser pane). Record cold-start time, solve time, memory reported in the function logs, any build or size failure.
- [ ] **Step 4: Apply the rule:** stay on Vercel if a Kfar Galim-size solve fits with 2x headroom on duration and memory (needed time at 1 vCPU <= half the max duration; peak RSS <= half the memory limit; bundle <= half the limit). Otherwise recommend one named small container host with its monthly price (read from the provider's pricing page), and stop for the user's decision before paying anything.
- [ ] **Step 5: Commit** whatever is kept (`api/solve.py` only if staying on Vercel).

### Task 5: Spec section, split doc, PR

**Files:**
- Modify: `docs/superpowers/specs/2026-11-13-timetable-design.md` (append "Solver benchmark and host, 2026-11-<dd>": numbers table, host decision, cost)
- Modify: `docs/superpowers/plans/2026-11-13-timetable-00-split.md`

- [ ] **Step 1: Append the spec section** with the machine, the Task 3 table, the Vercel limits with sources, the preview result, the decision and its monthly cost, and the caveat that synthetic data shows speed, not rule fit.
- [ ] **Step 2: Fix the split doc:** plan 5a State becomes "**merged into `staging`**"; plan 2 Task 5 row becomes merged (PR #99); migration rule 1 becomes "0021 plan 1, 0022 plan 2, 0023 plan 5a, 0024 `timetable_deferred_fks` (used); plan 6 takes 0025, plan 7 0026, later plans the next free number"; update the matching lines in the Plan 6 and Plan 7 outlines ("Migration 0024" -> 0025, "Migration 0025" -> 0026).
- [ ] **Step 3: Run `pnpm lint`, `pnpm tsc`, `pnpm test:unit`, and `solver/.venv/Scripts/python -m pytest solver`.** Expected: all pass.
- [ ] **Step 4: Open the PR into `staging`** (no merge by me), bind it, confirm CI green ("Lint, Typecheck", "Unit + integration tests", "Build, E2E"). CI does not run pytest yet; adding a job is left for the solver plan proper.

## Not in this task

Constraint encoders, `consecutive`, `evaluate` mode, pinned placements, the weight profiles, the solver client in the app, and authentication on the solver endpoint (the preview function is behind Vercel login; a production endpoint needs its own token check).

## Risks

- The generator may not reach 250 teachers with 48 classes; the script tunes it and records the real counts.
- A Hobby preview may not honour the same limits as a production Hobby deployment; stated in the spec if it matters.
- The CP-SAT model with 744 blocks x 45 slots may find only a feasible, not optimal, result at 60 s; that is a result, not a failure.
