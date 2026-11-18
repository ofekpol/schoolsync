# timeTable plan 7: generate, compare three options, read-only grid

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On staging, the principal presses Generate on a board, waits, sees three timetables side by side with their score and broken constraints, and opens any one as a grid by class or by teacher.

**Architecture:** `POST /runs` stores a run with its solver input and returns at once. Inside the same request, `after()` (from `next/server`) calls `/api/solve` three times in parallel, once per weight profile, and writes three solutions with their placements. The browser polls `GET /runs/[run]`. The grid is a pure projection of the run's stored input plus the solution's placements, with names joined from the board's current tables.

**Tech Stack:** Next.js 15 route handlers (`after`, `maxDuration`), Drizzle + `withSchool`, Zod, next-intl, Vitest, the existing Python function `api/solve.py`.

**Spec:** `docs/superpowers/specs/2026-11-13-timetable-design.md` ("Solver", "Screens" 3, the addendum of 2026-11-14 and "Solver benchmark and host, 2026-11-16"). Split: `docs/superpowers/plans/2026-11-13-timetable-00-split.md`, plan 7.

Branch `feature/timetable-generate` from `staging`. Migration **0026**. Message namespace **`timetable.generate.*`** only. Files: `lib/timetable/` (not `constraints/`), `app/api/v1/timetable/boards/[board]/runs/**`, `components/timetable/generate/`, the generate pages.

## Global Constraints

- Contract v1 (`lib/timetable/solver-contract.ts`) is not changed by this plan. A change is its own PR (split rule 3).
- Every school-data query runs inside `withSchool(schoolId, fn)`; the new tables get `school_id` + the `school_isolation` policy, ENABLE and FORCE RLS, as in `0025_timetable_constraints.sql`.
- Never edit an existing migration. Add `0026_timetable_runs.sql` and its `db/migrations/meta/_journal.json` entry; append the Drizzle tables at the end of `lib/db/schema-timetable.ts`.
- Zod on every route's request and response. Admin only (`requireBoard`); writes refused for demo users (`requireBoard(true, ...)` already does it).
- All UI strings through `t()` in `timetable.generate.*`, `he.json` first, `en.json` mirrored. Logical CSS properties only (`start`/`end`). `lucide-react` icons. Functions < 50 lines, files < 400 lines, no `any`.
- No names leave the app: the solver gets the export as it is today (ids only).
- Generate does not change `tt_boards.status`. Publishing (`published`) and any `review` transition belong to plan 8.

## Decisions made here

| Topic | Decision |
|---|---|
| Where the three solves run | `after()` in the `POST /runs` route, `export const maxDuration = 300`. Three `fetch` calls to `/api/solve` in parallel (each its own function invocation). No queue, no cron. |
| Time limit per solve | `RUN_TIME_LIMIT_SECONDS = 60` (the export default). The benchmark solved 287 teachers in 22 s on the preview. |
| Solver URL | `SOLVER_URL` env when set, else `https://${VERCEL_URL}/api/solve` on Vercel. Locally `SOLVER_URL` must be set (for example to a preview); unset locally = the run fails with `solver_not_configured`. |
| Auth headers | `Authorization: Bearer ${SOLVER_TOKEN}` when set. `x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}` when set, because staging and previews sit behind Vercel Authentication and the server calls its own deployment URL. See Task 8, step 1. |
| What a run stores | `tt_runs.input` = the solver input with `profile` removed (jsonb, about 200 KB at Kfar Galim size). The grid reads blocks from it, so later edits to the setup tables do not break an old option. |
| Meeting blocks | A meeting's block id is its constraint id (plan 6 export). So `tt_placements.block_id` has **no foreign key**; it is read only against the run's stored input. |
| One active run | Starting a run locks the board row (`FOR UPDATE`) and refuses with 409 `run_in_progress` when a run is `queued`/`running` and younger than `RUN_STALE_MINUTES = 6`. Older ones are reported as `failed` with error `timed_out` (the function was killed). |
| Runs kept | `MAX_RUNS_PER_BOARD = 20`. Starting the 21st deletes the oldest run (cascade). Plan 8 will exempt the published one. |
| Board not ready | If `buildSolverInput` returns problems, `POST /runs` answers 422 `{ error: "input_problems", problems }` and stores nothing. |
| Per-profile failure | A profile whose call throws or returns `status: "failed"` is stored as a solution with `status: "failed"`, `error`, no placements. The run is `done` if at least one profile is `ok`, else `failed`. |
| Three alike options | The solver ignores `profile` until plan 4 adds weights and encoders, so the three options will be identical for now. The UI shows them anyway; nothing here works around it. |

## Review Focus

1. **A block or teacher deleted after the run.** Opening an old option must still render: a block missing from current names shows `t("removedSubject")` / a teacher missing shows `t("removedTeacher")`. Test in Task 5.
2. **The function is killed mid-run (300 s or a crash).** The run must not stay `running` forever and must not block the next Generate. Test in Task 3 (`staleRunIsFailedAndDoesNotBlock`).
3. **Double click on Generate / two tabs.** Only one run starts; the second gets 409. Test in Task 3 (`secondStartWhileRunningIsRefused`).
4. **Another school's run or solution id in the URL.** 404, never data. Tests in Tasks 1 (RLS) and 4 (route).
5. **Solver answers 401/413/500 or malformed JSON.** The profile is stored as failed with a readable error code, the other profiles still save. Tests in Tasks 2 and 3.

---

### Task 1: Migration 0026 and Drizzle tables

**Files:**
- Create: `db/migrations/0026_timetable_runs.sql`
- Modify: `db/migrations/meta/_journal.json` (append entry, same shape as 0025's)
- Modify: `lib/db/schema-timetable.ts` (append at the end)
- Test: `test/integration/timetable-runs-rls.test.ts`

**Interfaces:**
- Produces: Drizzle tables `ttRuns`, `ttSolutions`, `ttPlacements`; column `ttBoards.publishedSolutionId` (added in the SQL with `ALTER TABLE`; in Drizzle declare it on `ttBoards` as `uuid("published_solution_id")` with no `.references()` to avoid the circular import, and note why in one line).

Tables (all `school_id uuid NOT NULL` FK `schools` cascade, RLS as in 0025):
- `tt_runs`: `id` uuid PK, `board_id` FK `tt_boards` cascade, `status` text check `IN ('queued','running','done','failed')` default `'queued'`, `error` text null, `input` jsonb not null, `requested_by` FK `staff_users` set null, `created_at` default now(), `started_at` null, `finished_at` null. Index `(board_id, created_at)`.
- `tt_solutions`: `id` uuid PK, `run_id` FK `tt_runs` cascade, `board_id` FK `tt_boards` cascade, `profile` text check `IN ('teachers','classes','balanced')`, `status` text check `IN ('ok','failed')`, `error` text null, `score` double precision not null default 0, `violations` jsonb not null default `'[]'`, `created_at`. Unique `(run_id, profile)`.
- `tt_placements`: `solution_id` FK `tt_solutions` cascade, `block_id` uuid not null (no FK, see Decisions), `day` int check 0–6, `period` int check ≥ 1, `pinned` boolean not null default false. PK `(solution_id, block_id, day, period)`.
- `ALTER TABLE tt_boards ADD COLUMN published_solution_id uuid REFERENCES tt_solutions(id) ON DELETE SET NULL`.

- [ ] **Step 1: Write the failing RLS test** following `test/integration/timetable-rls.test.ts`: school A inserts a board, run, solution, placement; tests `ownSchoolReadsRuns`, `otherSchoolSeesNoRuns` (school B's `withSchool` select of each new table returns `[]`), `cannotWriteRunForOtherSchool` (insert with `schoolId: testSchoolB` inside A's `withSchool` rejects), `deletingBoardRemovesRuns` (count 0 in all three tables after board delete), `deletingSolutionClearsPublished` (board's `publishedSolutionId` becomes null).
- [ ] **Step 2: Run it, expect FAIL** — `pnpm test test/integration/timetable-runs-rls.test.ts` (table does not exist).
- [ ] **Step 3: Write the SQL, journal entry and Drizzle tables.**
- [ ] **Step 4: Apply and run** — `pnpm db:migrate` against the test DB, then the test: PASS. `pnpm tsc` clean.
- [ ] **Step 5: Commit** — `feat: timetable runs, solutions and placements tables (migration 0026)`.

### Task 2: Solver client

**Files:**
- Create: `lib/timetable/solver-client.ts`
- Test: `test/unit/timetable/solver-client.test.ts`

**Interfaces:**
- Consumes: `SolverInput`, `SolverOutput`, `SolverOutputSchema` from `solver-contract.ts`.
- Produces:
  - `export type SolverCallErrorCode = "solver_not_configured" | "solver_unreachable" | "solver_http_error" | "solver_bad_output"`
  - `export class SolverCallError extends Error { constructor(readonly code: SolverCallErrorCode, readonly status?: number) }`
  - `export function solverUrl(env?: NodeJS.ProcessEnv): string | null`
  - `export async function callSolver(input: SolverInput, env?: NodeJS.ProcessEnv): Promise<SolverOutput>`

`fetch` with `AbortSignal.timeout((input.timeLimitSeconds + 30) * 1000)`, body `JSON.stringify(input)`, headers from Decisions. Parse with `SolverOutputSchema` (it strips the solver's extra `solverStatus`).

- [ ] **Step 1: Write failing tests** (stub `fetch` with `vi.stubGlobal`):
  - `solverUrl` returns `SOLVER_URL` when set; `https://abc.vercel.app/api/solve` for `VERCEL_URL=abc.vercel.app`; `null` with neither.
  - sends `Authorization: Bearer t` only when `SOLVER_TOKEN=t`; sends `x-vercel-protection-bypass` only when `VERCEL_AUTOMATION_BYPASS_SECRET` is set.
  - 200 with a valid output resolves to it; 200 with `{ version: 2 }` rejects `solver_bad_output`; 401 rejects `solver_http_error` with `status: 401`; fetch throwing rejects `solver_unreachable`; no URL rejects `solver_not_configured` without calling fetch.
- [ ] **Step 2: Run, expect FAIL** — `pnpm test:unit test/unit/timetable/solver-client.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat: timetable solver client`.

### Task 3: Run lifecycle

**Files:**
- Create: `lib/timetable/runs.ts`
- Modify: `lib/timetable/errors.ts` (add codes `run_in_progress`, `input_problems`) and `lib/timetable/api-guard.ts` `STATUS` map (`run_in_progress: 409`, `input_problems: 422`)
- Test: `test/integration/timetable-runs.test.ts`

**Interfaces:**
- Consumes: `buildSolverInput` (`export.ts`), `callSolver` (Task 2), `WeightProfile`, tables from Task 1.
- Produces:
  ```ts
  export const RUN_PROFILES: readonly WeightProfile[] = ["teachers", "classes", "balanced"];
  export type RunStatus = "queued" | "running" | "done" | "failed";
  export interface SolutionSummary { id: string; profile: WeightProfile; status: "ok" | "failed"; error: string | null; score: number; violations: SolverViolation[] }
  export interface Run { id: string; status: RunStatus; error: string | null; createdAt: string; finishedAt: string | null; solutions: SolutionSummary[] }
  export type SolveFn = (input: SolverInput) => Promise<SolverOutput>;
  export function startRun(schoolId: string, boardId: string, staffId: string, now?: Date): Promise<{ runId: string }>; // throws TimetableError input_problems | run_in_progress
  export function executeRun(schoolId: string, runId: string, solve?: SolveFn): Promise<void>; // never throws; default solve = callSolver
  export function getRun(schoolId: string, boardId: string, runId: string, now?: Date): Promise<Run | null>;
  export function listRuns(schoolId: string, boardId: string, now?: Date): Promise<Run[]>; // newest first, with their solution summaries
  ```
  `TimetableError` for `input_problems` carries the problems: add an optional `details?: unknown` field to `TimetableError` and return it as `{ error, problems: details }` in `timetableErrorResponse`.

`executeRun`: mark `running` + `started_at`; `Promise.allSettled` over `RUN_PROFILES`, each `solve({ ...input, profile })`; write each solution and its placements (`pinned: false`) in one `withSchool` transaction per profile; finally `done`/`failed` + `finished_at`. Errors are stored as their code (`SolverCallError.code`, `solver_failed` for `status: "failed"`, `internal_error` otherwise); the detail goes to `console.error` server-side, matching how other server errors are logged.

Stale rule (one helper used by `getRun`, `listRuns` and `startRun`): a `queued`/`running` row with `created_at` older than `RUN_STALE_MINUTES = 6` reads as `{ status: "failed", error: "timed_out" }`.

- [ ] **Step 1: Write failing integration tests** (seed a small board with `timetable-helpers.ts`; fake `SolveFn`s):
  - `startRunStoresQueuedRunWithInput` — the row's `input` parses with `SolverInputSchema` once a profile is added back.
  - `startRunRefusesBoardWithProblems` — a block without a teacher → `TimetableError("input_problems")`, no row.
  - `secondStartWhileRunningIsRefused` — `run_in_progress`.
  - `staleRunIsFailedAndDoesNotBlock` — start, then `now` = +7 min: `getRun` says `failed`/`timed_out`, a new `startRun` succeeds.
  - `executeRunSavesThreeSolutions` — fake returns one placement per block; three solutions, `done`, placements count = 3 × blocks.
  - `oneProfileFailingStillSavesTheOthers` — fake throws `SolverCallError("solver_http_error", 500)` for `classes`: run `done`, that solution `failed` with error `solver_http_error`.
  - `allProfilesFailingFailsTheRun`.
  - `twentyFirstRunDeletesTheOldest`.
  - `otherSchoolCannotReadRun` — `getRun(testSchoolB, ...)` returns null.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `runs.ts` and the error additions.
- [ ] **Step 4: Run, expect PASS**; `pnpm test:unit test/unit/timetable/routes.test.ts` still passes (error map change).
- [ ] **Step 5: Commit** — `feat: timetable run lifecycle`.

### Task 4: Run routes

**Files:**
- Create: `app/api/v1/timetable/boards/[board]/runs/route.ts` (GET list, POST start)
- Create: `app/api/v1/timetable/boards/[board]/runs/[run]/route.ts` (GET one run)
- Create: `lib/validations/timetable-runs.ts`
- Test: `test/unit/timetable/runs-routes.test.ts` (pattern of `routes.test.ts`: mocked session, school, domain)

**Interfaces:**
- Consumes: Task 3 functions; `requireBoard`, `withTimetableErrors`, `notFoundResponse` from `api-guard.ts`.
- Produces (in `timetable-runs.ts`): `SolutionSummarySchema`, `RunSchema`, `RunsResponseSchema = { runs: Run[] }`, `RunResponseSchema = { run: Run }`, `StartRunResponseSchema = { runId }`. `violations` reuse `SolverViolationSchema`.

POST: `requireBoard(true, params)` → `startRun` → `after(() => executeRun(schoolId, runId))` → 202 `{ runId }`. The runs route file exports `export const maxDuration = 300`. No request body.

- [ ] **Step 1: Write failing route tests:** POST → 202 and `executeRun` scheduled (mock `next/server`'s `after` to call its callback); POST for a viewer → 403; POST for a demo user → 403 `demo_disabled`; POST with `input_problems` → 422 with `problems`; POST with `run_in_progress` → 409; GET run of an unknown id or non-uuid → 404; responses parse with their schemas.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement the two routes and the schemas.**
- [ ] **Step 4: Run, expect PASS**; `pnpm lint && pnpm tsc`.
- [ ] **Step 5: Commit** — `feat: timetable run routes`.

### Task 5: Solution grid projection

**Files:**
- Create: `lib/timetable/grid.ts` (pure, no DB)
- Create: `lib/timetable/solutions.ts` (`getSolutionGrid`, DB read)
- Create: `app/api/v1/timetable/boards/[board]/runs/[run]/solutions/[solution]/route.ts` (GET, `requireBoard(false, ...)`, 404 when null; response `SolutionGridResponseSchema` added to `lib/validations/timetable-runs.ts`)
- Test: `test/unit/timetable/grid.test.ts`, and one case in `test/integration/timetable-runs.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface GridLesson { blockId: string; subjectId: string | null; classIds: string[]; teacherIds: string[] }
  export interface SolutionGrid {
    solution: SolutionSummary;
    week: Week;
    lessons: Array<GridLesson & { day: number; period: number }>;
    names: { classes: Record<string, { grade: number; number: number }>; teachers: Record<string, string>; subjects: Record<string, string> };
  }
  export type GridView = { kind: "class" | "teacher"; id: string };
  export type GridCells = Map<string, GridLesson[]>; // key `${day}:${period}`
  export function cellsFor(grid: Pick<SolutionGrid, "lessons">, view: GridView): GridCells; // grid.ts
  export function getSolutionGrid(schoolId: string, boardId: string, runId: string, solutionId: string): Promise<SolutionGrid | null>; // solutions.ts
  ```
  `getSolutionGrid` joins placements with the run's stored `input.blocks` (by `blockId`) and reads current names with `listClasses`, `listTeachers`, `listSubjects`. Names missing from the current tables are simply absent; the UI shows the "removed" label (Review Focus 1).

- [ ] **Step 1: Write failing unit tests for `cellsFor`:** a class view returns only lessons whose `classIds` include it; a teacher view likewise by `teacherIds`; a Plata block appears under every one of its classes; a meeting (`classIds: []`) shows in its teachers' views and in no class view; two lessons in one cell (a teacher clash the solver reported) both appear.
- [ ] **Step 2: Integration case** `gridSurvivesDeletedTeacher`, and a route test in `test/unit/timetable/runs-routes.test.ts`: a solution id not belonging to the run → 404, a found grid parses with `SolutionGridResponseSchema`. Original case: — run, solve with a fake, delete a teacher's block and the teacher, `getSolutionGrid` still returns all lessons and `names.teachers` lacks that id.
- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement both files.**
- [ ] **Step 5: Run, expect PASS. Commit** — `feat: timetable solution grid projection`.

### Task 6: Generate screen

**Files:**
- Create: `app/(timetable)/timetable/[board]/generate/page.tsx` (server: guard as in `collect/page.tsx`, loads board, `listRuns`, current `buildSolverInput` problems, constraint names for violations)
- Create: `components/timetable/generate/GeneratePanel.tsx` (client: Generate button, polling, latest run)
- Create: `components/timetable/generate/OptionCard.tsx` (one profile: name, score, violations, "open" link)
- Create: `components/timetable/generate/api.ts` (`startRun(board)`, `fetchRun(board, run)`, error keys, pattern of `components/timetable/constraints/api.ts`)
- Modify: `app/(timetable)/timetable/[board]/setup/page.tsx` (a "Generate" link beside the existing collect link)
- Modify: `messages/he.json`, `messages/en.json` (`timetable.generate.*`)
- Test: `test/unit/timetable/generate-components.test.tsx`

Behaviour:
- Board with problems: button disabled, problems listed (reuse the wording of `ReadinessPanel` by linking to setup, not by copying it).
- After start: poll `GET /runs/[run]` every `POLL_MS = 3000` until `done`/`failed`; show elapsed seconds. Stop polling on unmount. Compare by run id and status, never object identity (CLAUDE.md "Views and polling").
- `done`: three `OptionCard`s side by side (stacked on phones), order `RUN_PROFILES`. A card lists violations: built-in types via `t("violation.teacher_clash" | "violation.class_clash" | "violation.unplaced", { count })`; constraint violations via `describeConstraint` from `components/timetable/constraints/describe.ts` with the board's constraints, falling back to `t("violation.removedConstraint")` when the id is gone. A failed profile shows `t("profileFailed")` and its error key.
- Earlier runs: a short list (date via `lib/datetime.ts`, status) whose items reopen that run's cards.
- Keys (Hebrew in `he.json`, mirrored): `title`, `subtitle`, `back`, `generate`, `running`, `elapsed`, `failed`, `profile.teachers` ("המורים קודם"), `profile.classes` ("הכיתות קודם"), `profile.balanced` ("מאוזן"), `score`, `noViolations`, `violation.*`, `profileFailed`, `error.*` (one per `SolverCallErrorCode`, `timed_out`, `solver_failed`, `internal_error`, `run_in_progress`, `input_problems`), `open`, `history`, `removedSubject`, `removedTeacher`, `meeting`, `byClass`, `byTeacher`.

- [ ] **Step 1: Write failing component tests:** disabled button with problems; clicking Generate calls `startRun` and then `fetchRun` until `done` (fake timers); three cards render in profile order; a `unplaced` violation renders its count; a failed profile renders `profileFailed`; a 409 shows `error.run_in_progress`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement page, components, messages and the setup link.**
- [ ] **Step 4: Run, expect PASS**; `pnpm lint && pnpm tsc`.
- [ ] **Step 5: Commit** — `feat: timetable generate screen with three options`.

### Task 7: Read-only option grid

**Files:**
- Create: `app/(timetable)/timetable/[board]/generate/[run]/[solution]/page.tsx` (server: guard, `getSolutionGrid`, `notFound()` on null; `?view=class|teacher&id=` picks the view, default the first class)
- Create: `components/timetable/generate/TimetableGrid.tsx` (client: class/teacher toggle, a select of classes or teachers, the week table)
- Test: add to `test/unit/timetable/generate-components.test.tsx`

Behaviour: rows = periods (with start time from `week`), columns = the week's days in order (day names from the existing `timetable.constraints.days.<n>` keys). A cell lists its lessons: subject name (or `t("meeting")`), and the other axis (teachers in a class view, classes via `className()` in a teacher view). Missing names show `removedSubject`/`removedTeacher`. A cell with two lessons gets a visible clash marker (icon + text, not color alone). Selecting a class or teacher updates the URL query (`router.replace`) so the view is linkable. Back link to the generate page.

- [ ] **Step 1: Write failing tests:** class view shows the class's lessons in the right day/period cells; switching to teacher view shows that teacher's week including a meeting; a removed teacher renders `removedTeacher`; a clash cell has the marker text.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS**; full `pnpm test`, `pnpm lint`, `pnpm tsc`, `pnpm build`.
- [ ] **Step 5: Commit** — `feat: read-only timetable option grid`.

### Task 8: Staging run and docs

- [ ] **Step 1: Make the server able to reach `/api/solve` behind Vercel Authentication.** Ofek turns on "Protection Bypass for Automation" in the Vercel project `schoolsync` (Settings → Deployment Protection) and leaves it on; Vercel then sets `VERCEL_AUTOMATION_BYPASS_SECRET` on every deployment. In the same PR, change the `VERCEL_AUTOMATION_BYPASS_SECRET` line in `CLAUDE.md` from "revoke after use" to "kept on: the app sends it to reach `/api/solve` on previews and staging; rotate it if it leaks". Then confirm on the PR preview: the run on the demo board reaches `done`.
- [ ] **Step 2: Open the PR to `staging`** (migration 0026 named in the description). After all checks are green and it is merged, on staging: open `/timetable/<demo board>/generate`, press Generate, wait for three options, open each as a grid by class and by teacher. Record the wall time of the run and the three solve times (`X-Solve-Seconds` in the function logs) in the PR.
- [ ] **Step 3: Update docs** in the same PR: plan 7 row in `00-split.md` → merged; the "What can be shown" row for 7 confirmed; add one line under "Solver benchmark and host" with the staging run's times on the demo board (this is also the pending Kfar Galim measurement if the demo board is used).

## Decision (Ofek, 2026-11-18): bypass kept on

The server calls its own deployment's `/api/solve`, which on previews and staging is behind Vercel Authentication. Protection Bypass for Automation stays on for the project, and the solver client sends `VERCEL_AUTOMATION_BYPASS_SECRET`. Rejected: pointing staging at production's solver (needs a promotion first and makes staging depend on production).

## Not in this plan

Pins, drag, regenerate, `evaluate`, publish, print styles, the teacher's week (plan 8). Weight profiles that actually differ, and constraint encoders (plan 4, the other chat). CI running pytest (plan 4). An e2e test: plan 8 owns the principal-flow e2e; this plan's screens are covered by component tests and the staging run.
