# timeTable plan 8: edit by hand, pin, regenerate, publish, print

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On staging, the principal opens a generated option, moves lessons by click (seeing clashes at once), places the lessons the solver left unplaced, pins lessons, checks the full constraint report, regenerates the rest around the pins, publishes one option and prints it on A4.

**Architecture:** The option page from plan 7 (`/timetable/[board]/generate/[run]/[solution]`) becomes the editor. Edits change that solution's `tt_placements` rows in place and mark its report stale. Clash checks run in the browser on the lesson list the page already has. The full report is one synchronous `mode: "evaluate"` call to the existing solver. Regenerate is a normal run (`POST /runs`) whose input carries the edited solution's pinned placements. Publish points `tt_boards.published_solution_id` at the solution.

**Tech Stack:** Next.js 15 route handlers, Drizzle + `withSchool`, Zod, next-intl, Tailwind `print:` variant, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-timetable-design.md` ("Solver", "Screens" 4 and 5, the addendum of 2026-11-14, "Solver benchmark and host"). Split: `docs/superpowers/plans/2026-11-13-timetable-00-split.md`, plan 8. Model for this plan: `2026-11-18-timetable-07-generate.md`.

Branch `feature/timetable-edit` from `staging`. Migration **0027**. Message namespace **`timetable.edit.*`** (plus one key appended to `timetable.generate.violation`, see Decisions). Files: `lib/timetable/` (not `constraints/`), `app/api/v1/timetable/boards/[board]/runs/**`, `components/timetable/generate/`, `components/timetable/edit/`, the generate pages, `app/print.css`.

## Scope decisions (Ofek, 2026-11-18)

- **Click-to-move, no drag library.** Click a lesson, then click a target cell. Works with the keyboard and on phones. Real drag can come later on top of the same move API.
- **The teacher's own week (`/timetable/me` after publishing) is plan 9.** The teacher's own constraints page already exists on staging (plan 6 follow-up, `app/(timetable)/timetable/me/page.tsx`). Plan 9 adds the published week to it, with the teacher-flow e2e.

## Solver capability today (read before Task 4)

The solver on `staging` handles built-in rules only. `solver/model.py` lines 3-4: pinned placements and `mode: evaluate` are "later in plan 4" (the other chat). Contract v1 already carries both (`mode`, `placements[].pinned`), so this plan sends them as the contract says and does **not** touch `solver/` or `api/solve.py`. Until plan 4 lands:
- `evaluate` re-solves instead of checking, so its placements differ from the ones sent. The app detects that and answers `evaluate_unsupported` instead of storing a report about a different timetable (Task 4).
- Regenerate ignores pins. The app counts pins missing from each new option and stores them as a `pin_moved` violation, so the card says so (Task 5).

Both guards stay useful after plan 4 as checks on the solver.

## Global Constraints

- Contract v1 (`lib/timetable/solver-contract.ts`) is not changed. `solver/` and `api/solve.py` are not touched.
- Every school-data query runs inside `withSchool(schoolId, fn)`. Every write that takes a solution id checks it belongs to the route's board (and run) inside the same transaction; RLS alone does not stop a same-school id from another board.
- Never edit an existing migration. Add `0027_timetable_edit.sql` (plain SQL run by `scripts/migrate.ts`; there is no journal file).
- Zod on every route's request and response. Admin only (`requireBoard`); writes refused for demo users (`requireBoard(true, ...)`).
- All UI strings through `t()`, `he.json` first, `en.json` mirrored. Logical CSS properties only. `lucide-react` icons. State is never shown by color alone (icon + text). Functions < 50 lines, files < 400 lines, no `any`.
- Polling and effects compare ids and statuses, never object identity (CLAUDE.md "Views and polling").

## Decisions made here

| Topic | Decision |
|---|---|
| What gets edited | The solution itself, in place. No copy. An edited option's card on the generate page shows its stored report, with `t("edit.reportStale")` while `report_stale` is true. |
| A lesson's identity | A placement row: `(blockId, day, period)`. A block with N weekly periods has up to N rows. A Plata block is one row, so moving it in one class's view moves it for all its classes. |
| One move API | `PATCH .../placements` with a discriminated body: `move` (`from` and `to`, each a slot or `null`) and `pin`. `from: null` places a lesson from the unplaced tray; `to: null` sends one back to the tray. |
| A hand move pins | Every `move` with a `to` slot stores `pinned: true`. Otherwise regenerating throws the principal's work away. |
| Clashes on move | Allowed. The principal may make a clash on purpose and fix it next; the grid marks it (plan 7 marker) and the report counts it. Refused only: a slot outside the board's week (`not_in_week`, 422), the same block already in that slot (`slot_taken`, 409), placing a block that already has all its weekly periods (`fully_placed`, 409), a failed solution (`solution_failed`, 409). A source placement that no longer exists → 404 (another tab moved it; the client refreshes). |
| Report freshness | Migration 0027 adds `tt_solutions.report_stale boolean not null default false`. Any `move` sets it true; a successful evaluate sets it false and replaces `score` and `violations`. Pin changes do not make it stale. |
| Evaluate | `POST .../evaluate`, synchronous, `maxDuration = 120`. Input = the run's stored input + this solution's profile + `mode: "evaluate"` + its current placements (with `pinned`). Accepted only if the output's placement set equals the one sent; else 502 `evaluate_unsupported`, nothing stored. Solver errors → 502 with the `SolverCallErrorCode`. |
| Regenerate | `POST /runs` with an optional body `{ fromSolutionId }`. The new run's `input.placements` = that solution's pinned rows, keeping only blocks present in the current export, slots inside the current week, and at most `weeklyPeriods` per block. Unpinned rows are dropped. Result: a new run with three options, as in plan 7. |
| Pins in new options | `saveSolution` stores `pinned: true` on output placements that match an input pin. Input pins missing from an `ok` output add one violation `{ constraintId: null, type: "pin_moved", hard: true, count, teacherIds: [], classIds: [] }`. The label key `violation.pin_moved` is appended to `timetable.generate.violation` because `OptionCard` renders built-in types from there (same track, plan 7 merged). |
| Publish | `POST .../publish` (under the solution's route, Track A's folder). Sets `tt_boards.published_solution_id` and `status = 'published'`. Publishing another option replaces it. A failed solution cannot be published. No unpublish (publish another one instead). The published solution stays editable; the editor shows a banner that changes are live. |
| Published run is kept | `startRun`'s pruning (`MAX_RUNS_PER_BOARD = 20`) skips the run holding the published solution. Otherwise the FK `ON DELETE SET NULL` would silently unpublish. |
| `review` status | Still never produced. Nothing in the app reads it yet. |
| Print | The current view prints via `window.print()`; a print page prints every class (or every teacher) one per A4 landscape page. Tailwind `print:hidden` hides controls; a named `@page timetable { size: A4 landscape }` in `app/print.css`. Monochrome: black borders, clash and pin shown as icon + text. |

## Review Focus

1. **Another board's solution id, same school.** `PATCH`, `evaluate`, `publish` and `fromSolutionId` with a solution of board B on board A's URL → 404, nothing written. Tests in Tasks 2, 3 and 6.
2. **The 21st run while a published option exists.** The published run survives and the board stays published. Test in Task 5 (`publishedRunIsNotPruned`).
3. **The board changed after the run** (a block deleted, the week shortened). Regenerating from an old option must not send pins for missing blocks or slots (the contract's `superRefine` would not catch a pin on an unknown block, the solver would). Test in Task 5 (`stalePinsAreDropped`).
4. **The solver of today on evaluate.** Returns a different timetable: the app answers `evaluate_unsupported` and keeps the old report and `report_stale: true`. Test in Task 4.
5. **Two tabs move the same lesson.** The second `move` finds no source row → 404; the client shows `t("edit.error.moved_elsewhere")` and reloads the grid (`router.refresh()`), no duplicate row. Tests in Tasks 2 and 8.

---

### Task 1: Migration 0027 and grid data for editing

**Files:**
- Create: `db/migrations/0027_timetable_edit.sql` (`ALTER TABLE tt_solutions ADD COLUMN report_stale boolean NOT NULL DEFAULT false;`)
- Modify: `lib/db/schema-timetable.ts` (`reportStale: boolean("report_stale").notNull().default(false)` on `ttSolutions`)
- Modify: `lib/timetable/runs.ts` (`SolutionSummary` gains `reportStale: boolean`; `toSolutionSummary` maps it)
- Modify: `lib/validations/timetable-runs.ts` (`SolutionSummarySchema` gains `reportStale`)
- Modify: `lib/timetable/grid.ts`, `lib/timetable/solutions.ts`
- Test: `test/unit/timetable/grid.test.ts`, `test/integration/timetable-runs.test.ts`

**Interfaces:**
- Produces (in `grid.ts`):
  ```ts
  export interface Slot { day: number; period: number }
  export type PlacedLesson = GridLesson & Slot & { pinned: boolean };
  export interface SolutionGrid {            // replaces plan 7's
    solution: SolutionSummary;
    week: Week;
    lessons: PlacedLesson[];
    unplaced: Array<GridLesson & { missing: number }>; // blocks with fewer rows than weeklyPeriods
    published: boolean;                       // this solution is the board's published one
    names: { ... unchanged };
  }
  export interface SlotConflict { teacherIds: string[]; classIds: string[] }
  /** Who else is busy at `slot` among `lesson`'s teachers and classes, ignoring `lesson` at `ignore`. */
  export function conflictsAt(lessons: PlacedLesson[], lesson: GridLesson, slot: Slot, ignore?: Slot): SlotConflict;
  export function slotInWeek(week: Week, slot: Slot): boolean;
  ```
  `cellsFor` keeps its signature (it accepts `PlacedLesson` since it extends `GridLesson & Slot`) and keeps `pinned` on the returned lessons: change `GridCells` to `Map<string, Array<GridLesson & { pinned: boolean }>>`.

- [ ] **Step 1: Write failing unit tests** in `grid.test.ts`: `conflictsAt` reports a shared teacher and a shared class at the slot; ignores the lesson's own row at `ignore`; a meeting (`classIds: []`) conflicts only by teacher; an empty slot gives `{ teacherIds: [], classIds: [] }`. `slotInWeek` is false for a period the day does not have (Friday period 6 in `DEFAULT_WEEK`) and for a day not in the week.
- [ ] **Step 2: Write failing integration cases** in `timetable-runs.test.ts`: `gridListsUnplacedLessons` (fake solve places 1 of a 3-period block → `unplaced` has that block with `missing: 2`); `gridMarksPublished` (set `published_solution_id` directly → `published: true`); `newSolutionReportIsFresh` (`reportStale` false).
- [ ] **Step 3: Run, expect FAIL** — `pnpm test:unit test/unit/timetable/grid.test.ts`; integration with the staging command (see Task 9 note).
- [ ] **Step 4: Implement.** `getSolutionGrid` also selects `ttBoards.publishedSolutionId` and computes `unplaced` from `input.blocks[].weeklyPeriods` minus row counts.
- [ ] **Step 5: Apply the migration** to the staging DB (`pnpm db:migrate` with `.env.staging.local`), run both suites: PASS. `pnpm tsc` clean (fix `TimetableGrid` and `OptionCard` for the new fields).
- [ ] **Step 6: Commit** — `feat: report_stale on timetable solutions and grid data for editing (migration 0027)`.

### Task 2: Move and pin lessons (domain + route)

**Files:**
- Create: `lib/timetable/edit.ts`
- Modify: `lib/timetable/errors.ts` (codes `not_in_week`, `slot_taken`, `fully_placed`, `solution_failed`) and the `STATUS` map in `api-guard.ts` (`not_in_week: 422`, `slot_taken: 409`, `fully_placed: 409`, `solution_failed: 409`)
- Create: `app/api/v1/timetable/boards/[board]/runs/[run]/solutions/[solution]/placements/route.ts` (PATCH)
- Modify: `lib/validations/timetable-runs.ts` (`PlacementEditSchema`)
- Test: `test/integration/timetable-edit.test.ts`, `test/unit/timetable/edit-routes.test.ts` (pattern of `runs-routes.test.ts`)

**Interfaces:**
- Produces:
  ```ts
  // lib/validations/timetable-runs.ts
  const SlotSchema = z.object({ day: z.number().int().min(0).max(6), period: z.number().int().min(1) });
  export const PlacementEditSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("move"), blockId: z.string().uuid(), from: SlotSchema.nullable(), to: SlotSchema.nullable() })
      .refine((m) => m.from !== null || m.to !== null),
    z.object({ action: z.literal("pin"), blockId: z.string().uuid(), day: SlotSchema.shape.day, period: SlotSchema.shape.period, pinned: z.boolean() }),
  ]);
  export type PlacementEdit = z.infer<typeof PlacementEditSchema>;
  // lib/timetable/edit.ts
  export interface SolutionRef { boardId: string; runId: string; solutionId: string }
  /** Throws TimetableError; returns false when the solution or the source row is not found (route → 404). */
  export function editPlacement(schoolId: string, ref: SolutionRef, edit: PlacementEdit): Promise<boolean>;
  ```
  The route answers 204 on success, 404 on `false`, 400 on a bad body, and the `STATUS` codes above. A move with both `from` and `to` is one `UPDATE` of the row's key (no delete + insert, so a concurrent move cannot leave two rows).

- [ ] **Step 1: Write failing integration tests** (board, run and solution from `timetable-helpers.ts` + a fake solve, as in `timetable-runs.test.ts`):
  - `moveChangesSlotPinsAndMarksStale` — row moves, `pinned` true, `report_stale` true.
  - `moveToTrayDeletesRow` / `placeFromTrayInsertsPinnedRow`.
  - `placeFullyPlacedBlockIsRefused` — `fully_placed`.
  - `moveOutsideWeekIsRefused` — Friday period 6 → `not_in_week`.
  - `moveOntoSameBlockIsRefused` — `slot_taken`.
  - `moveIntoClashIsAllowed` — two blocks sharing a teacher end in one slot.
  - `missingSourceReturnsFalse` — moving the same row twice: second call `false`, still one row.
  - `pinTogglesWithoutStale` — `report_stale` unchanged.
  - `otherBoardsSolutionIsNotFound` — a solution of another board of the same school → `false`, rows unchanged.
  - `failedSolutionIsRefused` — `solution_failed`.
- [ ] **Step 2: Write failing route tests:** 204 on success; viewer 403; demo user 403 `demo_disabled`; `{ action: "move", from: null, to: null }` → 400; `false` → 404; `slot_taken` → 409.
- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement** `edit.ts` (one `withSchool` transaction: load the solution joined to its run where id, run and board match; read the block from `input.blocks`; check `slotInWeek` against `input.week`; write; set `report_stale` on moves), the schema and the route.
- [ ] **Step 5: Run, expect PASS**; `pnpm lint && pnpm tsc`.
- [ ] **Step 6: Commit** — `feat: move, place and pin timetable lessons`.

### Task 3: Publish

**Files:**
- Modify: `lib/timetable/edit.ts` (`publishSolution`)
- Create: `app/api/v1/timetable/boards/[board]/runs/[run]/solutions/[solution]/publish/route.ts` (POST, no body)
- Modify: `lib/validations/timetable-runs.ts` (`PublishResponseSchema = { publishedSolutionId: uuid }`)
- Test: add to `test/integration/timetable-edit.test.ts` and `test/unit/timetable/edit-routes.test.ts`

**Interfaces:**
- Produces: `export function publishSolution(schoolId: string, ref: SolutionRef): Promise<boolean>;` — false = not found; throws `solution_failed`. Sets `published_solution_id` and `status = 'published'` in one statement.

- [ ] **Step 1: Write failing tests:** `publishSetsBoardPublished`; `publishingAnotherReplacesIt`; `publishFailedIsRefused`; `publishOtherBoardsSolutionIsNotFound` (board stays unpublished); route: 200 parses with `PublishResponseSchema`, demo user 403, not found 404.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat: publish a timetable option`.

### Task 4: Evaluate (full constraint report)

**Files:**
- Modify: `lib/timetable/edit.ts` (`evaluateSolution`)
- Create: `app/api/v1/timetable/boards/[board]/runs/[run]/solutions/[solution]/evaluate/route.ts` (POST, `export const maxDuration = 120`)
- Modify: `lib/validations/timetable-runs.ts` (`EvaluateResponseSchema = { solution: SolutionSummarySchema }`)
- Test: add to `test/integration/timetable-edit.test.ts` and `test/unit/timetable/edit-routes.test.ts`

**Interfaces:**
- Consumes: `callSolver`, `SolveFn` (`runs.ts`), `SolverCallError`.
- Produces:
  ```ts
  export type EvaluateResult =
    | { ok: true; solution: SolutionSummary }
    | { ok: false; error: SolverCallErrorCode | "evaluate_unsupported" | "solver_failed" };
  /** null = not found. Never stores a report for placements other than the ones sent. */
  export function evaluateSolution(schoolId: string, ref: SolutionRef, solve?: SolveFn): Promise<EvaluateResult | null>;
  ```
  Route: 200 with the summary; `ok: false` → 502 `{ error }`; null → 404; a failed solution → 409 `solution_failed`. The solver call happens outside the transaction; the write (`score`, `violations`, `report_stale = false`) is a second `withSchool`. Placement sets are compared as sorted `${blockId}:${day}:${period}` strings.

- [ ] **Step 1: Write failing tests** (fake `SolveFn`s):
  - `evaluateSendsCurrentPlacementsInEvaluateMode` — the fake receives `mode: "evaluate"`, the solution's `profile`, every current row with its `pinned`.
  - `evaluateStoresReportAndClearsStale` — fake echoes placements with one violation → stored, `reportStale` false.
  - `evaluateRejectsDifferentPlacements` — fake returns other placements (today's solver) → `{ ok: false, error: "evaluate_unsupported" }`, old violations kept, still stale.
  - `evaluateSolverErrorIsReported` — fake throws `SolverCallError("solver_http_error", 500)` → `solver_http_error`, nothing stored.
  - Route: 502 body `{ error: "evaluate_unsupported" }`; other board's solution 404; demo 403.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat: evaluate an edited timetable option`.

### Task 5: Regenerate around pins

**Files:**
- Modify: `lib/timetable/runs.ts` (`startRun`, `saveSolution`, pruning)
- Modify: `app/api/v1/timetable/boards/[board]/runs/route.ts` (POST reads an optional body)
- Modify: `lib/validations/timetable-runs.ts` (`StartRunRequestSchema = z.object({ fromSolutionId: z.string().uuid().optional() })`; an empty body is `{}`)
- Test: `test/integration/timetable-runs.test.ts`, `test/unit/timetable/runs-routes.test.ts`

**Interfaces:**
- Produces: `startRun(schoolId, boardId, staffId, now = new Date(), fromSolutionId?: string)` — positional fifth parameter so existing callers and tests stay as they are. Unknown `fromSolutionId` (or another board's) → `TimetableError("unknown_id")` → 400, the same code the route already maps.
  Internal helper in `runs.ts`: `pinsFor(tx, boardId, solutionId, input): Promise<SolverPlacement[] | null>` applying the filters in Decisions.

- [ ] **Step 1: Write failing integration tests:**
  - `regenerateSendsPinnedOnly` — solution with 2 pinned and 3 unpinned rows; the fake solve sees exactly the 2 pins with `pinned: true`.
  - `stalePinsAreDropped` — pin on a block then delete the block, and a pin on Friday period 5 then shorten Friday to 4 in `tt_boards.week`: neither is sent; the input still parses with `SolverInputSchema`.
  - `keptPinsStayPinned` — fake echoes pins → new solution's matching rows have `pinned: true`, no `pin_moved`.
  - `movedPinsAreReported` — fake ignores pins (places those blocks elsewhere) → violation `pin_moved` with `count: 2`.
  - `regenerateFromOtherBoardIsRefused` — `unknown_id`.
  - `publishedRunIsNotPruned` — publish a solution of the oldest run, start 20 more: that run still exists, board still published; the oldest unpublished one was deleted instead.
- [ ] **Step 2: Route test:** POST with `{ fromSolutionId: "x" }` → 400; POST with no body still 202 (plan 7 behaviour).
- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement.** Pass the input pins into `saveSolution` (read from `run.input.placements`).
- [ ] **Step 5: Run, expect PASS**; plan 7's run tests still pass.
- [ ] **Step 6: Commit** — `feat: regenerate a timetable around pinned lessons`.

### Task 6: Editor screen

**Files:**
- Create: `components/timetable/edit/WeekTable.tsx` (the table extracted from `TimetableGrid`, with a `renderCell(slot, lessons, exists)` prop)
- Create: `components/timetable/edit/LessonEditor.tsx` (client: selection state, optimistic lessons, calls the API, target hints)
- Create: `components/timetable/edit/UnplacedTray.tsx`
- Create: `components/timetable/edit/EditToolbar.tsx` (report status, Check, Regenerate, Publish, Print, the published banner)
- Create: `components/timetable/edit/api.ts` (`editPlacement`, `evaluate`, `publish`, `regenerate(board, fromSolutionId)`; pattern of `components/timetable/generate/api.ts`)
- Create: `components/timetable/generate/ViolationList.tsx` (extracted from `OptionCard` so the editor reuses it)
- Modify: `components/timetable/generate/TimetableGrid.tsx` (keeps the view picker; renders `WeekTable` read-only, or `LessonEditor` when `editable`)
- Modify: `components/timetable/generate/OptionCard.tsx` (uses `ViolationList`; shows an `edit.published` badge and `edit.reportStale` when stale; link label `edit.open`)
- Modify: `app/(timetable)/timetable/[board]/generate/[run]/[solution]/page.tsx` (passes `editable = !isDemoUser(user) && solution.status === "ok"`, the board's constraints for `ViolationList`)
- Modify: `app/(timetable)/timetable/[board]/generate/page.tsx` (passes `publishedSolutionId` to the cards)
- Modify: `messages/he.json`, `messages/en.json`
- Test: `test/unit/timetable/edit-components.test.tsx`

**Behaviour:**
- Each lesson in a cell is a `<button>`. Clicking selects it (`aria-pressed`); Escape or clicking it again cancels. While selected, every cell of the view becomes a target button labelled with its state from `conflictsAt`: free, or `t("edit.target.clash", { names })` with an icon. Cells outside the week are not targets. Clicking a target sends `move` and updates the lessons at once; on an error the lessons roll back and the error key shows (`edit.error.<code>`, 404 → `edit.error.moved_elsewhere` plus `router.refresh()`).
- A pinned lesson shows a `Pin` icon with `t("edit.pinned")` text; a small pin button toggles it (`pin` action).
- The tray lists `unplaced` lessons of the current class or teacher with their missing count. Selecting one and clicking a cell sends `move` with `from: null`. A placed lesson has a "back to tray" button (`to: null`).
- Toolbar: when `reportStale`, `t("edit.reportStale")` and a Check button (calls evaluate, shows `t("edit.checking")`, then the new `ViolationList` or `edit.error.<code>`, with `evaluate_unsupported` worded as "the solver cannot check yet"). Regenerate calls `regenerate` and navigates to the generate page, which already polls the new run. Publish asks `window.confirm(t("edit.publishConfirm"))`, then shows `edit.publishedBanner` ("this is the published timetable; changes are visible at once"). Print calls `window.print()`; a link opens the print-all page (Task 7).
- Keys in `timetable.edit.*` (Hebrew first): `open`, `published`, `publishedBanner`, `publish`, `publishConfirm`, `regenerate`, `regenerateHint` ("pinned lessons stay, the rest is rebuilt"), `check`, `checking`, `reportStale`, `reportFresh`, `pinned`, `pin`, `unpin`, `toTray`, `tray`, `trayEmpty`, `missing` (`{count}`), `select`, `cancel`, `target.free`, `target.clash` (`{names}`), `print`, `printAllClasses`, `printAllTeachers`, `error.*` (`not_in_week`, `slot_taken`, `fully_placed`, `solution_failed`, `moved_elsewhere`, `evaluate_unsupported`, `solver_failed`, every `SolverCallErrorCode`, `internal_error`). Appended to `timetable.generate.violation`: `pin_moved` ("{count} pinned lessons were moved").

- [ ] **Step 1: Write failing component tests** (mocked `api.ts`): selecting a lesson then a free cell calls `editPlacement` with the right `from`/`to` and the lesson renders in the new cell; a target where the lesson's teacher is busy shows the clash text; a rejected move rolls back and shows `edit.error.slot_taken`; the tray places a lesson with `from: null`; the pin button sends `pin`; `reportStale` shows the Check button and a 502 `evaluate_unsupported` shows its message; Publish after confirm calls `publish` and shows the banner; `editable={false}` renders no buttons in cells; `OptionCard` shows the `pin_moved` count and the published badge.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Keep `LessonEditor` under 400 lines by putting target computation in `lib/timetable/grid.ts` (already tested) and the toolbar and tray in their own files.
- [ ] **Step 4: Run, expect PASS**; plan 7's `generate-components.test.tsx` still passes; `pnpm lint && pnpm tsc`.
- [ ] **Step 5: Commit** — `feat: timetable editor: move by click, tray, pins, check, publish`.

### Task 7: Print

**Files:**
- Create: `app/(timetable)/timetable/[board]/generate/[run]/[solution]/print/page.tsx` (server, admin guard as the option page; `?view=class|teacher`; renders a heading and one read-only `WeekTable` per class or teacher, each in `.print-timetable` with `break-after: page`)
- Modify: `app/print.css` (append: `@page timetable { size: A4 landscape; margin: 8mm; }`, `.print-timetable { page: timetable; }`, black borders and no background fills under `@media print`)
- Modify: `components/timetable/edit/WeekTable.tsx`, `EditToolbar.tsx`, `TimetableGrid.tsx` (`print:hidden` on controls, tray and picker; table `print:min-w-0 print:text-[10pt]`)
- Test: add to `test/unit/timetable/edit-components.test.tsx`

- [ ] **Step 1: Write failing tests:** the print page component renders one table per class in grade/number order with each class's heading; clash and pin markers render as text (not only icons) in read-only mode.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.** Then check by hand in the built-in browser's print preview on the preview deployment: one class per A4 landscape page, legible with "Black and white" selected. Screenshot into the PR.
- [ ] **Step 5: Commit** — `feat: print a timetable option on A4`.

### Task 8: Principal-flow e2e

**Files:**
- Create: `test/e2e/timetable-edit.spec.ts`

Pattern of `test/e2e/timetable-constraints.spec.ts`: skipped unless `ADMIN_E2E=1` and `DATABASE_URL`; turns the timetable service on for `demo-school` and restores it; deletes its board after. It needs no solver: `beforeAll` inserts by SQL a tiny board (2 classes, 2 teachers, 3 blocks), a `done` run whose `input` is that board's export, and one `ok` solution with placements that leave one lesson unplaced and two lessons sharing a teacher in adjacent periods.

- [ ] **Step 1: Write the spec** (admin storage state):
  1. Open the option page; the clash-free grid shows; axe has no serious or critical issues.
  2. Select a lesson, see the clash hint on the slot of the other lesson of its teacher, move it to a free slot; after reload it is still there and shows `pinned`.
  3. Place the tray lesson; the tray shows `trayEmpty`.
  4. Two-tab race: in a second page move the same lesson; the first page's move shows `moved_elsewhere` (Review Focus 5).
  5. Publish; the banner shows; the generate page's card shows `published`.
  6. Open the print page with `?view=class`: two tables.
  7. Regenerate only when `SOLVER_URL` is set (`test.skip` inside the step otherwise): the generate page shows a new run reaching `done`.
  Editor storage state: the option page redirects to `/timetable`.
- [ ] **Step 2: Run locally** — `ADMIN_E2E=1 pnpm playwright test/e2e/timetable-edit.spec.ts` against a local stack pointed at the staging DB (`.env.staging.local`), expect PASS.
- [ ] **Step 3: Commit** — `test: timetable principal flow e2e (edit, pin, publish, print)`.

### Task 9: Staging run and docs

Integration tests in this plan run against the staging DB (the local test DB is gone):
`bash -c 'set -a; . ./.env.staging.local; set +a; TEST_DATABASE_URL=$DATABASE_URL npx vitest run --project integration <file>'`.

- [ ] **Step 1: Full checks** — `pnpm test`, `pnpm lint`, `pnpm tsc`, `pnpm build`.
- [ ] **Step 2: PR to `staging`** naming migration 0027 and the solver gap above. On the preview: open an option of the demo board `הדגמה`, place several unplaced lessons, pin some, press Check (expect `evaluate_unsupported` until plan 4 lands), Regenerate (expect `pin_moved` on the new cards until plan 4 lands), Publish, print one class.
- [ ] **Step 3: After merge**, repeat on staging and record in the PR: the time of one Check call and one Regenerate run.
- [ ] **Step 4: Docs** in the same PR: plan 8 row in `00-split.md` → merged, and the "What can be shown" row for 8 updated to say pins and the report wait on plan 4; add a plan 9 row (`/timetable/me` own week after publishing, teacher-flow e2e, branch `feature/timetable-me-week`, starts when plan 8 is merged).

## Not in this plan

- The teacher's own published week and the teacher-flow e2e (plan 9).
- Real drag-and-drop; swapping two lessons in one click; pin-all or unpin-all buttons; unpublish.
- Solver support for pins and `evaluate` (plan 4, the other chat). When it lands, `evaluate_unsupported` and `pin_moved` stop appearing without changes here.
- An edit history or undo beyond moving a lesson back.
