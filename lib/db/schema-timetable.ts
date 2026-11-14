import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
