import "server-only";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import {
  ttBlockClasses,
  ttBlockTeachers,
  ttClasses,
  ttLessonBlocks,
  ttSubjects,
  ttTeachers,
} from "@/lib/db/schema-timetable";
import type { BlockInput } from "@/lib/validations/timetable";
import { assertBoard } from "./boards";
import { TimetableError, type Tx } from "./errors";

export type { BlockInput } from "@/lib/validations/timetable";

/** One class = an ordinary lesson; two or more = a Plata. No teacher yet is allowed. */
export interface TtBlock {
  id: string;
  subjectId: string;
  weeklyPeriods: number;
  classIds: string[];
  teacherIds: string[];
}

async function loadBlocks(tx: Tx, boardId: string): Promise<TtBlock[]> {
  const rows = await tx
    .select({ id: ttLessonBlocks.id, subjectId: ttLessonBlocks.subjectId, weeklyPeriods: ttLessonBlocks.weeklyPeriods })
    .from(ttLessonBlocks)
    .where(eq(ttLessonBlocks.boardId, boardId))
    .orderBy(asc(ttLessonBlocks.id));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const classes = await tx.select().from(ttBlockClasses).where(inArray(ttBlockClasses.blockId, ids));
  const teachers = await tx.select().from(ttBlockTeachers).where(inArray(ttBlockTeachers.blockId, ids));
  return rows.map((row) => ({
    ...row,
    classIds: classes.filter((c) => c.blockId === row.id).map((c) => c.classId),
    teacherIds: teachers.filter((t) => t.blockId === row.id).map((t) => t.teacherId),
  }));
}

/** Throws unless every id is on the board, the classes share a grade and none has the subject already. */
async function validateBlock(tx: Tx, boardId: string, input: BlockInput, exceptBlockId?: string): Promise<void> {
  const subject = await tx
    .select({ id: ttSubjects.id })
    .from(ttSubjects)
    .where(and(eq(ttSubjects.id, input.subjectId), eq(ttSubjects.boardId, boardId)));
  const classes = await tx
    .select({ grade: ttClasses.grade })
    .from(ttClasses)
    .where(and(inArray(ttClasses.id, input.classIds), eq(ttClasses.boardId, boardId)));
  const teachers =
    input.teacherIds.length === 0
      ? []
      : await tx
          .select({ id: ttTeachers.id })
          .from(ttTeachers)
          .where(and(inArray(ttTeachers.id, input.teacherIds), eq(ttTeachers.boardId, boardId)));
  if (subject.length === 0 || classes.length !== input.classIds.length || teachers.length !== input.teacherIds.length) {
    throw new TimetableError("unknown_id");
  }
  if (new Set(classes.map((c) => c.grade)).size > 1) throw new TimetableError("mixed_grades");
  const clash = await tx
    .select({ id: ttLessonBlocks.id })
    .from(ttBlockClasses)
    .innerJoin(ttLessonBlocks, eq(ttBlockClasses.blockId, ttLessonBlocks.id))
    .where(
      and(
        inArray(ttBlockClasses.classId, input.classIds),
        eq(ttLessonBlocks.subjectId, input.subjectId),
        exceptBlockId ? ne(ttLessonBlocks.id, exceptBlockId) : undefined,
      ),
    )
    .limit(1);
  if (clash.length > 0) throw new TimetableError("duplicate_lesson");
}

async function writeMembers(tx: Tx, schoolId: string, blockId: string, input: BlockInput): Promise<void> {
  await tx.insert(ttBlockClasses).values(input.classIds.map((classId) => ({ blockId, classId, schoolId })));
  if (input.teacherIds.length > 0) {
    await tx.insert(ttBlockTeachers).values(input.teacherIds.map((teacherId) => ({ blockId, teacherId, schoolId })));
  }
}

export function listBlocks(schoolId: string, boardId: string): Promise<TtBlock[]> {
  return withSchool(schoolId, (tx) => loadBlocks(tx, boardId));
}

export function createBlock(schoolId: string, boardId: string, input: BlockInput): Promise<TtBlock> {
  return withSchool(schoolId, async (tx) => {
    await assertBoard(tx, boardId);
    await validateBlock(tx, boardId, input);
    const [row] = await tx
      .insert(ttLessonBlocks)
      .values({ schoolId, boardId, subjectId: input.subjectId, weeklyPeriods: input.weeklyPeriods })
      .returning({ id: ttLessonBlocks.id });
    await writeMembers(tx, schoolId, row.id, input);
    return { id: row.id, ...input };
  });
}

/** Replaces the block's subject, periods, classes and teachers. Null when not found. */
export function replaceBlock(schoolId: string, id: string, input: BlockInput): Promise<TtBlock | null> {
  return withSchool(schoolId, async (tx) => {
    const [existing] = await tx
      .select({ boardId: ttLessonBlocks.boardId })
      .from(ttLessonBlocks)
      .where(eq(ttLessonBlocks.id, id));
    if (!existing) return null;
    await validateBlock(tx, existing.boardId, input, id);
    await tx
      .update(ttLessonBlocks)
      .set({ subjectId: input.subjectId, weeklyPeriods: input.weeklyPeriods })
      .where(eq(ttLessonBlocks.id, id));
    await tx.delete(ttBlockClasses).where(eq(ttBlockClasses.blockId, id));
    await tx.delete(ttBlockTeachers).where(eq(ttBlockTeachers.blockId, id));
    await writeMembers(tx, schoolId, id, input);
    return { id, ...input };
  });
}

export function deleteBlock(schoolId: string, id: string): Promise<boolean> {
  return withSchool(schoolId, async (tx) => {
    const rows = await tx.delete(ttLessonBlocks).where(eq(ttLessonBlocks.id, id)).returning({ id: ttLessonBlocks.id });
    return rows.length > 0;
  });
}
