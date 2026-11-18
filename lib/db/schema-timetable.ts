import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { academicYears, schoolIsolation, schools, staffUsers } from "./schema";

/**
 * timeTable setup data (migration 0023). A board owns its classes, subjects and
 * teachers. Blocks reference them with NO ACTION: a board delete cascades, a
 * delete of something a block uses fails.
 */
const schoolId = () =>
  uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" });

export const ttBoards = pgTable(
  "tt_boards",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: schoolId(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id, { onDelete: "cascade" }),
    name: text().notNull(),
    status: text({ enum: ["setup", "collecting", "review", "published"] }).notNull().default("setup"),
    week: jsonb().notNull(),
    teacherDeadline: timestamp("teacher_deadline", { withTimezone: true }),
    // FK to tt_solutions lives in migration 0026; not declared here to avoid a circular import.
    publishedSolutionId: uuid("published_solution_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("tt_boards_school_name_key").on(t.schoolId, t.name),
    check("tt_boards_status_check", sql`${t.status} IN ('setup', 'collecting', 'review', 'published')`),
    schoolIsolation,
  ],
);

const boardId = () =>
  uuid("board_id")
    .notNull()
    .references(() => ttBoards.id, { onDelete: "cascade" });

export const ttClasses = pgTable(
  "tt_classes",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: schoolId(),
    boardId: boardId(),
    grade: integer().notNull(),
    number: integer().notNull(),
  },
  (t) => [
    uniqueIndex("tt_classes_board_grade_number_key").on(t.boardId, t.grade, t.number),
    check("tt_classes_grade_check", sql`${t.grade} BETWEEN 7 AND 12`),
    check("tt_classes_number_check", sql`${t.number} >= 1`),
    schoolIsolation,
  ],
);

export const ttSubjects = pgTable(
  "tt_subjects",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: schoolId(),
    boardId: boardId(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex("tt_subjects_board_name_key").on(t.boardId, t.name), schoolIsolation],
);

export const ttTeachers = pgTable(
  "tt_teachers",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: schoolId(),
    boardId: boardId(),
    fullName: text("full_name").notNull(),
    staffUserId: uuid("staff_user_id").references(() => staffUsers.id, { onDelete: "set null" }),
    freeDayEntitled: boolean("free_day_entitled").notNull().default(true),
    externalRef: text("external_ref"),
  },
  (t) => [
    uniqueIndex("tt_teachers_board_staff_key")
      .on(t.boardId, t.staffUserId)
      .where(sql`${t.staffUserId} IS NOT NULL`),
    schoolIsolation,
  ],
);

export const ttLessonBlocks = pgTable(
  "tt_lesson_blocks",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: schoolId(),
    boardId: boardId(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => ttSubjects.id),
    weeklyPeriods: integer("weekly_periods").notNull(),
    externalRef: text("external_ref"),
  },
  (t) => [
    index("tt_lesson_blocks_board_idx").on(t.boardId),
    check("tt_lesson_blocks_weekly_periods_check", sql`${t.weeklyPeriods} BETWEEN 1 AND 12`),
    schoolIsolation,
  ],
);

export const ttBlockClasses = pgTable(
  "tt_block_classes",
  {
    blockId: uuid("block_id")
      .notNull()
      .references(() => ttLessonBlocks.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => ttClasses.id),
    schoolId: schoolId(),
  },
  (t) => [
    primaryKey({ name: "tt_block_classes_pk", columns: [t.blockId, t.classId] }),
    index("tt_block_classes_class_idx").on(t.classId),
    schoolIsolation,
  ],
);

export const ttBlockTeachers = pgTable(
  "tt_block_teachers",
  {
    blockId: uuid("block_id")
      .notNull()
      .references(() => ttLessonBlocks.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => ttTeachers.id),
    schoolId: schoolId(),
  },
  (t) => [
    primaryKey({ name: "tt_block_teachers_pk", columns: [t.blockId, t.teacherId] }),
    index("tt_block_teachers_teacher_idx").on(t.teacherId),
    schoolIsolation,
  ],
);

/**
 * Constraints (migration 0025, plan 6). `params` is stored as entered (a target
 * may be a profile label); the export resolves it to teacher ids. `type` is
 * checked by the app, so adding a type needs no migration.
 */
export const ttConstraints = pgTable(
  "tt_constraints",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: schoolId(),
    boardId: boardId(),
    type: text().notNull(),
    hardness: text({ enum: ["hard", "soft"] }).notNull(),
    weight: integer().notNull(),
    params: jsonb().notNull(),
    source: text({ enum: ["teacher", "management"] }).notNull(),
    teacherId: uuid("teacher_id").references(() => ttTeachers.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => staffUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tt_constraints_board_idx").on(t.boardId),
    uniqueIndex("tt_constraints_free_day_key")
      .on(t.boardId, t.teacherId)
      .where(sql`${t.type} = 'teacher_free_day'`),
    check("tt_constraints_hardness_check", sql`${t.hardness} IN ('hard', 'soft')`),
    check("tt_constraints_source_check", sql`${t.source} IN ('teacher', 'management')`),
    check("tt_constraints_weight_check", sql`${t.weight} BETWEEN 1 AND 100`),
    schoolIsolation,
  ],
);

/** A teacher who answered the collection round (or was filled in for by management). */
export const ttTeacherResponses = pgTable(
  "tt_teacher_responses",
  {
    boardId: boardId(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => ttTeachers.id, { onDelete: "cascade" }),
    schoolId: schoolId(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).defaultNow().notNull(),
    byManagement: boolean("by_management").notNull(),
    answeredBy: uuid("answered_by").references(() => staffUsers.id, { onDelete: "set null" }),
  },
  (t) => [primaryKey({ name: "tt_teacher_responses_pk", columns: [t.boardId, t.teacherId] }), schoolIsolation],
);

/**
 * Generation (migration 0026, plan 7). A run yields up to three solutions, one per
 * profile. `blockId` has no FK: a meeting block's id is its constraint's id.
 */
export const ttRuns = pgTable(
  "tt_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: schoolId(),
    boardId: boardId(),
    status: text({ enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
    error: text(),
    input: jsonb().notNull(),
    requestedBy: uuid("requested_by").references(() => staffUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("tt_runs_board_created_idx").on(t.boardId, t.createdAt),
    check("tt_runs_status_check", sql`${t.status} IN ('queued', 'running', 'done', 'failed')`),
    schoolIsolation,
  ],
);

export const ttSolutions = pgTable(
  "tt_solutions",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: schoolId(),
    runId: uuid("run_id")
      .notNull()
      .references(() => ttRuns.id, { onDelete: "cascade" }),
    boardId: boardId(),
    profile: text({ enum: ["teachers", "classes", "balanced"] }).notNull(),
    status: text({ enum: ["ok", "failed"] }).notNull(),
    error: text(),
    score: doublePrecision().notNull().default(0),
    violations: jsonb().notNull().default(sql`'[]'::jsonb`),
    reportStale: boolean("report_stale").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("tt_solutions_run_profile_key").on(t.runId, t.profile),
    check("tt_solutions_profile_check", sql`${t.profile} IN ('teachers', 'classes', 'balanced')`),
    check("tt_solutions_status_check", sql`${t.status} IN ('ok', 'failed')`),
    schoolIsolation,
  ],
);

export const ttPlacements = pgTable(
  "tt_placements",
  {
    schoolId: schoolId(),
    solutionId: uuid("solution_id")
      .notNull()
      .references(() => ttSolutions.id, { onDelete: "cascade" }),
    blockId: uuid("block_id").notNull(),
    day: integer().notNull(),
    period: integer().notNull(),
    pinned: boolean().notNull().default(false),
  },
  (t) => [
    primaryKey({ name: "tt_placements_pk", columns: [t.solutionId, t.blockId, t.day, t.period] }),
    check("tt_placements_day_check", sql`${t.day} BETWEEN 0 AND 6`),
    check("tt_placements_period_check", sql`${t.period} >= 1`),
    schoolIsolation,
  ],
);
