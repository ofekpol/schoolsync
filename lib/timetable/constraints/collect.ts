import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { ttBoards, ttConstraints, ttTeacherResponses, ttTeachers } from "@/lib/db/schema-timetable";
import type { BoardStatus } from "../boards";
import type { Tx } from "../errors";
import { deleteFreeDay, insertConstraint } from "./crud";
import { ConstraintError } from "./errors";

export interface CollectState {
  status: BoardStatus;
  teacherDeadline: string | null;
}
export interface TeacherResponse {
  teacherId: string;
  answeredAt: string | null;
  byManagement: boolean;
  freeDay: number | null;
}

async function loadState(tx: Tx, boardId: string): Promise<CollectState | null> {
  const [row] = await tx
    .select({ status: ttBoards.status, deadline: ttBoards.teacherDeadline })
    .from(ttBoards)
    .where(eq(ttBoards.id, boardId));
  return row ? { status: row.status, teacherDeadline: row.deadline?.toISOString() ?? null } : null;
}

export function getCollectState(schoolId: string, boardId: string): Promise<CollectState | null> {
  return withSchool(schoolId, (tx) => loadState(tx, boardId));
}

/** setup or collecting -> collecting with `deadline`; the deadline must be in the future. */
export function startCollecting(schoolId: string, boardId: string, deadline: Date, now = new Date()): Promise<CollectState> {
  return withSchool(schoolId, async (tx) => {
    const state = await loadState(tx, boardId);
    if (!state) throw new ConstraintError("unknown_id");
    if (state.status !== "setup" && state.status !== "collecting") throw new ConstraintError("wrong_status");
    if (deadline.getTime() <= now.getTime()) throw new ConstraintError("deadline_past");
    await tx.update(ttBoards).set({ status: "collecting", teacherDeadline: deadline }).where(eq(ttBoards.id, boardId));
    return { status: "collecting", teacherDeadline: deadline.toISOString() };
  });
}

async function loadResponses(tx: Tx, boardId: string, teacherId?: string): Promise<TeacherResponse[]> {
  const teachers = await tx
    .select({ id: ttTeachers.id })
    .from(ttTeachers)
    .where(teacherId ? and(eq(ttTeachers.boardId, boardId), eq(ttTeachers.id, teacherId)) : eq(ttTeachers.boardId, boardId))
    .orderBy(asc(ttTeachers.fullName));
  const answers = await tx.select().from(ttTeacherResponses).where(eq(ttTeacherResponses.boardId, boardId));
  const freeDays = await tx
    .select({ teacherId: ttConstraints.teacherId, params: ttConstraints.params })
    .from(ttConstraints)
    .where(and(eq(ttConstraints.boardId, boardId), eq(ttConstraints.type, "teacher_free_day")));
  const answer = new Map(answers.map((a) => [a.teacherId, a]));
  const day = new Map(freeDays.map((f) => [f.teacherId, (f.params as { day: number }).day]));
  return teachers.map(({ id }) => ({
    teacherId: id,
    answeredAt: answer.get(id)?.answeredAt.toISOString() ?? null,
    byManagement: answer.get(id)?.byManagement ?? false,
    freeDay: day.get(id) ?? null,
  }));
}

/** One row per board teacher, by name; unanswered teachers have answeredAt null. */
export function listResponses(schoolId: string, boardId: string): Promise<TeacherResponse[]> {
  return withSchool(schoolId, (tx) => loadResponses(tx, boardId));
}

/**
 * Records a teacher's answer inside an open transaction: replaces their free
 * day (null = no request) and marks them answered. Used by management fill-in
 * and by the teacher's own page.
 */
export async function recordAnswer(
  tx: Tx,
  schoolId: string,
  boardId: string,
  teacherId: string,
  freeDay: number | null,
  actor: { staffUserId: string | null; byManagement: boolean },
): Promise<TeacherResponse> {
  await deleteFreeDay(tx, boardId, teacherId);
  if (freeDay !== null) {
    await insertConstraint(
      tx, schoolId, boardId,
      { type: "teacher_free_day", hard: true, weight: 100, teacherId, params: { day: freeDay } },
      { staffUserId: actor.staffUserId, source: "teacher" },
    );
  }
  const values = { answeredAt: new Date(), byManagement: actor.byManagement, answeredBy: actor.staffUserId };
  await tx
    .insert(ttTeacherResponses)
    .values({ schoolId, boardId, teacherId, ...values })
    .onConflictDoUpdate({ target: [ttTeacherResponses.boardId, ttTeacherResponses.teacherId], set: values });
  return (await loadResponses(tx, boardId, teacherId))[0];
}

/** Management answers for a teacher: sets (or clears, with null) their free day and marks them answered. */
export function fillInForTeacher(
  schoolId: string,
  boardId: string,
  teacherId: string,
  freeDay: number | null,
  actorStaffId: string | null,
): Promise<TeacherResponse> {
  return withSchool(schoolId, async (tx) => {
    const [teacher] = await tx
      .select({ id: ttTeachers.id })
      .from(ttTeachers)
      .where(and(eq(ttTeachers.id, teacherId), eq(ttTeachers.boardId, boardId)));
    if (!teacher) throw new ConstraintError("unknown_id");
    return recordAnswer(tx, schoolId, boardId, teacherId, freeDay, { staffUserId: actorStaffId, byManagement: true });
  });
}
