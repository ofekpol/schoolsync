# Solver Spike Plan (throwaway)

> A spike, not a feature: no TDD, no review process, nothing merged into `staging`. Its only
> product is one decision document. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide where the timeTable solver runs (a Vercel Python function or a small container) and confirm a 250-teacher school solves in acceptable time.

**Approach:** A minimal CP-SAT model in Python, run on a real school's data and on a synthetic 250-teacher school, timed locally and on both hosts.

**Tech Stack:** Python 3.12, `ortools` (CP-SAT). Check the current OR-Tools documentation for the CP-SAT API before writing the model; do not rely on memory for function names.

**Spec:** `docs/superpowers/specs/2026-11-13-timetable-design.md` (sections "Solver", "Risks")

**Branch:** `spike/timetable-solver`. Code lives in `spikes/timetable-solver/`. The branch is deleted after the result document is merged on its own.

## Constraints

- Kfar Galim's timetable arrives as a file from the school. Put it in `spikes/timetable-solver/data/`, which is gitignored. Never commit it, never paste its contents into a chat, never read it from the production database.
- Creating a Vercel project or a container host is done by a human, on the `edu-solutions` team, with no production secrets attached.
- No app code changes.

## Pass criteria

| Question | Pass |
|---|---|
| Three options for the 250-teacher school | all three within 5 minutes of wall time in total |
| Every lesson placed with no teacher or class double-booked | always |
| Free-day requests honored | at least 95% when a feasible assignment exists |
| Host limits | the run fits the host's maximum duration, memory and package size with at least 2x headroom |

---

### Step group 1: data

- [ ] Write `gitignore` entry for `spikes/timetable-solver/data/`.
- [ ] `synth.py`: generate a school as JSON: 6 grades x 8 classes, 250 teachers, 6 days (Sunday to Thursday 8 periods, Friday 5), about 38 weekly periods per class, one Plata per grade for math and for English (6 of the 8 classes in it, 2 out), each teacher teaching 18 to 26 periods and asking for one free day with a realistic skew (many asking for Friday or Sunday). Seeded, so runs repeat.
- [ ] `convert_real.py`: turn the school's file into the same JSON shape. Write down every place where the real timetable does not fit the shape (lesson block = one subject, weekly periods, a set of classes, a set of teachers). **This list is a finding**, not a nuisance.

### Step group 2: model

- [ ] `solve.py`: read the JSON, build the model, print placements, timing and violations.
  - Each block needs `weekly_periods` distinct slots.
  - A teacher is in at most one block per slot; a class is in at most one block per slot.
  - Free day: a penalty for each lesson on the teacher's requested day, weighted far above everything else.
  - Class gaps: a penalty for an empty period between two lessons of a class on one day.
  - Teacher gaps: a smaller penalty of the same kind.
  - Three weight profiles: teachers first, classes first, balanced.
- [ ] Run the synthetic school with time limits of 60, 120 and 300 seconds and with 2, 4 and 8 workers. Record time to first full placement, final objective, and violations.
- [ ] Run the real school. Compare the result with the timetable the school uses today: count free days honored and gaps, in both.

### Step group 3: hosting

- [ ] Read the current Vercel documentation for Python functions on the team's plan: maximum duration, memory, CPU count, bundle size. Record the numbers and the date read.
- [ ] Host A: deploy `solve.py` behind one HTTP handler as a Vercel Python function in a separate project rooted at `spikes/timetable-solver/`. Record deployed size, cold start, and wall time for the synthetic school.
- [ ] Host B: the same handler in a container, run locally with 2 CPUs and 2 GB of memory to imitate a small paid instance. Record wall time.
- [ ] Decide how three options run on each host: three parallel calls, or one call running them in sequence.

### Step group 4: the result

- [ ] Write `docs/superpowers/specs/<date>-solver-spike-result.md`:
  - the measured table for both hosts against the pass criteria
  - the chosen host and why, with the monthly cost
  - what in the real data did not fit the lesson-block shape, and the proposed change to the spec's data model for each
  - constraint types the real timetable clearly relies on (candidates for the MVP list)
  - anything that would change the solver contract in plan 4
- [ ] Open a PR with only that document. Delete the spike's Vercel project and branch after it merges.

## If it fails

- Too slow at 250 teachers: try solving grade bands separately with shared teachers pinned, and record the result. If still too slow, stop and bring the numbers back before plan 4 starts.
- Vercel limits too tight: the container is the answer; record the cheapest host that passes.
