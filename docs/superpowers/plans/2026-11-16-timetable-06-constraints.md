# timeTable Constraints Implementation Plan (plan 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The principal enters a board's constraints (free days, unavailability, meetings, class and teacher rules), aimed at teachers or a profile label; runs a collection round with a deadline and fills in for teachers who have not answered; the constraints reach the solver input; the demo seed adds a realistic set.

**Architecture:** Two RLS tables (`tt_constraints`, `tt_teacher_responses`) in migration 0025. One file per constraint type in `lib/timetable/constraints/` holds its Zod params and its `toSolver` step; a registry lists them. Targets (a teacher list or a profile option) are stored as entered and resolved to teacher ids only at export. A meeting becomes a class-less lesson block in the export. Screens: a sixth setup tab "Constraints" and a Collect page, backed by admin-only routes.

**Tech Stack:** Next.js 15 App Router, Drizzle + Postgres RLS, Zod, next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-timetable-design.md` ("Constraints", "Screens" 1-2, addendum of 2026-11-14) and the plan 6 outline with its frozen type table in `docs/superpowers/plans/2026-11-13-timetable-00-split.md`.

**Branch:** `feature/timetable-collect` from `staging`. **Migration 0025** (Ofek's `feature/timetable-solver` moves plan 7 to 0026; 0024 is `timetable_deferred_fks`).

## Decisions this plan makes (confirm with Ofek before Task 4 merges)

1. **The frozen solver params stay exactly as frozen.** Targets are teachers only (a list, or a profile label). `subject_max_per_day`, `class_no_gaps` and `teacher_few_gaps` apply to the whole board. Aiming them at a class, a grade or a subject (spec "Constraints") needs extra solver params, which is a contract PR of its own.
2. **`consecutive` on a meeting block means all its weekly periods back to back on one day.** This is the meaning the encoder must implement; today's contract leaves it open.
3. **A meeting block's id is its constraint's id**, `subjectId: null`, `classIds: []`. The solver's violations then name the meeting by its constraint id.
4. **Two lines in Ofek's files:** `lib/timetable/export.ts` calls `exportConstraints` (Task 4) and `scripts/seed-timetable-demo.ts` calls the constraints step (Task 9). Nothing else outside the track B files changes.
5. **Constraint errors get their own class** (`ConstraintError` in `lib/timetable/constraints/errors.ts`), so `TimetableError` (track A) is untouched.
6. **The teacher link and `/timetable/me` wait for plan 8.** The Collect page has no "copy link" button yet; the principal fills in for teachers.

## Global Constraints

- The Gantt and every plan 5 screen behave as today. Files touched: `db/migrations/0025_*.sql`, `db/migrations/meta/_journal.json`, `lib/db/schema-timetable.ts` (append at the end only), `lib/timetable/constraints/`, `lib/timetable/api-guard.ts`, `lib/validations/timetable-api.ts`, `lib/timetable/export.ts` (one call), `scripts/seed-timetable-demo.ts` (one call), `app/api/v1/timetable/boards/[board]/constraints/**`, `app/api/v1/timetable/boards/[board]/collect/**`, `app/(timetable)/timetable/[board]/**`, `components/timetable/setup/SetupTabs.tsx`, `components/timetable/constraints/`, `messages/*.json` (`timetable.constraints.*`, `timetable.collect.*`, new keys at the end), tests.
- Every query on the new tables runs inside `withSchool(schoolId, fn)`; RLS positive access and cross-school denial are tested for both tables.
- Every route: `requireBoard` from `lib/timetable/api-guard.ts` (service, admin, active, demo writes 403), Zod on request and response.
- Unlike plan 5a, every domain function here takes `boardId` and matches rows on it, so a constraint of another board is "not found".
- Days are 0 (Sunday) to 6; a board's days are the ones in `board.week`. Periods are 1 to that day's count.
- The solver never receives names or labels. A label becomes the teacher ids of board teachers whose staff user holds that option (`listStaffLabels`, which already ignores archived options and inactive staff).
- Limits (named constants in `lib/timetable/constraints/limits.ts`): `MAX_CONSTRAINTS_PER_BOARD = 500`, `MAX_WEIGHT = 100`, `MAX_MEETING_PERIODS = 6`, `MAX_SUBJECT_PER_DAY = 8`.
- Never edit an existing migration. Strings through `next-intl`, `he.json` first. CSS logical properties. No `any`.

## Review Focus

1. A label constraint whose option was archived, or whose holders left the board: the export sends only current holders; reaching no one, the constraint is skipped (not sent with `teacherIds: []`) and the list shows "מגיע ל־0 מורים". Test: Task 4.
2. A teacher deleted while constraints aim at them: their free day goes with them (FK cascade); a teacher id in a stored list that is no longer on the board is dropped at export, not sent. Test: Task 4.
3. A free day for a teacher who is not entitled (or whose entitlement is later turned off): rejected `not_entitled` on write; skipped at export if entitlement was turned off afterwards. Test: Tasks 3 and 4.
4. A second free day for the same teacher, from two admins at once: one row, the other `duplicate_free_day` (409), not a 500. Test: Task 3.
5. A deadline in the past, or starting collection on a published board: `deadline_past` 422 / `wrong_status` 409, nothing written. Test: Task 5.

---

### Task 1: tables, schema and RLS

**Files:**
- Create: `db/migrations/0025_timetable_constraints.sql`
- Modify: `db/migrations/meta/_journal.json` (entry idx 25), `lib/db/schema-timetable.ts` (append)
- Test: `test/integration/timetable-constraints-rls.test.ts`

**Interfaces:**
- Produces: Drizzle tables `ttConstraints`, `ttTeacherResponses`.

```
tt_constraints        id uuid pk, school_id, board_id → tt_boards cascade, type text, hardness text ('hard'|'soft'),
                      weight int (1..100), params jsonb, source text ('teacher'|'management'),
                      teacher_id uuid null → tt_teachers ON DELETE CASCADE, created_by uuid null → staff_users SET NULL,
                      created_at, updated_at
                      index (board_id); unique (board_id, teacher_id) WHERE type = 'teacher_free_day'
tt_teacher_responses  board_id → tt_boards cascade, teacher_id → tt_teachers cascade, school_id,
                      answered_at timestamptz not null default now(), by_management boolean not null,
                      answered_by uuid null → staff_users SET NULL;  PK (board_id, teacher_id)
```
Both: `ENABLE` + `FORCE ROW LEVEL SECURITY` and the `school_isolation` policy, as in 0023. Type is not a DB enum (adding a type must not need a migration); the app validates it.

- [ ] **Step 1: Failing integration test.** With `testSchoolA`/`testSchoolB` from `test/integration/setup.ts`, a board and a teacher per school: inside `withSchool(A)` insert and read back a constraint and a response; inside `withSchool(B)` neither is visible and an insert with A's `board_id` fails RLS; deleting A's teacher removes its free-day row and its response; a second `teacher_free_day` row for the same teacher fails with 23505.
- [ ] **Step 2: Run** `node_modules/.bin/vitest run test/integration/timetable-constraints-rls.test.ts` → FAIL (relation does not exist).
- [ ] **Step 3: Write the migration and the schema;** apply it to the local test DB with psql, re-run the grants and the `REVOKE` of `scripts/ci-db-setup.sh`.
- [ ] **Step 4: Run** the test and `test/unit/migrations-journal.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat: timetable constraints tables`

---

### Task 2: type registry and targets (pure)

**Files:**
- Create in `lib/timetable/constraints/`: `limits.ts`, `errors.ts`, `target.ts`, `registry.ts`, and one file per type: `teacher_free_day.ts`, `teacher_unavailable.ts`, `meeting.ts`, `subject_max_per_day.ts`, `class_no_gaps.ts`, `teacher_few_gaps.ts`
- Test: `test/unit/timetable/constraints/registry.test.ts`, `test/unit/timetable/constraints/target.test.ts`

**Interfaces:**
- Produces:

```ts
// target.ts
type Target = { kind: "teachers"; teacherIds: string[] } | { kind: "label"; optionId: string };
TargetSchema: z.ZodType<Target>                 // teacherIds 1..MAX_TEACHERS (400) unique uuids
labelReach(optionId: string, teachers: Array<{ id: string; staffUserId: string | null }>,
           labels: Record<string, string[]>): { reachedIds: string[]; unlinkedIds: string[] }
           // unlinked = board teachers with no staff user (they can never hold a label)
resolveTarget(target: Target, teachers: Array<{ id: string; staffUserId: string | null }>,
              labels: Record<string, string[]>): string[]   // only ids of teachers on the board

// errors.ts
class ConstraintError extends Error {
  code: "unknown_id" | "not_entitled" | "duplicate_free_day" | "limit_reached" | "deadline_past" | "wrong_status" }

// registry.ts
type ConstraintType = "teacher_free_day" | "teacher_unavailable" | "meeting"
                    | "subject_max_per_day" | "class_no_gaps" | "teacher_few_gaps";
interface ExportContext { teacherId: string | null; resolve(target: Target): string[]; entitled(teacherId: string): boolean }
type SolverPart =
  | { kind: "constraint"; params: Record<string, unknown> }
  | { kind: "block"; teacherIds: string[]; weeklyPeriods: number; consecutive: boolean }
  | { kind: "skip"; reason: "reaches_no_one" | "not_entitled" };
interface ConstraintTypeDef<P> {
  type: ConstraintType;
  params: z.ZodType<P>;
  hardness: "hard" | "soft" | "either";   // what the form may choose
  defaultWeight: number;
  perTeacher: boolean;                     // true: the row has teacher_id, no target in params
  toSolver(params: P, ctx: ExportContext): SolverPart;
}
CONSTRAINT_TYPES: Record<ConstraintType, ConstraintTypeDef<unknown>>
ConstraintInputSchema   // z.discriminatedUnion("type", …): { type, hard, weight, teacherId?, params }
type ConstraintInput = z.infer<typeof ConstraintInputSchema>
```

| Type | `params` (stored) | hardness / weight | `toSolver` |
|---|---|---|---|
| `teacher_free_day` | `{ day }` (+ row `teacherId`) | hard, 100 | not entitled → skip; else `{ teacherIds: [teacherId], day }` |
| `teacher_unavailable` | `{ target, day, periods?: number[] }` (periods unique, ≥1) | either, 100 | resolved `[]` → skip; else `{ teacherIds, day, periods? }` |
| `meeting` | `{ target, weeklyPeriods: 1..6, consecutive }` | hard, 100 | resolved `[]` → skip; else block |
| `subject_max_per_day` | `{ max: 1..8 }` | either, 50 | `{ max }` |
| `class_no_gaps` | `{}` | either, 50 | `{}` |
| `teacher_few_gaps` | `{}` | soft, 10 | `{}` |

`ConstraintInputSchema` refines: `teacherId` present iff the type is per-teacher; `hard` allowed by the type's hardness; `weight` 1..`MAX_WEIGHT`.

- [ ] **Step 1: Failing tests.** `target.test.ts`: with teachers `t1 (staff s1)`, `t2 (staff s2)`, `t3 (no staff)` and labels `{ s1: ["math"], s9: ["math"] }`: `labelReach("math", …)` is `{ reachedIds: ["t1"], unlinkedIds: ["t3"] }`; `resolveTarget({ kind: "teachers", teacherIds: ["t2", "gone"] }, …)` is `["t2"]`. `registry.test.ts`: every type in `CONSTRAINT_TYPES` has a matching `type` key; `ConstraintInputSchema` rejects `teacher_few_gaps` with `hard: true`, `teacher_free_day` without `teacherId`, `meeting` with `teacherId`, `weight: 0`, `meeting.weeklyPeriods: 7`; `meeting.toSolver` with a target resolving to `[]` gives `{ kind: "skip", reason: "reaches_no_one" }`; `teacher_free_day.toSolver({ day: 5 }, { teacherId: "t1", entitled: () => false, … })` gives `{ kind: "skip", reason: "not_entitled" }`.
- [ ] **Step 2: Run** `node_modules/.bin/vitest run test/unit/timetable/constraints` → FAIL.
- [ ] **Step 3: Implement** the files above (each type file < 40 lines; `registry.ts` only imports and lists them).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: timetable constraint types`

---

### Task 3: constraints domain

**Files:**
- Create: `lib/timetable/constraints/crud.ts`
- Test: `test/integration/timetable-constraints.test.ts`

**Interfaces:**
- Consumes: Task 1 tables, Task 2 `ConstraintInput`, `ConstraintError`, limits.
- Produces:

```ts
interface TtConstraint { id: string; type: ConstraintType; hard: boolean; weight: number; params: unknown;
                         source: "teacher" | "management"; teacherId: string | null; updatedAt: string }
listConstraints(schoolId: string, boardId: string): Promise<TtConstraint[]>      // by type, then created_at
createConstraint(schoolId: string, boardId: string, input: ConstraintInput,
                 actor: { staffUserId: string | null; source: "teacher" | "management" }): Promise<TtConstraint>
replaceConstraint(schoolId: string, boardId: string, id: string, input: ConstraintInput): Promise<TtConstraint | null>
deleteConstraint(schoolId: string, boardId: string, id: string): Promise<boolean>
// transaction-level helpers the functions above use, exported for Task 5:
insertConstraint(tx: Tx, schoolId: string, boardId: string, input: ConstraintInput,
                 actor: { staffUserId: string | null; source: "teacher" | "management" }): Promise<TtConstraint>
deleteFreeDay(tx: Tx, boardId: string, teacherId: string): Promise<void>
```

Every write: `assertBoard` (track A, `lib/timetable/boards.ts`); target teacher ids and `teacherId` must be teachers of this board, `optionId` an active option of the school, else `unknown_id`; free day needs `freeDayEntitled` (`not_entitled`); the unique free-day index violation maps to `duplicate_free_day`; more than `MAX_CONSTRAINTS_PER_BOARD` → `limit_reached`. `replaceConstraint` cannot change `type`, `source` or `teacherId` (a different type is delete + create).

- [ ] **Step 1: Failing tests:** create + list round-trips each type; a teacher id of another board → `unknown_id`, nothing written; an option of school B used on school A's board → `unknown_id`; free day for a non-entitled teacher → `not_entitled`; two concurrent `createConstraint` free days for one teacher (`Promise.allSettled`) → one fulfilled, one `ConstraintError("duplicate_free_day")`; replace/delete with a constraint id of another board of the same school → `null` / `false`; school B cannot list school A's rows.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: timetable constraints domain`

---

### Task 4: constraints in the solver input

**Files:**
- Create: `lib/timetable/constraints/export.ts`
- Modify: `lib/timetable/export.ts` (in `buildSolverInput`: call `exportConstraints`, append its blocks, use its constraints; nothing else)
- Test: `test/integration/timetable-constraints-export.test.ts`

**Interfaces:**
- Consumes: `listConstraints`, `CONSTRAINT_TYPES`, `resolveTarget`, `listStaffLabels`, `TtTeacher` (track A).
- Produces:

```ts
exportConstraints(schoolId: string, boardId: string, teachers: TtTeacher[]): Promise<{
  constraints: SolverConstraint[];          // { id, type, hard, weight, params } per "constraint" part
  meetingBlocks: SolverBlock[];             // { id: constraint id, subjectId: null, classIds: [], teacherIds, weeklyPeriods, consecutive }
  skipped: Array<{ constraintId: string; reason: "reaches_no_one" | "not_entitled" }>;
}>
```

- [ ] **Step 1: Failing tests** on a seeded board (two teachers linked to staff, one placeholder; a "מקצוע" category with option "מתמטיקה" held by the first): a label `teacher_unavailable` exports `teacherIds: [first]`; a `meeting` on that label exports a block with the constraint's id, `subjectId: null`, `classIds: []`, `consecutive: true`, and `buildSolverInput` still parses (`SolverInputSchema`); archiving the option → that constraint is in `skipped` as `reaches_no_one`; a teacher list naming a deleted teacher exports without it; a free day whose teacher's entitlement was turned off afterwards → `skipped` `not_entitled`; `findInputProblems` counts meeting periods in `teacher_overbooked`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run**, plus the track A export tests (`test/integration/timetable-*.test.ts`) → PASS.
- [ ] **Step 5: Commit** `feat: constraints in the timetable export`

---

### Task 5: collection round

**Files:**
- Create: `lib/timetable/constraints/collect.ts`
- Test: `test/integration/timetable-collect.test.ts`

**Interfaces:**
- Consumes: Task 1 tables, `createConstraint` / `deleteConstraint`.
- Produces:

```ts
interface CollectState { status: BoardStatus; teacherDeadline: string | null }
interface TeacherResponse { teacherId: string; answeredAt: string | null; byManagement: boolean; freeDay: number | null }
getCollectState(schoolId: string, boardId: string): Promise<CollectState | null>
startCollecting(schoolId: string, boardId: string, deadline: Date, now?: Date): Promise<CollectState>
     // setup|collecting -> collecting with the deadline; deadline <= now -> deadline_past; review|published -> wrong_status
listResponses(schoolId: string, boardId: string): Promise<TeacherResponse[]>     // one per board teacher
fillInForTeacher(schoolId: string, boardId: string, teacherId: string, freeDay: number | null,
                 actorStaffId: string): Promise<TeacherResponse>
     // one withSchool transaction using insertConstraint / deleteFreeDay (Task 3): replaces the teacher's
     // free day (source "teacher"), upserts the response with by_management = true
```

- [ ] **Step 1: Failing tests:** start with a deadline tomorrow → `collecting` and the deadline stored; again with another date → deadline updated; a deadline of a minute ago → `deadline_past`, status unchanged; on a `published` board → `wrong_status`; `listResponses` lists every teacher, unanswered as `answeredAt: null`; `fillInForTeacher(…, 5, …)` then `(…, null, …)` leaves no free day and the response still answered; filling in for a non-entitled teacher with a day → `not_entitled` and no response written.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: timetable constraint collection round`

---

### Task 6: API routes

**Files:**
- Create under `app/api/v1/timetable/boards/[board]/`: `constraints/route.ts` (GET, POST), `constraints/[id]/route.ts` (PUT, DELETE), `collect/route.ts` (GET, PUT), `collect/[teacher]/route.ts` (PUT)
- Modify: `lib/timetable/api-guard.ts` (`withTimetableErrors` also maps `ConstraintError`), `lib/validations/timetable-api.ts` (response shapes)
- Test: `test/unit/timetable/constraints-routes.test.ts` (mocks as in `test/unit/timetable/routes.test.ts`)

| Route | Body | Success |
|---|---|---|
| `GET constraints` | - | `{ constraints: TtConstraint[], skipped }` (skipped from `exportConstraints`) |
| `POST constraints` | `ConstraintInput` | 201 `{ constraint }` (actor: the admin, source `management`) |
| `PUT constraints/[id]` | `ConstraintInput` | `{ constraint }`, 404 |
| `DELETE constraints/[id]` | - | 204, 404 |
| `GET collect` | - | `{ state: CollectState, responses: TeacherResponse[] }` |
| `PUT collect` | `{ deadline: ISO datetime }` | `{ state }` |
| `PUT collect/[teacher]` | `{ freeDay: 0..6 \| null }` | `{ response }` |

`ConstraintError` → `unknown_id` / `not_entitled` 400, `duplicate_free_day` / `wrong_status` 409, `limit_reached` / `deadline_past` 422.

- [ ] **Step 1: Failing tests:** demo admin `POST constraints` → 403 `demo_disabled`; `teacher_few_gaps` with `hard: true` → 400; `duplicate_free_day` → 409 `{ error: "duplicate_free_day" }`; `deadline_past` → 422; unknown board → 404 before the body is read; happy `POST` → 201 parsed by the response schema with `createConstraint` called with `{ source: "management", staffUserId: admin.id }`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: timetable constraints API`

---

### Task 7: Constraints setup tab

**Files:**
- Modify: `components/timetable/setup/SetupTabs.tsx` (`SETUP_TABS` gains `"constraints"` last), `app/(timetable)/timetable/[board]/setup/page.tsx` (loads constraints, `listCategories`, `listStaffLabels`, `exportConstraints(...).skipped` for that tab)
- Create in `components/timetable/constraints/`: `ConstraintsTab.tsx`, `ConstraintForm.tsx`, `TargetPicker.tsx`, `describe.ts`, `api.ts`
- Modify: `messages/he.json`, `messages/en.json` (`timetable.setup.tabs.constraints`, `timetable.constraints.*`)
- Test: `test/unit/timetable/constraints/describe.test.ts`, `test/unit/timetable/constraints/target-picker.test.tsx`

**Interfaces:**
- Consumes: Task 6 routes, `labelReach`, `CONSTRAINT_TYPES`.
- Produces: `describeConstraint(c: TtConstraint, names: { teacher(id): string; option(id): string; day(d): string }, t): string` (pure, one line per constraint, e.g. "פגישת צוות: מורים עם התיוג מתמטיקה, 2 שעות ברצף").

- The tab lists the board's constraints grouped by type, each with its sentence, hard/soft and weight, "לא נשלח לפותר: מגיע ל־0 מורים" or "לא זכאי ליום חופשי" when in `skipped`, edit and delete (confirm in place).
- "הוספת אילוץ" opens a type picker, then `ConstraintForm`: the type's fields (day select from `board.week`, period checkboxes for that day, number inputs within the limits), hard/soft when the type allows both, weight 1-100 when soft, and for targeted types `TargetPicker`.
- `TargetPicker`: "מורים" (searchable checkbox list, built for 250 rows, no network per row) or "תיוג" (one option, grouped by category). For a label it shows `labelReach` live: "מגיע ל־N מורים" and, when any, "M מורים בלוח בלי משתמש לא יקבלו את האילוץ" with their names in a collapsible list.
- A free day is entered per teacher (teacher select limited to entitled teachers).

- [ ] **Step 1: Failing tests.** `describe.test.ts`: a label meeting, a two-teacher unavailability with periods `[1, 2]` on day 0 and a `subject_max_per_day` give the expected Hebrew-key sentences (mock `t` returns `key:values`). `target-picker.test.tsx`: choosing option "math" with the Task 2 fixture shows `reach` with `{ count: 1 }` and `unlinked` with `{ count: 1 }`; switching to "מורים" and checking two teachers calls `onChange({ kind: "teachers", teacherIds: [t1, t2] })`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Build.** **Step 4: Run** → PASS; `tsc` and `next lint` clean.
- [ ] **Step 5: Commit** `feat: constraints setup tab`

---

### Task 8: Collect page

**Files:**
- Create: `app/(timetable)/timetable/[board]/collect/page.tsx`, `components/timetable/constraints/CollectPanel.tsx`, `components/timetable/constraints/FillInDialog.tsx`
- Modify: `app/(timetable)/timetable/[board]/setup/page.tsx` (header link "איסוף אילוצים"), `messages/*.json` (`timetable.collect.*`)
- Test: `test/unit/timetable/constraints/collect-panel.test.tsx`

- Admin only (others → `/timetable`), unknown board → not-found, as the setup page.
- Top: board status, a `datetime-local` deadline (Asia/Jerusalem via `lib/datetime.ts`) and "פתיחת איסוף" / "עדכון מועד". Errors in words.
- Table of every teacher: name, answered (date, "מולא ע״י ההנהלה" when `byManagement`), free day, entitled; filter all / answered / not answered; a count "X מתוך Y ענו".
- "מילוי במקום המורה" opens `FillInDialog`: a day select (board days, plus "אין בקשה") disabled for non-entitled teachers with the reason shown.
- After the deadline the page says unanswered teachers count as without constraints (spec "Collect").

- [ ] **Step 1: Failing tests:** with three teachers (one answered by management, one answered, one not): the count reads `{ answered: 2, total: 3 }`; filter "not answered" shows one row; filling in day 5 for the third PUTs `{ freeDay: 5 }` to `/collect/<id>` and refreshes; a past deadline submits nothing and shows `collect.errors.deadlinePast` (client check, the server check is Task 5).
- [ ] **Step 2: Run** → FAIL. **Step 3: Build.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: timetable collect page`

---

### Task 9: demo constraints and e2e

**Files:**
- Create: `lib/timetable/constraints/demo.ts`
- Modify: `scripts/seed-timetable-demo.ts` (one call after `writeDemoBoard`, one printed line `constraints: N (skipped K)`)
- Test: `test/unit/timetable/constraints/demo.test.ts`, `test/e2e/timetable-constraints.spec.ts`

**Interfaces:**
- Produces:

```ts
interface DemoConstraintTeacher { id: string; staffUserId: string | null; freeDayEntitled: boolean; subjects: string[]; isAdmin: boolean }
generateDemoConstraints(input: { teachers: DemoConstraintTeacher[]; mathOptionId: string | null;
                                 days: number[]; seed: number }): ConstraintInput[]
writeDemoConstraints(schoolId: string, boardId: string, seed: number): Promise<{ written: number; skipped: number }>
     // loads the board's teachers, blocks, subjects, staff roles and the "מקצוע"/"מתמטיקה" option, then createConstraint each
     // (free days with source "teacher" and a management-filled response)
```

Generated, deterministic for a seed (mulberry32 as in `lib/timetable/demo/generate.ts`):
- a `meeting`, 2 periods, consecutive, aimed at the label מתמטיקה when `mathOptionId` exists, else at the teachers whose `subjects` include "מתמטיקה";
- a management `meeting`, 2 periods, consecutive, aimed at the teachers with `isAdmin` (skipped when fewer than 2);
- `teacher_unavailable` for `round(teachers / 10)` teachers, one whole day each;
- a `teacher_free_day` for every entitled teacher; day by weight Friday 0.4, Sunday 0.3, the other days of `days` share 0.3;
- `class_no_gaps` hard, `subject_max_per_day` `{ max: 2 }` hard, `teacher_few_gaps` soft weight 10.

- [ ] **Step 1: Failing unit tests:** the same seed gives the same list; 40 entitled teachers give 40 free days with Friday + Sunday ≥ 50%; no math option → the math meeting is a teacher list; one admin → no management meeting; every item parses with `ConstraintInputSchema`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** and add the seed call. **Step 4: Run** → PASS.
- [ ] **Step 5: E2E** `test/e2e/timetable-constraints.spec.ts` (local stack, `ADMIN_E2E=1`, same service/board set-up and teardown by SQL as `test/e2e/timetable-setup.spec.ts`): the admin adds two teachers to board "בדיקת אילוצים", marks one entitled; adds a label meeting and sees the reach line; opens Collect, sets a deadline tomorrow, fills in Friday for the entitled teacher, sees "1 מתוך 2 ענו"; an editor opening the Collect page lands on `/timetable`; axe-core reports no serious or critical issue on both pages.
- [ ] **Step 6: Full check.** `pnpm lint && pnpm tsc && pnpm test && pnpm build`, all green (builds here: `SKIP_MIGRATIONS=1` against the local DB).
- [ ] **Step 7: Commit** `feat: demo constraints and constraints e2e`

---

## After merging

- Staging: the Vercel build applies 0025. Run `pnpm seed:timetable-demo` against staging for `kfar-galim`; the printed `constraints:` line is non-zero. Walk the Constraints tab and the Collect page as the admin.
- Done (outline): constraints appear in the export now; "the seeded ones show up in an option's broken-constraints list" needs Ofek's encoders (plan 4) and the generate screen (plan 7).
- Production: no SQL by hand; no school has the `timetable` service, so nothing is reachable there.
