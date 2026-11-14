# timeTable Setup Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A timeTable board holds a school's classes, subjects, teachers, lessons and Plata; it exports to the solver's input format; one command fills a demo board for Kfar Galim on staging; the principal can browse and edit it all.

**Architecture:** Seven RLS tables in `lib/db/schema-timetable.ts`, domain logic in `lib/timetable/` (one file per entity), the solver's JSON contract as a Zod schema, and a pure export from a board to that contract. The demo seed is a pure, seeded generator plus a thin writer that calls the same domain functions the screens use. Screens are tabs under `/timetable/[board]/setup`, backed by thin admin-only routes.

**Tech Stack:** Next.js 15 App Router, Drizzle + Postgres RLS, Zod, next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-timetable-design.md` (sections "Project 3: Data model", "Solver", "Screens 1", and the addendum of 2026-11-14)

**Two parts, two branches, two people** (see `2026-11-13-timetable-00-split.md`):
- **Part 1 (5a), Tasks 1-5, track A (Ofek):** branch `feature/timetable-setup` from `staging`. Migration number **0023**. Starts now.
- **Part 2 (5b), Tasks 6-8, track B (Maor):** branch `feature/timetable-setup-ui` from `staging`, after Part 1 and plan 2 Task 5 are merged.

## Global Constraints

- The Gantt behaves exactly as today. No file outside `lib/timetable/`, `lib/db/schema-timetable.ts`, `lib/db/client.ts`, `drizzle.config.ts`, `app/(timetable)/`, `app/api/v1/timetable/`, `components/timetable/`, `scripts/`, `messages/`, `package.json` and tests is modified.
- Every query on the new tables runs inside `withSchool(schoolId, fn)`. RLS positive access and cross-school denial are tested for every new table.
- Every timeTable route: `serviceDisabledResponse(user.schoolId, "timetable")` first, admin only, `status === "active"`, demo users 403 `demo_disabled`. Zod on request and response.
- Grades are integers 7 to 12, as in the Gantt. A class is `(grade, number)`; its display name is `t("grades.label_<grade>")` + number ("ז1").
- Days are integers 0 (Sunday) to 6. Periods are integers from 1.
- `DEFAULT_WEEK`: days 0-4 with 8 periods, day 5 with 5 periods (45 slots); period 1 starts 08:00, each period 45 minutes, back to back. Copied into a board at creation.
- The solver contract carries ids only. No names, emails or labels leave the app.
- A board's classes, subjects and teachers belong to the board, not the school.
- Never edit an existing migration file. Foreign keys from blocks to subjects, classes and teachers use the default `NO ACTION` (not `RESTRICT`), so deleting a board cascades cleanly while deleting a subject, class or teacher that a block uses fails.
- Limits (named constants in `lib/validations/timetable.ts`): `MAX_BOARDS = 10`, `MAX_CLASSES_PER_GRADE = 15`, `MAX_SUBJECTS = 80`, `MAX_TEACHERS = 400`, `MAX_WEEKLY_PERIODS = 12`, `MAX_NAME_LENGTH = 60`.
- The demo seed runs only against a local or staging database (`assertSeedTargetAllowed` from `db/seed.ts`), writes only the board named `הדגמה`, and never reads production.
- Strings through `next-intl`, `he.json` first. CSS logical properties only. No `any`. Functions under 50 lines, files under 400.
- Deferred on purpose: `tt_school_settings`, the default week on `/platform/schools`, `tt_boards.published_solution_id` (plan 7), constraints (plan 6).

## Review Focus

1. An id from another board or another school inside a block (subject, class or teacher): rejected, nothing written (Task 3).
2. A Plata whose classes are from two grades: rejected `mixed_grades` (Task 3).
3. A class given a second block of a subject it already has (for example in a Plata and alone): rejected `duplicate_lesson` (Task 3).
4. Lowering a grade's class count, or deleting a subject or teacher, while lessons use it: refused `in_use`, nothing removed (Task 2).
5. A pasted column of names with blank lines, repeated names and names already on the board: blanks dropped, repeats added once, existing ones skipped (Task 2).
6. A staff user added as a teacher twice, or a staff user of another school: one teacher row; the foreign one rejected (Task 2).
7. Running the seed twice, or with other boards in the school: exactly one `הדגמה` board; other boards untouched (Task 5).
8. A board whose lessons exceed the week (a class with 50 periods, a teacher with 60): the export still returns, with the problem listed (Task 4).

---

## Part 1 (track A)

### Task 1: tables, schema file and RLS

**Files:**
- Create: `db/migrations/0023_timetable_setup.sql`
- Create: `lib/db/schema-timetable.ts`
- Modify: `lib/db/client.ts` (schema = `{ ...baseSchema, ...profileSchema, ...timetableSchema }`), `drizzle.config.ts` (add the file to `schema`)
- Test: `test/integration/timetable-rls.test.ts`

**Interfaces:**
- Produces (Drizzle tables): `ttBoards`, `ttClasses`, `ttSubjects`, `ttTeachers`, `ttLessonBlocks`, `ttBlockClasses`, `ttBlockTeachers`

```
tt_boards          id uuid pk, school_id fk schools cascade, academic_year_id fk academic_years cascade,
                   name text, status text default 'setup' check in ('setup','collecting','review','published'),
                   week jsonb not null, teacher_deadline timestamptz null, created_at;
                   unique (school_id, name)
tt_classes         id uuid pk, school_id fk, board_id fk tt_boards cascade,
                   grade int check 7..12, number int check >= 1;   unique (board_id, grade, number)
tt_subjects        id uuid pk, school_id fk, board_id fk cascade, name text;   unique (board_id, name)
tt_teachers        id uuid pk, school_id fk, board_id fk cascade, full_name text,
                   staff_user_id fk staff_users on delete set null, null,
                   free_day_entitled bool default true, external_ref text null;
                   unique (board_id, staff_user_id) WHERE staff_user_id IS NOT NULL
tt_lesson_blocks   id uuid pk, school_id fk, board_id fk cascade, subject_id fk tt_subjects,
                   weekly_periods int check 1..12, external_ref text null;   index (board_id)
tt_block_classes   block_id fk tt_lesson_blocks cascade, class_id fk tt_classes, school_id fk;
                   pk (block_id, class_id); index (class_id)
tt_block_teachers  block_id fk tt_lesson_blocks cascade, teacher_id fk tt_teachers, school_id fk;
                   pk (block_id, teacher_id); index (teacher_id)
```

- [ ] **Step 1: Write the failing RLS test** (pattern: `test/integration/profile-rls.test.ts`). Insert one row per table for `testSchoolA` through `testDb`. For each of the seven tables assert: readable inside `withSchool(testSchoolA)`; zero rows inside `withSchool(testSchoolB)`; an insert with `schoolId: testSchoolA` inside `withSchool(testSchoolB)` rejects. One more test: deleting the board inside `withSchool(testSchoolA)` removes the rows of the other six tables. Clean up in `afterAll`.

- [ ] **Step 2: Run** `pnpm vitest run test/integration/timetable-rls.test.ts`, expect FAIL (tables missing).

- [ ] **Step 3: Write the migration.** Follow `0022_profile_categories.sql` statement by statement for each table: `ENABLE` and `FORCE ROW LEVEL SECURITY`, the `school_isolation` policy with the same `USING` / `WITH CHECK` text, `school_id` FK with `ON DELETE cascade`.

- [ ] **Step 4: Write `schema-timetable.ts`** mirroring the migration (import `schoolIsolation`, `schools`, `staffUsers`, `academicYears` from `./schema`), and wire it into `client.ts` and `drizzle.config.ts`.

- [ ] **Step 5: Run** `pnpm db:migrate && pnpm vitest run test/integration/timetable-rls.test.ts && pnpm tsc`, expect PASS.

- [ ] **Step 6: Commit** `feat: timetable setup tables`

---

### Task 2: week, boards, classes, subjects, teachers (domain)

**Files:**
- Create: `lib/timetable/week.ts`, `lib/validations/timetable.ts`, `lib/timetable/errors.ts`
- Create: `lib/timetable/boards.ts`, `lib/timetable/classes.ts`, `lib/timetable/subjects.ts`, `lib/timetable/teachers.ts`
- Test: `test/unit/timetable/week.test.ts`, `test/integration/timetable-setup.test.ts`

**Interfaces:**
- Produces:

```ts
// lib/timetable/week.ts
interface WeekPeriod { period: number; start: string; end: string }      // "HH:MM"
interface WeekDay { day: number; periods: WeekPeriod[] }                 // day 0 = Sunday
interface Week { days: WeekDay[] }
WeekSchema: z.ZodType<Week>      // 1-7 days, unique day 0..6, 1-12 periods per day numbered 1..n, start < end
DEFAULT_WEEK: Week
slotCount(week: Week): number    // DEFAULT_WEEK -> 45

// lib/timetable/errors.ts
type TimetableErrorCode = "no_active_year" | "duplicate_name" | "limit_reached" | "in_use"
  | "unknown_id" | "mixed_grades" | "duplicate_lesson";
class TimetableError extends Error { constructor(readonly code: TimetableErrorCode) }

// lib/timetable/boards.ts
type BoardStatus = "setup" | "collecting" | "review" | "published";
interface Board { id: string; name: string; status: BoardStatus; week: Week; academicYearId: string }
createBoard(schoolId: string, name: string): Promise<Board>     // active academic year, DEFAULT_WEEK
listBoards(schoolId: string): Promise<Board[]>                  // newest first
getBoard(schoolId: string, boardId: string): Promise<Board | null>
deleteBoard(schoolId: string, boardId: string): Promise<boolean>

// lib/timetable/classes.ts
interface TtClass { id: string; grade: number; number: number }
listClasses(schoolId: string, boardId: string): Promise<TtClass[]>        // by grade, number
setGradeClassCount(schoolId: string, boardId: string, grade: number, count: number): Promise<TtClass[]>

// lib/timetable/subjects.ts
interface TtSubject { id: string; name: string }
listSubjects(schoolId: string, boardId: string): Promise<TtSubject[]>     // by name
addSubjects(schoolId: string, boardId: string, names: string[]): Promise<TtSubject[]>   // returns the created ones
renameSubject(schoolId: string, id: string, name: string): Promise<TtSubject | null>
deleteSubject(schoolId: string, id: string): Promise<boolean>

// lib/timetable/teachers.ts
interface TtTeacher { id: string; fullName: string; staffUserId: string | null; freeDayEntitled: boolean }
listTeachers(schoolId: string, boardId: string): Promise<TtTeacher[]>     // by fullName
addTeachers(schoolId: string, boardId: string, names: string[]): Promise<TtTeacher[]>
addTeachersFromStaff(schoolId: string, boardId: string, staffUserIds: string[]): Promise<TtTeacher[]>
updateTeacher(schoolId: string, id: string,
  patch: { fullName?: string; freeDayEntitled?: boolean; staffUserId?: string | null }): Promise<TtTeacher | null>
deleteTeacher(schoolId: string, id: string): Promise<boolean>
```

- `createBoard`: reads the active year with `getActiveAcademicYearId` from `lib/db/schools.ts` **before** entering `withSchool` (`schools` is not readable inside it); none → `no_active_year`. Name clash → `duplicate_name`. Eleventh board → `limit_reached`.
- `setGradeClassCount`: adds the missing numbers `1..count`; removes numbers above `count`. If any class to remove is in a block → `in_use`, and nothing is removed.
- `addSubjects` / `addTeachers`: trim each name, drop blanks, drop repeats within the input, cut nothing silently (a name over `MAX_NAME_LENGTH` is a Zod error at the route, not here). `addSubjects` also skips names already on the board. Teachers may share a name; `addTeachers` does not skip existing names.
- `addTeachersFromStaff`: each id must be an active staff user of this school (reuse `isActiveStaffOfSchool` from `lib/profile/staff-labels.ts`), else `unknown_id`. Staff already linked on this board are skipped. `full_name` is copied from the staff user.
- `deleteSubject` / `deleteTeacher`: a foreign-key violation (Postgres code `23503`) → `in_use`.
- Over a limit → `limit_reached`.

- [ ] **Step 1: Failing unit test** `test/unit/timetable/week.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_WEEK, WeekSchema, slotCount } from "@/lib/timetable/week";

describe("week", () => {
  it("default week is Sunday-Thursday 8 periods and Friday 5", () => {
    expect(DEFAULT_WEEK.days.map((d) => [d.day, d.periods.length])).toEqual(
      [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 5]]);
    expect(slotCount(DEFAULT_WEEK)).toBe(45);
    expect(DEFAULT_WEEK.days[0].periods[0]).toEqual({ period: 1, start: "08:00", end: "08:45" });
    expect(WeekSchema.safeParse(DEFAULT_WEEK).success).toBe(true);
  });
  it("rejects a repeated day, a gap in period numbers and end before start", () => {
    const p = { period: 1, start: "08:00", end: "08:45" };
    expect(WeekSchema.safeParse({ days: [{ day: 0, periods: [p] }, { day: 0, periods: [p] }] }).success).toBe(false);
    expect(WeekSchema.safeParse({ days: [{ day: 0, periods: [{ ...p, period: 2 }] }] }).success).toBe(false);
    expect(WeekSchema.safeParse({ days: [{ day: 0, periods: [{ ...p, end: "07:00" }] }] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement `week.ts`. Step 4: Run, expect PASS.**

- [ ] **Step 5: Failing integration tests** `test/integration/timetable-setup.test.ts` (school A needs an active academic year; create one in `beforeAll` if `getActiveAcademicYearId(testSchoolA)` is null)
  - `createBoard` returns status `setup` and `week` equal to `DEFAULT_WEEK`; the same name again rejects `duplicate_name`; `listBoards(testSchoolB)` is empty
  - `setGradeClassCount(…, 7, 4)` returns ז1 to ז4; then `(…, 7, 2)` leaves two; then `(…, 7, 3)` returns numbers 1, 2, 3
  - `addSubjects(["מתמטיקה", " ", "מתמטיקה", "אנגלית "])` creates two; calling it again with `["אנגלית", "ספרות"]` creates one (Review Focus 5)
  - `addTeachersFromStaff` twice with the same staff id leaves one teacher row; a staff id of school B rejects `unknown_id` (Review Focus 6)
  - with a block inserted through `testDb` that uses a class, a subject and a teacher: `setGradeClassCount` below that class, `deleteSubject` and `deleteTeacher` each reject `in_use`, and the row counts are unchanged (Review Focus 4)
  - `deleteBoard` returns true and `listClasses` for it is empty

- [ ] **Step 6: Run, expect FAIL. Step 7: Implement the validation, error and four domain files. Step 8: Run, expect PASS; `pnpm tsc` clean.**

- [ ] **Step 9: Commit** `feat: timetable boards, classes, subjects and teachers`

---

### Task 3: lesson blocks and Plata (domain)

**Files:**
- Create: `lib/timetable/blocks.ts`
- Test: `test/integration/timetable-blocks.test.ts`

**Interfaces:**
- Consumes: Task 2 types and `TimetableError`
- Produces:

```ts
interface TtBlock { id: string; subjectId: string; weeklyPeriods: number; classIds: string[]; teacherIds: string[] }
interface BlockInput { subjectId: string; weeklyPeriods: number; classIds: string[]; teacherIds: string[] }
// BlockInputSchema in lib/validations/timetable.ts: weeklyPeriods 1..MAX_WEEKLY_PERIODS,
// classIds 1..MAX_CLASSES_PER_GRADE unique, teacherIds 0..MAX_CLASSES_PER_GRADE unique

listBlocks(schoolId: string, boardId: string): Promise<TtBlock[]>
createBlock(schoolId: string, boardId: string, input: BlockInput): Promise<TtBlock>
replaceBlock(schoolId: string, id: string, input: BlockInput): Promise<TtBlock | null>
deleteBlock(schoolId: string, id: string): Promise<boolean>
```

- An ordinary lesson is a block with one class. A Plata is a block with two or more classes. There is no separate Plata table.
- A block may have no teacher yet (the principal assigns it later); the export reports it.
- Validation, shared by create and replace, in one transaction with the write:
  - subject, every class and every teacher belong to the block's board → else `unknown_id`
  - all classes have the same grade → else `mixed_grades`
  - no class of the block already has another block with the same subject → else `duplicate_lesson`

- [ ] **Step 1: Failing integration tests**
  - an ordinary lesson (ז1, מתמטיקה, 5 periods, one teacher) round-trips through `listBlocks`
  - a Plata (ז1, ז2, ז3 with three teachers) round-trips with all ids
  - a class id from a second board of the same school rejects `unknown_id`; so does a subject id of school B (Review Focus 1)
  - classes ז1 and ח1 in one block reject `mixed_grades` (Review Focus 2)
  - ז1 already in a מתמטיקה Plata, then an ordinary מתמטיקה lesson for ז1 rejects `duplicate_lesson`; the same class with אנגלית succeeds (Review Focus 3)
  - `replaceBlock` moving ז3 out of the Plata leaves two classes, and ז3 can then get its own מתמטיקה block
  - `replaceBlock` of a block with itself (same input) succeeds: the duplicate check ignores the block being replaced

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** `feat: timetable lesson blocks and plata`

---

### Task 4: solver contract and export

**Files:**
- Create: `lib/timetable/solver-contract.ts`, `lib/timetable/input-problems.ts`, `lib/timetable/export.ts`
- Create: `solver/fixtures/tiny.json`
- Test: `test/unit/timetable/solver-contract.test.ts`, `test/unit/timetable/input-problems.test.ts`, `test/integration/timetable-export.test.ts`

**Interfaces:**
- Consumes: `Week`, `WeekSchema`, `slotCount`; the list functions of Tasks 2 and 3
- Produces:

```ts
// lib/timetable/solver-contract.ts  (Zod schemas with the same names + "Schema")
type WeightProfile = "teachers" | "classes" | "balanced";
interface SolverBlock { id: string; subjectId: string | null; weeklyPeriods: number;
                        classIds: string[]; teacherIds: string[]; consecutive: boolean }
interface SolverConstraint { id: string; type: string; hard: boolean; weight: number;
                             params: Record<string, unknown> }
interface SolverPlacement { blockId: string; day: number; period: number; pinned: boolean }
interface SolverInput {
  version: 1; mode: "solve" | "evaluate"; profile: WeightProfile; timeLimitSeconds: number;
  week: Week; classIds: string[]; teacherIds: string[];
  blocks: SolverBlock[]; constraints: SolverConstraint[]; placements: SolverPlacement[];
}
interface SolverViolation { constraintId: string | null; type: string; hard: boolean; count: number;
                            teacherIds: string[]; classIds: string[] }
interface SolverOutput { version: 1; status: "ok" | "failed"; error?: string; score: number;
                         placements: Array<{ blockId: string; day: number; period: number }>;
                         violations: SolverViolation[] }

// lib/timetable/input-problems.ts  (pure)
type InputProblem =
  | { code: "block_without_teacher"; blockId: string }
  | { code: "class_overbooked"; classId: string; periods: number; slots: number }
  | { code: "teacher_overbooked"; teacherId: string; periods: number; slots: number };
findInputProblems(input: SolverInput): InputProblem[]

// lib/timetable/export.ts
buildSolverInput(schoolId: string, boardId: string,
  opts?: { mode?: "solve" | "evaluate"; profile?: WeightProfile; timeLimitSeconds?: number },
): Promise<{ input: SolverInput; problems: InputProblem[] } | null>     // null: board not found
```

- Defaults: `mode: "solve"`, `profile: "balanced"`, `timeLimitSeconds: 60`. `constraints` and `placements` are `[]` until plans 6 and 7 fill them. Every exported block has `consecutive: false`; a block without classes (a meeting) arrives with plan 6.
- `SolverInputSchema` also checks: every id in a block exists in `classIds` / `teacherIds`; block ids are unique.
- `violations` with `constraintId: null` are the built-in rules (`type: "teacher_clash" | "class_clash" | "unplaced"`).
- `solver/fixtures/tiny.json`: one `SolverInput` with `DEFAULT_WEEK`, 2 classes, 3 teachers, 4 blocks (one of them a two-class Plata with two teachers), no constraints. Ids are fixed lowercase UUIDs. Plan 4 uses it as the solver's golden test.

- [ ] **Step 1: Failing unit tests**

```ts
// solver-contract.test.ts
it("the tiny fixture is a valid solver input", () => {
  expect(SolverInputSchema.safeParse(tiny).success).toBe(true);   // import tiny from "@/solver/fixtures/tiny.json"
});
it("rejects a block that names an unknown class", () => {
  const bad = { ...tiny, blocks: [{ ...tiny.blocks[0], classIds: ["00000000-0000-4000-8000-00000000dead"] }] };
  expect(SolverInputSchema.safeParse(bad).success).toBe(false);
});
it("contains no names", () => {
  expect(JSON.stringify(tiny)).not.toMatch(/name/i);
});

// input-problems.test.ts
it("reports nothing for the tiny fixture", () => {
  expect(findInputProblems(tiny)).toEqual([]);
});
it("reports a block with no teacher", () => {
  const input = { ...tiny, blocks: [{ ...tiny.blocks[0], teacherIds: [] }, ...tiny.blocks.slice(1)] };
  expect(findInputProblems(input)).toContainEqual({ code: "block_without_teacher", blockId: tiny.blocks[0].id });
});
it("reports a class with more periods than the week has slots", () => {
  const big = { ...tiny.blocks[0], id: crypto.randomUUID(), weeklyPeriods: 12 };
  const input = { ...tiny, blocks: [...tiny.blocks, ...[1, 2, 3, 4].map(() => ({ ...big, id: crypto.randomUUID() }))] };
  expect(findInputProblems(input).some((p) => p.code === "class_overbooked" && p.slots === 45)).toBe(true);
});
```

Add the matching `teacher_overbooked` test in the same style.

- [ ] **Step 2: Run, expect FAIL. Step 3: Write the fixture, the contract and `findInputProblems`. Step 4: Run, expect PASS.**

- [ ] **Step 5: Failing integration test** `timetable-export.test.ts`: build a board with the Task 2 and 3 functions (2 classes, 2 subjects, 2 teachers, 3 blocks, one without a teacher); `buildSolverInput` returns an `input` that `SolverInputSchema` accepts, with the same block ids as `listBlocks`, and `problems` holding exactly that one `block_without_teacher` (Review Focus 8 is covered by the unit tests above); an unknown board id returns `null`; school B asking for school A's board returns `null`.

- [ ] **Step 6: Implement `export.ts`, run, expect PASS.**

- [ ] **Step 7: Commit** `feat: solver contract and board export`

---

### Task 5: demo seed

**Files:**
- Create: `lib/timetable/demo/generate.ts`, `lib/timetable/demo/curriculum.ts`, `lib/timetable/demo/write.ts`
- Create: `scripts/seed-timetable-demo.ts`
- Modify: `package.json` (`"seed:timetable-demo": "tsx scripts/seed-timetable-demo.ts"`)
- Test: `test/unit/timetable/demo-generate.test.ts`, `test/integration/timetable-demo-seed.test.ts`

**Interfaces:**
- Consumes: the domain functions of Tasks 2 and 3, `buildSolverInput`, `findInputProblems`; `listStaffUsers` (`lib/db/staff.ts`), `listCategories`, `listStaffLabels` (`lib/profile/`); `assertSeedTargetAllowed` (`db/seed.ts`)
- Produces:

```ts
// lib/timetable/demo/curriculum.ts
DEMO_BOARD_NAME = "הדגמה"
DEMO_SUBJECT_CATEGORY = "מקצוע"
DEMO_CLASS_COUNTS: Record<number, number> = { 7: 4, 8: 4, 9: 4, 10: 4, 11: 4, 12: 4 }   // placeholder until Ofek supplies Kfar Galim's
MAX_TEACHER_LOAD = 22
DEMO_CURRICULUM: Array<{ name: string; weeklyPeriods: number; plata: boolean }>

// lib/timetable/demo/generate.ts  (pure, no I/O)
interface DemoStaff { staffUserId: string; fullName: string; subjects: string[] }   // subjects = the person's labels in the subject category
interface DemoTeacher { key: string; fullName: string; staffUserId: string | null }
interface DemoBlock { subject: string; weeklyPeriods: number;
                      classes: Array<{ grade: number; number: number }>; teacherKeys: string[] }
interface DemoPlan { classCounts: Record<number, number>; subjects: string[];
                     teachers: DemoTeacher[]; blocks: DemoBlock[] }
generateDemoPlan(opts: { staff: DemoStaff[]; classCounts: Record<number, number>;
                         seed: number; anonymize: boolean }): DemoPlan

// lib/timetable/demo/write.ts
writeDemoBoard(schoolId: string, plan: DemoPlan): Promise<{ boardId: string }>
loadDemoStaff(schoolId: string, subjectCategory: string): Promise<DemoStaff[]>
```

- `DEMO_CURRICULUM` (same for every grade; 31 of 45 slots): מתמטיקה 5 plata, אנגלית 4 plata, מדעים 4, עברית 3, ספרות 2, היסטוריה 2, תנ"ך 2, אזרחות 2, גאוגרפיה 2, חינוך גופני 2, אמנות 2, חינוך 1.
- `generateDemoPlan`, in this order:
  1. Shuffle `staff` with a seeded generator (mulberry32 on `seed`; no dependency, no `Math.random`).
  2. Each staff member becomes a teacher. Their subjects are their labels that name a curriculum subject. A staff member with none gets one subject: the curriculum subject with the fewest teachers so far.
  3. Build the lessons: for each grade and subject, one block per class; but for a `plata` subject in a grade with 3 or more classes, one block holding every class except the last, with as many teachers as classes in it, plus an ordinary block for the last class.
  4. Give each block its teachers: among teachers of that subject, the one with the lowest load whose load plus the block's periods stays within `MAX_TEACHER_LOAD`. When there is none, add a placeholder teacher (`staffUserId: null`, name "מורה נוסף N") for that subject.
  5. `anonymize: true`: every teacher's `fullName` becomes "מורה N" in final order; `staffUserId` is kept, so labels still reach them.
- `writeDemoBoard`: `deleteBoard` for an existing board named `DEMO_BOARD_NAME` (found through `listBoards`), then `createBoard`, `setGradeClassCount`, `addSubjects`, `addTeachersFromStaff` / `addTeachers`, `updateTeacher` for anonymized names, `createBlock`. No direct table access.
- `loadDemoStaff`: active staff of the school; `subjects` = labels of the active category named `subjectCategory`; `[]` for everyone when the category does not exist.
- Script: `pnpm seed:timetable-demo [slug] [--anonymize] [--seed=<n>] [--subject-category=<name>]`. Defaults: `kfar-galim`, seed `1`, `DEMO_SUBJECT_CATEGORY`. It calls `assertSeedTargetAllowed(process.env.DATABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL)` first, finds the school by slug (pattern: `scripts/seed-demo-events.ts`), writes the board, runs `buildSolverInput`, and prints counts only: classes, subjects, teachers (linked, placeholder, without a subject label), blocks, problems. It prints one warning line when the school's `services` lacks `timetable` ("turn it on at /platform/schools"). It prints no names and no tokens.

- [ ] **Step 1: Failing unit tests** `demo-generate.test.ts` (fixture: 10 staff, three labelled "מתמטיקה", two "אנגלית", five with no label; `classCounts` `{ 7: 3, 8: 2 }`)
  - the same seed gives a deeply equal plan; seed 2 gives a different teacher order
  - a staff member labelled "מתמטיקה" appears only in מתמטיקה blocks
  - grade 7 מתמטיקה is one block of classes 1 and 2 with two teachers, plus one block of class 3; grade 8 מתמטיקה is two ordinary blocks
  - no teacher's total periods exceed `MAX_TEACHER_LOAD`; every block has at least one teacher; every class totals 31 periods
  - with `anonymize: true` no `fullName` from the input appears anywhere in `JSON.stringify(plan)`, and `staffUserId`s are kept
  - with `staff: []` the plan still covers every lesson, with placeholder teachers only

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement `curriculum.ts` and `generate.ts`. Step 4: Run, expect PASS.**

- [ ] **Step 5: Failing integration test** `timetable-demo-seed.test.ts`: create a second board "אחר" in school A; `writeDemoBoard` twice; assert exactly one board named `הדגמה`, "אחר" still there with its rows (Review Focus 7), and `buildSolverInput` for the demo board returns `problems: []`. Also unit-test the script's guard: `assertSeedTargetAllowed("postgres://x@db.prod.example/postgres")` throws.

- [ ] **Step 6: Implement `write.ts` and the script, run, expect PASS.**

- [ ] **Step 7: Full check.** `pnpm lint && pnpm tsc && pnpm test && pnpm build`, all green.

- [ ] **Step 8: Commit** `feat: timetable demo seed`

- [ ] **Step 9 (after merging into `staging`, by Ofek, not by an agent):** on `/platform/schools` on staging, give `kfar-galim` the `timetable` service; with `.env.staging.local` loaded run `pnpm seed:timetable-demo`; confirm the printed problem count is 0.

---

## Part 2 (track B)

### Task 6: API routes

**Files:**
- Create: `lib/timetable/api-guard.ts`
- Create under `app/api/v1/timetable/boards/`: `route.ts` (GET, POST), `[board]/route.ts` (GET), `[board]/classes/route.ts` (GET, PUT), `[board]/subjects/route.ts` (GET, POST), `[board]/subjects/[id]/route.ts` (PATCH, DELETE), `[board]/teachers/route.ts` (GET, POST), `[board]/teachers/[id]/route.ts` (PATCH, DELETE), `[board]/blocks/route.ts` (GET, POST), `[board]/blocks/[id]/route.ts` (PUT, DELETE)
- Test: `test/unit/timetable/routes.test.ts`

**Interfaces:**
- Consumes: every function of Tasks 2-4
- Produces:

```ts
// lib/timetable/api-guard.ts  (model: lib/profile/api-guard.ts)
requireTimetableAdmin(write: boolean): Promise<{ user: SchoolUser } | { response: NextResponse }>
   // 401 signed out; 403 not an active admin; 403 service_disabled; 403 demo_disabled on writes
timetableErrorResponse(error: unknown): NextResponse | null
   // TimetableError -> duplicate_name 409, in_use 409, limit_reached 422, no_active_year 422,
   //                   unknown_id / mixed_grades / duplicate_lesson 400; body { error: code }
```

| Route | Body | Success |
|---|---|---|
| `GET boards` | - | `{ boards: Board[] }` |
| `POST boards` | `{ name }` | 201 `{ board }` |
| `GET boards/[board]` | - | `{ board, problems: InputProblem[] }` (from `buildSolverInput`), 404 |
| `GET …/classes` | - | `{ classes: TtClass[] }` |
| `PUT …/classes` | `{ grade, count }` | `{ classes }` |
| `GET …/subjects` | - | `{ subjects }` |
| `POST …/subjects` | `{ names: string[] }` (1-200 names, each 1-60 chars) | 201 `{ created: TtSubject[] }` |
| `PATCH …/subjects/[id]` | `{ name }` | `{ subject }`, 404 |
| `DELETE …/subjects/[id]` | - | 204, 404 |
| `GET …/teachers` | - | `{ teachers }` |
| `POST …/teachers` | `{ names: string[] }` or `{ staffUserIds: string[] }` (exactly one of the two) | 201 `{ created: TtTeacher[] }` |
| `PATCH …/teachers/[id]` | `{ fullName?, freeDayEntitled?, staffUserId? }` | `{ teacher }`, 404 |
| `DELETE …/teachers/[id]` | - | 204, 404 |
| `GET …/blocks` | - | `{ blocks: TtBlock[] }` |
| `POST …/blocks` | `BlockInput` | 201 `{ block }` |
| `PUT …/blocks/[id]` | `BlockInput` | `{ block }`, 404 |
| `DELETE …/blocks/[id]` | - | 204, 404 |

Every `[board]` route answers 404 when `getBoard(user.schoolId, board)` is null, before anything else.

- [ ] **Step 1: Failing route tests** (mock `getStaffUser`, `getSchoolById` and the domain modules, as `test/unit/admin/categories-route.test.ts` does): signed out → 401; editor → 403; admin of a school without `timetable` → 403 `service_disabled`; demo admin POST → 403 `demo_disabled`; a 61-character subject name → 400; `TimetableError("in_use")` from `deleteSubject` → 409 `{ error: "in_use" }`; `TimetableError("mixed_grades")` → 400; `POST teachers` with both `names` and `staffUserIds` → 400; an unknown board → 404; a happy `POST blocks` → 201 with the body parsed by a Zod response schema.

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement the guard and the routes. Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** `feat: timetable setup API`

---

### Task 7: board list and the Classes, Subjects, Teachers tabs

**Files:**
- Modify: `app/(timetable)/timetable/page.tsx` (board list replaces the placeholder)
- Create: `app/(timetable)/timetable/[board]/setup/page.tsx`
- Create in `components/timetable/setup/`: `BoardList.tsx`, `SetupTabs.tsx`, `ClassesTab.tsx`, `SubjectsTab.tsx`, `TeachersTab.tsx`, `PasteNamesDialog.tsx`, `AddFromStaffDialog.tsx`, `className.ts`
- Modify: `messages/he.json`, `messages/en.json` (`timetable.boards.*`, `timetable.setup.*`)
- Test: `test/unit/timetable/paste-names.test.tsx`, `test/unit/timetable/class-name.test.ts`

**Interfaces:**
- Consumes: the Task 6 routes; `listCategories`, `listStaffLabels`, `listStaffUsers` (loaded by the page for "add from staff")
- Produces: `className(grade: number, number: number, gradeLabel: (grade: number) => string): string` ("ז1"); `<PasteNamesDialog title onSubmit={(names: string[]) => Promise<void>} />`, reused by Subjects and Teachers

- `/timetable`: admins see their boards and a "לוח חדש" form (name only); a non-admin sees the existing `timetable.shell.empty` text. A board links to `/timetable/<id>/setup`.
- `/timetable/[board]/setup?tab=classes|subjects|teachers|lessons|plata` (default `classes`). Admin only (others → `/timetable`); unknown board → not-found. The page is a Server Component that loads the tab's data and passes it down; tabs call the routes and then `router.refresh()`.
- Classes tab: one row per grade 7-12 with a number input (0 to 15) and the resulting class names beside it. An `in_use` answer shows "יש שיעורים לכיתה הזו".
- Subjects tab: a list with inline rename and delete, and "הדבקת רשימה" opening `PasteNamesDialog` (a textarea, one name per line).
- Teachers tab: a table (name, linked staff user, "זכאי ליום חופשי" checkbox), "הדבקת רשימה", and "הוספה מהצוות" opening `AddFromStaffDialog`: the school's active staff not yet on the board, filterable by one profile label, with checkboxes and "select all shown". Built for 250 rows: no per-row network call on render.
- UI model for lists, dialogs and error display: `components/admin/event-types/EventTypeManager.tsx`.

- [ ] **Step 1: Failing tests.** `class-name.test.ts`: `className(7, 1, (g) => "ז")` is `"ז1"`. `paste-names.test.tsx`: typing "מתמטיקה\n\n אנגלית \nמתמטיקה" and submitting calls `onSubmit(["מתמטיקה", "אנגלית"])`; the submit button is disabled for an empty textarea; a line longer than 60 characters shows an error and does not submit.

- [ ] **Step 2: Run, expect FAIL. Step 3: Build the pages and components. Step 4: Run, expect PASS; `pnpm tsc && pnpm lint` clean.**

- [ ] **Step 5: Commit** `feat: timetable boards and setup tabs`

---

### Task 8: Lessons grid, Plata tab, readiness, e2e

**Files:**
- Create in `components/timetable/setup/`: `LessonsTab.tsx`, `LessonCell.tsx`, `PlataTab.tsx`, `PlataEditor.tsx`, `ReadinessPanel.tsx`, `lessons-grid.ts`
- Modify: `app/(timetable)/timetable/[board]/setup/page.tsx`, `messages/*.json`
- Test: `test/unit/timetable/lessons-grid.test.ts`, `test/e2e/timetable-setup.spec.ts`

**Interfaces:**
- Consumes: `TtBlock`, `TtClass`, `TtSubject`, `TtTeacher`, `InputProblem`; the blocks routes
- Produces:

```ts
// components/timetable/setup/lessons-grid.ts  (pure)
type Cell = { kind: "empty" } | { kind: "lesson"; block: TtBlock } | { kind: "plata"; block: TtBlock };
buildLessonsGrid(classes: TtClass[], subjects: TtSubject[], blocks: TtBlock[]): Map<string, Cell>   // key `${classId}:${subjectId}`
classTotals(classes: TtClass[], blocks: TtBlock[]): Map<string, number>                            // classId -> weekly periods
```

- Lessons tab: a grade picker, then a grid with that grade's classes as columns and subjects as rows. A cell holds weekly periods and one teacher (a searchable select). Saving a cell creates, replaces or (periods cleared) deletes that class's ordinary block. A cell whose class is in a Plata for that subject is read-only and reads "בהקבצה". The last row shows each class's total against the week's slot count (45), red when over. Keyboard: arrows and Tab move between cells, Enter saves.
- Plata tab: the board's blocks with two or more classes, grouped by grade. The editor picks a grade, a subject, weekly periods, the classes in the Plata and its teachers. Errors `mixed_grades` and `duplicate_lesson` are shown in words.
- Readiness panel (above the tabs): the `problems` from `GET boards/[board]`, in words, each linking to the tab that fixes it; "מוכן ליצירת מערכת" when empty.

- [ ] **Step 1: Failing unit tests** `lessons-grid.test.ts`: a one-class block gives a `lesson` cell; a three-class block gives a `plata` cell for each of its classes; a class and subject with no block gives `empty`; `classTotals` counts a Plata's periods once per class in it.

- [ ] **Step 2: Run, expect FAIL. Step 3: Build. Step 4: Run, expect PASS.**

- [ ] **Step 5: E2E** `test/e2e/timetable-setup.spec.ts`, local stack with `TEST_LOGIN_ENABLED`, on the seed's `demo-school`. No existing spec turns the service on (`test/e2e/services.spec.ts` only covers a Gantt-only school), so this spec's `beforeAll` calls `updateSchoolServices` from `lib/db/schools.ts` with `["gantt", "timetable"]` and its `afterAll` restores `["gantt"]` and deletes board "בדיקה":
  - the admin creates board "בדיקה", sets grade ז to 3 classes, pastes two subjects and two teachers
  - in Lessons, gives ז1 מתמטיקה 5 periods with the first teacher; the readiness panel no longer lists that lesson
  - in Plata, puts ז2 and ז3 into an אנגלית Plata; the Lessons grid shows "בהקבצה" in both cells
  - an editor of the same school opening `/timetable/<id>/setup` lands on `/timetable`
  - axe-core reports no serious or critical issue on the setup page

- [ ] **Step 6: Full check.** `pnpm lint && pnpm tsc && pnpm test && pnpm build`, all green; the existing Playwright suite unchanged.

- [ ] **Step 7: Commit** `feat: lessons grid, plata and setup readiness`

---

## After merging

- Part 1: no visible change for any school. Staging: Step 9 of Task 5.
- Part 2: on staging, open the seeded `הדגמה` board as the `kfar-galim` admin and walk the five tabs. With 24 classes and about 40 teachers every tab should respond without a visible wait.
- Production: no SQL, and no school has the `timetable` service, so nothing is reachable there.
