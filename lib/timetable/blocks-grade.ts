import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { ttBlockClasses, ttClasses, ttLessonBlocks, ttSubjects } from "@/lib/db/schema-timetable";
import type { GradePeriodsInput } from "@/lib/validations/timetable";
import { assertBoard } from "./boards";
import type { TtBlock } from "./blocks";
import { TimetableError, type Tx } from "./errors";

async function assertSubject(tx: Tx, boardId: string, subjectId: string): Promise<void> {
  const subject = await tx
    .select({ id: ttSubjects.id })
    .from(ttSubjects)
    .where(and(eq(ttSubjects.id, subjectId), eq(ttSubjects.boardId, boardId)));
  if (subject.length === 0) throw new TimetableError("unknown_id");
}

/**
 * Gives every class of a grade `weeklyPeriods` of a subject, in one go: each of
 * the subject's blocks in the grade (lessons and Plata) gets the new count, and
 * a class without the subject gets a lesson with no teacher yet.
 */
export function setGradeSubjectPeriods(
  schoolId: string,
  boardId: string,
  input: GradePeriodsInput,
): Promise<{ updated: number; created: number }> {
  return withSchool(schoolId, async (tx) => {
    await assertBoard(tx, boardId);
    await assertSubject(tx, boardId, input.subjectId);
    const classes = await tx
      .select({ id: ttClasses.id })
      .from(ttClasses)
      .where(and(eq(ttClasses.boardId, boardId), eq(ttClasses.grade, input.grade)));
    if (classes.length === 0) return { updated: 0, created: 0 };
    const members = await tx
      .select({ blockId: ttBlockClasses.blockId, classId: ttBlockClasses.classId })
      .from(ttBlockClasses)
      .innerJoin(ttLessonBlocks, eq(ttBlockClasses.blockId, ttLessonBlocks.id))
      .where(and(inArray(ttBlockClasses.classId, classes.map((c) => c.id)), eq(ttLessonBlocks.subjectId, input.subjectId)));
    const blockIds = [...new Set(members.map((m) => m.blockId))];
    if (blockIds.length > 0) {
      await tx.update(ttLessonBlocks).set({ weeklyPeriods: input.weeklyPeriods }).where(inArray(ttLessonBlocks.id, blockIds));
    }
    const covered = new Set(members.map((m) => m.classId));
    const missing = classes.filter((c) => !covered.has(c.id));
    for (const klass of missing) {
      const [row] = await tx
        .insert(ttLessonBlocks)
        .values({ schoolId, boardId, subjectId: input.subjectId, weeklyPeriods: input.weeklyPeriods })
        .returning({ id: ttLessonBlocks.id });
      await tx.insert(ttBlockClasses).values({ blockId: row.id, classId: klass.id, schoolId });
    }
    return { updated: blockIds.length, created: missing.length };
  });
}

/**
 * Takes one class out of a Plata: the class gets its own lesson of the subject
 * (same weekly periods, no teacher yet) and the Plata keeps its other classes.
 * Null when the block is not on the board; `unknown_id` when the class is not in it
 * or the block is not a Plata.
 */
export function detachClassFromPlata(
  schoolId: string,
  boardId: string,
  blockId: string,
  classId: string,
): Promise<TtBlock | null> {
  return withSchool(schoolId, async (tx) => {
    const [block] = await tx
      .select({ subjectId: ttLessonBlocks.subjectId, weeklyPeriods: ttLessonBlocks.weeklyPeriods })
      .from(ttLessonBlocks)
      .where(and(eq(ttLessonBlocks.id, blockId), eq(ttLessonBlocks.boardId, boardId)));
    if (!block) return null;
    const members = await tx
      .select({ classId: ttBlockClasses.classId })
      .from(ttBlockClasses)
      .where(eq(ttBlockClasses.blockId, blockId));
    if (members.length < 2 || !members.some((m) => m.classId === classId)) throw new TimetableError("unknown_id");
    await tx
      .delete(ttBlockClasses)
      .where(and(eq(ttBlockClasses.blockId, blockId), eq(ttBlockClasses.classId, classId)));
    const [row] = await tx
      .insert(ttLessonBlocks)
      .values({ schoolId, boardId, subjectId: block.subjectId, weeklyPeriods: block.weeklyPeriods })
      .returning({ id: ttLessonBlocks.id });
    await tx.insert(ttBlockClasses).values({ blockId: row.id, classId, schoolId });
    return { id: row.id, subjectId: block.subjectId, weeklyPeriods: block.weeklyPeriods, classIds: [classId], teacherIds: [] };
  });
}
