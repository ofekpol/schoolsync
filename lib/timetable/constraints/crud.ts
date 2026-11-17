import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { profileCategories, profileCategoryOptions } from "@/lib/db/schema-profile";
import { ttBoards, ttConstraints, ttTeachers } from "@/lib/db/schema-timetable";
import { assertBoard } from "../boards";
import { pgErrorCode, type Tx } from "../errors";
import { WeekSchema } from "../week";
import { ConstraintError } from "./errors";
import { MAX_CONSTRAINTS_PER_BOARD } from "./limits";
import type { ConstraintInput, ConstraintType } from "./registry";
import type { Target } from "./target";

export interface TtConstraint {
  id: string;
  type: ConstraintType;
  hard: boolean;
  weight: number;
  params: unknown;
  source: "teacher" | "management";
  teacherId: string | null;
  updatedAt: string;
}
export interface ConstraintActor {
  staffUserId: string | null;
  source: "teacher" | "management";
}

function toConstraint(row: typeof ttConstraints.$inferSelect): TtConstraint {
  return {
    id: row.id,
    type: row.type as ConstraintType,
    hard: row.hardness === "hard",
    weight: row.weight,
    params: row.params,
    source: row.source,
    teacherId: row.teacherId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function targetOf(input: ConstraintInput): Target | null {
  return "target" in input.params ? input.params.target : null;
}

/** Throws day_not_in_week unless the params' day is a day of the board's week and has every period named. */
async function assertInWeek(tx: Tx, boardId: string, input: ConstraintInput): Promise<void> {
  const params = input.params as { day?: number; periods?: number[] };
  if (params.day === undefined) return;
  const [board] = await tx.select({ week: ttBoards.week }).from(ttBoards).where(eq(ttBoards.id, boardId));
  const day = board ? WeekSchema.parse(board.week).days.find((d) => d.day === params.day) : undefined;
  if (!day || (params.periods ?? []).some((p) => p > day.periods.length)) throw new ConstraintError("day_not_in_week");
}

/** Throws unless every teacher is on the board, the option is active, and a free day's teacher is entitled. */
async function validate(tx: Tx, boardId: string, input: ConstraintInput): Promise<void> {
  await assertInWeek(tx, boardId, input);
  const target = targetOf(input);
  const teacherIds = [...(target?.kind === "teachers" ? target.teacherIds : []), ...(input.teacherId ? [input.teacherId] : [])];
  if (teacherIds.length > 0) {
    const found = await tx
      .select({ id: ttTeachers.id, entitled: ttTeachers.freeDayEntitled })
      .from(ttTeachers)
      .where(and(eq(ttTeachers.boardId, boardId), inArray(ttTeachers.id, teacherIds)));
    if (found.length !== new Set(teacherIds).size) throw new ConstraintError("unknown_id");
    if (input.type === "teacher_free_day" && !found[0].entitled) throw new ConstraintError("not_entitled");
  }
  if (target?.kind === "label") {
    const option = await tx
      .select({ id: profileCategoryOptions.id })
      .from(profileCategoryOptions)
      .innerJoin(profileCategories, eq(profileCategoryOptions.categoryId, profileCategories.id))
      .where(
        and(
          eq(profileCategoryOptions.id, target.optionId),
          isNull(profileCategoryOptions.archivedAt),
          isNull(profileCategories.archivedAt),
        ),
      );
    if (option.length === 0) throw new ConstraintError("unknown_id");
  }
}

function mapUnique(error: unknown): never {
  if (pgErrorCode(error) === "23505") throw new ConstraintError("duplicate_free_day");
  throw error;
}

/** The board's constraints, by type then age. */
export function listConstraints(schoolId: string, boardId: string): Promise<TtConstraint[]> {
  return withSchool(schoolId, async (tx) => {
    const rows = await tx
      .select()
      .from(ttConstraints)
      .where(eq(ttConstraints.boardId, boardId))
      .orderBy(asc(ttConstraints.type), asc(ttConstraints.createdAt));
    return rows.map(toConstraint);
  });
}

/** Validates and inserts inside an open transaction (Task 5 reuses it). */
export async function insertConstraint(
  tx: Tx,
  schoolId: string,
  boardId: string,
  input: ConstraintInput,
  actor: ConstraintActor,
): Promise<TtConstraint> {
  await assertBoard(tx, boardId);
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(ttConstraints)
    .where(eq(ttConstraints.boardId, boardId));
  if (count >= MAX_CONSTRAINTS_PER_BOARD) throw new ConstraintError("limit_reached");
  await validate(tx, boardId, input);
  const [row] = await tx
    .insert(ttConstraints)
    .values({
      schoolId,
      boardId,
      type: input.type,
      hardness: input.hard ? "hard" : "soft",
      weight: input.weight,
      params: input.params,
      source: actor.source,
      teacherId: input.teacherId ?? null,
      createdBy: actor.staffUserId,
    })
    .returning();
  return toConstraint(row);
}

export function createConstraint(
  schoolId: string,
  boardId: string,
  input: ConstraintInput,
  actor: ConstraintActor,
): Promise<TtConstraint> {
  return withSchool(schoolId, (tx) => insertConstraint(tx, schoolId, boardId, input, actor)).catch(mapUnique);
}

/**
 * Replaces hard/soft, weight and params. The type, source and teacher stay
 * (type_changed when the input names another type). Null when not on this board.
 */
export function replaceConstraint(
  schoolId: string,
  boardId: string,
  id: string,
  input: ConstraintInput,
): Promise<TtConstraint | null> {
  return withSchool(schoolId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(ttConstraints)
      .where(and(eq(ttConstraints.id, id), eq(ttConstraints.boardId, boardId)));
    if (!existing) return null;
    if (existing.type !== input.type) throw new ConstraintError("type_changed");
    await validate(tx, boardId, { ...input, teacherId: existing.teacherId ?? undefined } as ConstraintInput);
    const [row] = await tx
      .update(ttConstraints)
      .set({ hardness: input.hard ? "hard" : "soft", weight: input.weight, params: input.params, updatedAt: new Date() })
      .where(eq(ttConstraints.id, id))
      .returning();
    return toConstraint(row);
  });
}

export function deleteConstraint(schoolId: string, boardId: string, id: string): Promise<boolean> {
  return withSchool(schoolId, async (tx) => {
    const rows = await tx
      .delete(ttConstraints)
      .where(and(eq(ttConstraints.id, id), eq(ttConstraints.boardId, boardId)))
      .returning({ id: ttConstraints.id });
    return rows.length > 0;
  });
}

/** Removes a teacher's free day inside an open transaction (Task 5). */
export async function deleteFreeDay(tx: Tx, boardId: string, teacherId: string): Promise<void> {
  await tx
    .delete(ttConstraints)
    .where(
      and(
        eq(ttConstraints.boardId, boardId),
        eq(ttConstraints.teacherId, teacherId),
        eq(ttConstraints.type, "teacher_free_day"),
      ),
    );
}
