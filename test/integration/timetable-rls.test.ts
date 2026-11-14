import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { withSchool } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  ttBlockClasses,
  ttBlockTeachers,
  ttBoards,
  ttClasses,
  ttLessonBlocks,
  ttSubjects,
  ttTeachers,
} from "@/lib/db/schema-timetable";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

/**
 * RLS for the seven timetable tables: a school reads its own rows, never sees
 * another school's, and cannot write a row for another school. Deleting a
 * board removes everything under it.
 */
describe.skipIf(skipIfNoTestDb)("timetable tables RLS", () => {
  const ids = {
    year: randomUUID(),
    board: randomUUID(),
    klass: randomUUID(),
    subject: randomUUID(),
    teacher: randomUUID(),
    block: randomUUID(),
  };

  function rowsFor(): Array<{ table: PgTable; row: Record<string, unknown> }> {
    const schoolId = testSchoolA;
    return [
      { table: ttBoards, row: { id: randomUUID(), schoolId, academicYearId: ids.year, name: `x-${randomUUID()}`, week: {} } },
      { table: ttClasses, row: { schoolId, boardId: ids.board, grade: 9, number: 1 } },
      { table: ttSubjects, row: { schoolId, boardId: ids.board, name: "x" } },
      { table: ttTeachers, row: { schoolId, boardId: ids.board, fullName: "x" } },
      { table: ttLessonBlocks, row: { schoolId, boardId: ids.board, subjectId: ids.subject, weeklyPeriods: 1 } },
      { table: ttBlockClasses, row: { schoolId, blockId: ids.block, classId: ids.klass } },
      { table: ttBlockTeachers, row: { schoolId, blockId: ids.block, teacherId: ids.teacher } },
    ];
  }

  async function countAll(schoolId: string): Promise<number[]> {
    return withSchool(schoolId, async (tx) => [
      (await tx.select().from(ttBoards).where(eq(ttBoards.id, ids.board))).length,
      (await tx.select().from(ttClasses).where(eq(ttClasses.id, ids.klass))).length,
      (await tx.select().from(ttSubjects).where(eq(ttSubjects.id, ids.subject))).length,
      (await tx.select().from(ttTeachers).where(eq(ttTeachers.id, ids.teacher))).length,
      (await tx.select().from(ttLessonBlocks).where(eq(ttLessonBlocks.id, ids.block))).length,
      (await tx.select().from(ttBlockClasses).where(eq(ttBlockClasses.blockId, ids.block))).length,
      (await tx.select().from(ttBlockTeachers).where(eq(ttBlockTeachers.blockId, ids.block))).length,
    ]);
  }

  beforeAll(async () => {
    if (shouldSkip()) return;
    const db = testDb!;
    const schoolId = testSchoolA;
    await db.insert(schema.academicYears).values({
      id: ids.year,
      schoolId,
      label: `tt-rls-${ids.year}`,
      startDate: "2026-09-01",
      endDate: "2027-06-30",
    });
    await db.insert(ttBoards).values({ id: ids.board, schoolId, academicYearId: ids.year, name: "rls", week: {} });
    await db.insert(ttClasses).values({ id: ids.klass, schoolId, boardId: ids.board, grade: 7, number: 1 });
    await db.insert(ttSubjects).values({ id: ids.subject, schoolId, boardId: ids.board, name: "מתמטיקה" });
    await db.insert(ttTeachers).values({ id: ids.teacher, schoolId, boardId: ids.board, fullName: "מורה" });
    await db.insert(ttLessonBlocks).values({ id: ids.block, schoolId, boardId: ids.board, subjectId: ids.subject, weeklyPeriods: 5 });
    await db.insert(ttBlockClasses).values({ blockId: ids.block, classId: ids.klass, schoolId });
    await db.insert(ttBlockTeachers).values({ blockId: ids.block, teacherId: ids.teacher, schoolId });
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    // Boards cascade from the academic year.
    await testDb!.delete(schema.academicYears).where(eq(schema.academicYears.id, ids.year));
  });

  it("lets a school read its own rows in all seven tables", async () => {
    expect(await countAll(testSchoolA)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it("hides another school's rows in all seven tables", async () => {
    expect(await countAll(testSchoolB)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("rejects inserting a row for another school in each table", async () => {
    for (const { table, row } of rowsFor()) {
      await expect(withSchool(testSchoolB, (tx) => tx.insert(table).values(row))).rejects.toThrow();
    }
  });

  it("refuses to delete a subject a block uses", async () => {
    await expect(
      withSchool(testSchoolA, (tx) => tx.delete(ttSubjects).where(eq(ttSubjects.id, ids.subject))),
    ).rejects.toThrow();
  });

  it("deleting the board removes the rows of the other six tables", async () => {
    await withSchool(testSchoolA, (tx) => tx.delete(ttBoards).where(eq(ttBoards.id, ids.board)));
    expect(await countAll(testSchoolA)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
