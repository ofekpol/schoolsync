import "server-only";
import { and, eq } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { ttBoards, ttConstraints, ttTeacherResponses, ttTeachers } from "@/lib/db/schema-timetable";
import type { Tx } from "../errors";
import { WeekSchema } from "../week";
import { recordAnswer, type TeacherResponse } from "./collect";
import { ConstraintError } from "./errors";

/** A board collecting constraints, as one of its teachers sees it. */
export interface MyBoard {
  boardId: string;
  boardName: string;
  teacherId: string;
  deadline: string | null;
  /** False once the deadline has passed. */
  open: boolean;
  freeDayEntitled: boolean;
  freeDay: number | null;
  answeredAt: string | null;
  byManagement: boolean;
  /** The board's teaching days. */
  days: number[];
}

async function loadMine(tx: Tx, staffUserId: string, now: Date, boardId?: string): Promise<MyBoard[]> {
  const rows = await tx
    .select({
      boardId: ttBoards.id,
      boardName: ttBoards.name,
      deadline: ttBoards.teacherDeadline,
      week: ttBoards.week,
      teacherId: ttTeachers.id,
      entitled: ttTeachers.freeDayEntitled,
      answeredAt: ttTeacherResponses.answeredAt,
      byManagement: ttTeacherResponses.byManagement,
      freeDayParams: ttConstraints.params,
    })
    .from(ttTeachers)
    .innerJoin(ttBoards, eq(ttTeachers.boardId, ttBoards.id))
    .leftJoin(ttTeacherResponses, and(eq(ttTeacherResponses.boardId, ttBoards.id), eq(ttTeacherResponses.teacherId, ttTeachers.id)))
    .leftJoin(ttConstraints, and(eq(ttConstraints.teacherId, ttTeachers.id), eq(ttConstraints.type, "teacher_free_day")))
    .where(and(
      eq(ttTeachers.staffUserId, staffUserId),
      eq(ttBoards.status, "collecting"),
      boardId ? eq(ttBoards.id, boardId) : undefined,
    ));
  return rows.map((row) => ({
    boardId: row.boardId,
    boardName: row.boardName,
    teacherId: row.teacherId,
    deadline: row.deadline?.toISOString() ?? null,
    open: row.deadline !== null && row.deadline.getTime() > now.getTime(),
    freeDayEntitled: row.entitled,
    freeDay: (row.freeDayParams as { day: number } | null)?.day ?? null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    byManagement: row.byManagement ?? false,
    days: WeekSchema.parse(row.week).days.map((d) => d.day),
  }));
}

/** The school's collecting boards on which this staff user is a teacher. */
export function listMyBoards(schoolId: string, staffUserId: string, now = new Date()): Promise<MyBoard[]> {
  return withSchool(schoolId, (tx) => loadMine(tx, staffUserId, now));
}

/**
 * The teacher's own answer: their free day (null = no request), before the
 * deadline. unknown_id when they do not teach on the board; wrong_status when
 * it is not collecting; deadline_past after the deadline.
 */
export function answerAsTeacher(
  schoolId: string,
  staffUserId: string,
  boardId: string,
  freeDay: number | null,
  now = new Date(),
): Promise<TeacherResponse> {
  return withSchool(schoolId, async (tx) => {
    const [teacher] = await tx
      .select({ id: ttTeachers.id, status: ttBoards.status })
      .from(ttTeachers)
      .innerJoin(ttBoards, eq(ttTeachers.boardId, ttBoards.id))
      .where(and(eq(ttTeachers.boardId, boardId), eq(ttTeachers.staffUserId, staffUserId)));
    if (!teacher) throw new ConstraintError("unknown_id");
    if (teacher.status !== "collecting") throw new ConstraintError("wrong_status");
    const [mine] = await loadMine(tx, staffUserId, now, boardId);
    if (!mine.open) throw new ConstraintError("deadline_past");
    return recordAnswer(tx, schoolId, boardId, teacher.id, freeDay, { staffUserId, byManagement: false });
  });
}
