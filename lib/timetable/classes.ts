import "server-only";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { ttBlockClasses, ttClasses } from "@/lib/db/schema-timetable";
import { MAX_CLASSES_PER_GRADE } from "@/lib/validations/timetable";
import { assertBoard } from "./boards";
import { TimetableError, type Tx } from "./errors";

export interface TtClass {
  id: string;
  grade: number;
  number: number;
  /** Null = the default name ("ז1"). */
  name: string | null;
  /** Free-text type such as מב"ר; null = a regular class. */
  kind: string | null;
}

const columns = {
  id: ttClasses.id,
  grade: ttClasses.grade,
  number: ttClasses.number,
  name: ttClasses.name,
  kind: ttClasses.kind,
};

function loadClasses(tx: Tx, boardId: string): Promise<TtClass[]> {
  return tx
    .select(columns)
    .from(ttClasses)
    .where(eq(ttClasses.boardId, boardId))
    .orderBy(asc(ttClasses.grade), asc(ttClasses.number));
}

/** The board's classes, by grade then number. */
export function listClasses(schoolId: string, boardId: string): Promise<TtClass[]> {
  return withSchool(schoolId, (tx) => loadClasses(tx, boardId));
}

/** Sets a class's name and type (null clears either). Null when not found. */
export function updateClass(
  schoolId: string,
  boardId: string,
  id: string,
  patch: { name?: string | null; kind?: string | null },
): Promise<TtClass | null> {
  return withSchool(schoolId, async (tx) => {
    const [row] = await tx.update(ttClasses).set(patch).where(and(eq(ttClasses.id, id), eq(ttClasses.boardId, boardId))).returning(columns);
    return row ?? null;
  });
}

/**
 * Makes the grade have classes 1..count: adds the missing numbers, removes the
 * ones above. Refuses (in_use, nothing removed) when a class to remove has lessons.
 * Returns all the board's classes.
 */
export function setGradeClassCount(
  schoolId: string,
  boardId: string,
  grade: number,
  count: number,
): Promise<TtClass[]> {
  if (count < 0 || count > MAX_CLASSES_PER_GRADE) throw new TimetableError("limit_reached");
  return withSchool(schoolId, async (tx) => {
    await assertBoard(tx, boardId);
    const ofGrade = and(eq(ttClasses.boardId, boardId), eq(ttClasses.grade, grade));
    const extra = await tx.select({ id: ttClasses.id }).from(ttClasses).where(and(ofGrade, gt(ttClasses.number, count)));
    const extraIds = extra.map((row) => row.id);
    if (extraIds.length > 0) {
      const used = await tx
        .select({ id: ttBlockClasses.classId })
        .from(ttBlockClasses)
        .where(inArray(ttBlockClasses.classId, extraIds))
        .limit(1);
      if (used.length > 0) throw new TimetableError("in_use");
      await tx.delete(ttClasses).where(inArray(ttClasses.id, extraIds));
    }
    if (count > 0) {
      const wanted = Array.from({ length: count }, (_, index) => ({ schoolId, boardId, grade, number: index + 1 }));
      await tx.insert(ttClasses).values(wanted).onConflictDoNothing();
    }
    return loadClasses(tx, boardId);
  });
}
