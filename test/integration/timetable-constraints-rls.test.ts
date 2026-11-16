import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { ttConstraints, ttTeacherResponses } from "@/lib/db/schema-timetable";
import { createBoard, deleteBoard } from "@/lib/timetable/boards";
import { addTeachers, deleteTeacher } from "@/lib/timetable/teachers";
import { pgErrorCode } from "@/lib/timetable/errors";
import { shouldSkip, skipIfNoTestDb, testSchoolA, testSchoolB } from "./setup";
import { boardName, ensureActiveYear } from "./timetable-helpers";

/** RLS and cascades for tt_constraints and tt_teacher_responses (migration 0025). */
describe.skipIf(skipIfNoTestDb)("timetable constraint tables", () => {
  const ids = { boardA: "", boardB: "", teacherA: "" };

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(testSchoolA);
    await ensureActiveYear(testSchoolB);
    ids.boardA = (await createBoard(testSchoolA, boardName("c-rls"))).id;
    ids.boardB = (await createBoard(testSchoolB, boardName("c-rls"))).id;
    ids.teacherA = (await addTeachers(testSchoolA, ids.boardA, ["מורה"]))[0].id;
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await deleteBoard(testSchoolA, ids.boardA);
    await deleteBoard(testSchoolB, ids.boardB);
  });

  const freeDay = (teacherId: string) => ({
    schoolId: testSchoolA,
    boardId: ids.boardA,
    type: "teacher_free_day",
    hardness: "hard" as const,
    weight: 100,
    params: { day: 5 },
    source: "teacher" as const,
    teacherId,
  });

  it("a school reads its own rows and never another school's", async () => {
    await withSchool(testSchoolA, async (tx) => {
      await tx.insert(ttConstraints).values(freeDay(ids.teacherA));
      await tx.insert(ttTeacherResponses).values({
        schoolId: testSchoolA, boardId: ids.boardA, teacherId: ids.teacherA, byManagement: true,
      });
    });
    const own = await withSchool(testSchoolA, (tx) =>
      tx.select().from(ttConstraints).where(eq(ttConstraints.boardId, ids.boardA)),
    );
    expect(own).toHaveLength(1);
    const foreign = await withSchool(testSchoolB, async (tx) => [
      await tx.select().from(ttConstraints).where(eq(ttConstraints.boardId, ids.boardA)),
      await tx.select().from(ttTeacherResponses).where(eq(ttTeacherResponses.boardId, ids.boardA)),
    ]);
    expect(foreign).toEqual([[], []]);
  });

  it("refuses a row written for another school", async () => {
    await expect(
      withSchool(testSchoolB, (tx) => tx.insert(ttConstraints).values(freeDay(ids.teacherA))),
    ).rejects.toThrow();
  });

  it("allows one free day per teacher", async () => {
    const error = await withSchool(testSchoolA, (tx) => tx.insert(ttConstraints).values(freeDay(ids.teacherA))).catch(
      (e: unknown) => e,
    );
    expect(pgErrorCode(error)).toBe("23505");
  });

  it("deleting a teacher removes their free day and response", async () => {
    expect(await deleteTeacher(testSchoolA, ids.teacherA)).toBe(true);
    const left = await withSchool(testSchoolA, async (tx) => [
      (await tx.select().from(ttConstraints).where(eq(ttConstraints.teacherId, ids.teacherA))).length,
      (await tx.select().from(ttTeacherResponses).where(eq(ttTeacherResponses.teacherId, ids.teacherA))).length,
    ]);
    expect(left).toEqual([0, 0]);
  });
});
