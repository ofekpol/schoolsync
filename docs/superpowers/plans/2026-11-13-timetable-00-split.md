# timeTable: how the work is split

Spec: `docs/superpowers/specs/2026-11-13-timetable-design.md`

Two people, two tracks. Each plan is its own branch from `staging` and its own PR.

## Plans

| # | Plan | Track | Branch | Starts when | State |
|---|------|-------|--------|-------------|-------|
| 1 | Service selection | A | `feature/service-selection` | now | detailed: `2026-11-13-timetable-01-service-selection.md` |
| 2 | Profile categories | B | `feature/profile-categories` | now | detailed: `2026-11-13-timetable-02-profile-categories.md` |
| 3 | Solver spike (throwaway) | B | `spike/timetable-solver` | Kfar Galim's data file arrives | detailed: `2026-11-13-timetable-03-solver-spike.md` |
| 4 | Solver contract + service | B | `feature/timetable-solver` | plan 3 decided the host | outline below |
| 5 | timeTable setup data | A | `feature/timetable-setup` | plan 1 merged | outline below |
| 6 | Teacher constraints + deadline | A | `feature/timetable-collect` | plan 5 merged, plan 2 merged | outline below |
| 7 | Generate + compare options | B | `feature/timetable-generate` | plans 4 and 5 merged | outline below |
| 8 | Edit by hand, publish, teacher view | A | `feature/timetable-edit` | plan 7 merged | outline below |

**Track A = Ofek. Track B = Maor** (start from `2026-11-13-timetable-TRACK-B-handoff.md`).

Track A is the app side (platform, data entry, screens). Track B is profiles first, then the
solver. Track B does plan 2 while waiting for the school's data file.

Plans 4 to 8 are outlines on purpose: their exact tasks depend on the spike's result and on the
code plans 1 and 2 produce. Each gets a detailed plan when its "starts when" is met.

## Rules that keep the two tracks from colliding

1. **Migration numbers are reserved.** 0021 = plan 1. 0022 = plan 2. 0023 = plan 5.
   0024 = plan 6. 0025 = plan 7. Never renumber; if a plan needs a second migration, take the
   next free number after 0025 and say so in the PR.
2. **Plan 1 merges before plan 2's Task 5.** Both touch `lib/nav.ts` and the staff/admin
   layouts. Plan 1 extracts the shared `StaffShell`; plan 2 adds its profile gate there.
   Plan 2 Tasks 1 to 4 touch no file plan 1 touches.
3. **Schema files are separate.** Plan 1 edits `lib/db/schema.ts` (one column). Plan 2 owns
   `lib/db/schema-profile.ts`. Track A owns `lib/db/schema-timetable.ts`; plan 7 adds the run
   and solution tables to it only after plan 5 is merged.
4. **Messages.** Plan 1 owns keys `nav.timetable`, `platform.schools.services.*`,
   `timetable.shell.*`. Plan 2 owns `nav.categories`, `profile.*`, `admin.categories.*`,
   `admin.staff.labels.*`. Add keys at the end of their namespace to keep merges trivial.
5. **The solver contract is frozen first.** Plan 4's first task is the JSON contract
   (`lib/timetable/solver-contract.ts`, Zod, plus `solver/fixtures/tiny.json`). It is reviewed
   by both people and merged alone. After that, track A builds data that exports to it and
   track B builds the solver that reads it, without talking.
6. Project rules apply everywhere: no direct commits to `main`, merge commits only after all
   checks are green, `pnpm build` passes, no worktrees.

## Outlines of plans 4 to 8

### Plan 4: solver contract + service (track B)
- Contract: `SolverInput` (week, classes, teachers, blocks, constraints, pinned placements,
  weight profile), `SolverOutput` (placements, violations, status), `mode: solve | evaluate`.
- `solver/`: CP-SAT model, one encoder per constraint type in `solver/constraints/<type>.py`,
  pytest with one test per type, the tiny fixture as a golden test.
- User "hard" constraints carry a very large penalty so a result always returns.
- Packaging for the host the spike picked.
- Done when: the fixture solves; each MVP constraint type has a passing test; `evaluate`
  reports the same violations the solver would.

### Plan 5: timeTable setup data (track A)
- Migration 0023: `tt_school_settings`, `tt_boards`, `tt_classes`, `tt_subjects`,
  `tt_teachers`, `tt_lesson_blocks`, `tt_block_classes`, `tt_block_teachers`.
- Default week on `/platform/schools`; board creation copies it.
- Setup tabs: Classes, Subjects, Teachers (paste a column of names, add from staff by label),
  Lessons grid, Plata builder.
- `exportSolverInput(boardId)` producing the plan 4 contract.
- Done when: a principal can enter a 250-teacher school by keyboard and the export validates
  against the contract.

### Plan 6: teacher constraints + deadline (track A)
- Migration 0024: `tt_constraints`. Constraint type registry in `lib/timetable/constraints/`.
- Board status `collecting`, deadline, share link, who answered, fill in for a teacher.
- `/timetable/me` before the deadline (free day).
- Management constraints, aimed at a teacher, class, grade, subject or profile label.
- Done when: constraints appear in `exportSolverInput` and a teacher cannot edit after the deadline.

### Plan 7: generate + compare (track B)
- Migration 0025: `tt_runs`, `tt_solutions`, `tt_placements`.
- `lib/timetable/solver-client.ts`, run lifecycle, polling.
- Generate screen and three options side by side with broken constraints.
- Done when: a run on the staging demo board produces three stored options.

### Plan 8: edit, publish, teacher view (track A)
- Grid by class and by teacher; drag with instant double-booking checks; full report via
  `evaluate`; pin and regenerate.
- Publish; `/timetable/me` after publishing; print styles.
- Done when: the principal flow and the teacher flow each pass an e2e test.
