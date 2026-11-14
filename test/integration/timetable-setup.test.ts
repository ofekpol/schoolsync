import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { ttBlockClasses, ttBlockTeachers, ttLessonBlocks } from "@/lib/db/schema-timetable";
import { createBoard, deleteBoard, listBoards, type Board } from "@/lib/timetable/boards";
import { listClasses, setGradeClassCount } from "@/lib/timetable/classes";
import { addSubjects, deleteSubject, listSubjects, renameSubject } from "@/lib/timetable/subjects";
import {
  addTeachers,
  addTeachersFromStaff,
  deleteTeacher,
  listTeachers,
  updateTeacher,
} from "@/lib/timetable/teachers";
import { DEFAULT_WEEK } from "@/lib/timetable/week";
import { boardName, ensureActiveYear } from "./timetable-helpers";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

describe.skipIf(skipIfNoTestDb)("timetable setup domain", () => {
  const staffA = randomUUID();
  const staffB = randomUUID();
  let board: Board;

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(testSchoolA);
    await testDb!.insert(schema.staffUsers).values([
      { id: staffA, schoolId: testSchoolA, email: `tt-${staffA}@test`, fullName: "מורה א", role: "editor", status: "active" },
      { id: staffB, schoolId: testSchoolB, email: `tt-${staffB}@test`, fullName: "מורה ב", role: "editor", status: "active" },
    ]);
    board = await createBoard(testSchoolA, boardName("setup"));
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await deleteBoard(testSchoolA, board.id);
    await testDb!.delete(schema.staffUsers).where(eq(schema.staffUsers.id, staffA));
    await testDb!.delete(schema.staffUsers).where(eq(schema.staffUsers.id, staffB));
  });

  it("creates a board in setup with the default week; names are unique per school", async () => {
    expect(board.status).toBe("setup");
    expect(board.week).toEqual(DEFAULT_WEEK);
    await expect(createBoard(testSchoolA, board.name)).rejects.toMatchObject({ code: "duplicate_name" });
    expect((await listBoards(testSchoolB)).map((b) => b.id)).not.toContain(board.id);
  });

  it("sets a grade's class count up, down and up again", async () => {
    const four = await setGradeClassCount(testSchoolA, board.id, 7, 4);
    expect(four.filter((c) => c.grade === 7).map((c) => c.number)).toEqual([1, 2, 3, 4]);
    const two = await setGradeClassCount(testSchoolA, board.id, 7, 2);
    expect(two.filter((c) => c.grade === 7).map((c) => c.number)).toEqual([1, 2]);
    const three = await setGradeClassCount(testSchoolA, board.id, 7, 3);
    expect(three.filter((c) => c.grade === 7).map((c) => c.number)).toEqual([1, 2, 3]);
  });

  it("refuses a board of another school", async () => {
    await expect(setGradeClassCount(testSchoolB, board.id, 7, 1)).rejects.toMatchObject({ code: "unknown_id" });
    await expect(addSubjects(testSchoolB, board.id, ["x"])).rejects.toMatchObject({ code: "unknown_id" });
  });

  it("adds pasted subjects once, skipping blanks, repeats and existing names", async () => {
    const first = await addSubjects(testSchoolA, board.id, ["מתמטיקה", " ", "מתמטיקה", "אנגלית "]);
    expect(first.map((s) => s.name).sort()).toEqual(["אנגלית", "מתמטיקה"]);
    const second = await addSubjects(testSchoolA, board.id, ["אנגלית", "ספרות"]);
    expect(second.map((s) => s.name)).toEqual(["ספרות"]);
    const renamed = await renameSubject(testSchoolA, second[0].id, "ספרות עברית");
    expect(renamed?.name).toBe("ספרות עברית");
    await expect(renameSubject(testSchoolA, second[0].id, "אנגלית")).rejects.toMatchObject({ code: "duplicate_name" });
  });

  it("links a staff user once and rejects another school's staff", async () => {
    await addTeachersFromStaff(testSchoolA, board.id, [staffA]);
    await addTeachersFromStaff(testSchoolA, board.id, [staffA]);
    const linked = (await listTeachers(testSchoolA, board.id)).filter((t) => t.staffUserId === staffA);
    expect(linked).toHaveLength(1);
    expect(linked[0].fullName).toBe("מורה א");
    await expect(addTeachersFromStaff(testSchoolA, board.id, [staffB])).rejects.toMatchObject({ code: "unknown_id" });
  });

  it("updates a teacher and refuses linking a staff user twice", async () => {
    const [plain] = await addTeachers(testSchoolA, board.id, ["  מורה חדש "]);
    expect(plain.fullName).toBe("מורה חדש");
    const updated = await updateTeacher(testSchoolA, plain.id, { freeDayEntitled: false });
    expect(updated?.freeDayEntitled).toBe(false);
    await expect(updateTeacher(testSchoolA, plain.id, { staffUserId: staffA })).rejects.toMatchObject({
      code: "already_linked",
    });
    expect(await deleteTeacher(testSchoolA, plain.id)).toBe(true);
  });

  it("refuses to remove a class, subject or teacher that a lesson uses", async () => {
    const klass = (await listClasses(testSchoolA, board.id)).find((c) => c.grade === 7 && c.number === 3)!;
    const subject = (await listSubjects(testSchoolA, board.id))[0];
    const teacher = (await listTeachers(testSchoolA, board.id))[0];
    const [block] = await testDb!
      .insert(ttLessonBlocks)
      .values({ schoolId: testSchoolA, boardId: board.id, subjectId: subject.id, weeklyPeriods: 3 })
      .returning();
    await testDb!.insert(ttBlockClasses).values({ blockId: block.id, classId: klass.id, schoolId: testSchoolA });
    await testDb!.insert(ttBlockTeachers).values({ blockId: block.id, teacherId: teacher.id, schoolId: testSchoolA });

    await expect(setGradeClassCount(testSchoolA, board.id, 7, 2)).rejects.toMatchObject({ code: "in_use" });
    await expect(deleteSubject(testSchoolA, subject.id)).rejects.toMatchObject({ code: "in_use" });
    await expect(deleteTeacher(testSchoolA, teacher.id)).rejects.toMatchObject({ code: "in_use" });
    expect((await listClasses(testSchoolA, board.id)).filter((c) => c.grade === 7)).toHaveLength(3);
    expect((await listSubjects(testSchoolA, board.id)).map((s) => s.id)).toContain(subject.id);
    expect((await listTeachers(testSchoolA, board.id)).map((t) => t.id)).toContain(teacher.id);
  });

  it("deletes a board with everything on it", async () => {
    const other = await createBoard(testSchoolA, boardName("delete"));
    await setGradeClassCount(testSchoolA, other.id, 8, 2);
    expect(await deleteBoard(testSchoolA, other.id)).toBe(true);
    expect(await listClasses(testSchoolA, other.id)).toEqual([]);
    expect(await deleteBoard(testSchoolA, other.id)).toBe(false);
  });
});
