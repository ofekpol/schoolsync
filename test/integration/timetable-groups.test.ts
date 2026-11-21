import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBoard, deleteBoard, type Board } from "@/lib/timetable/boards";
import { createBlock, listBlocks, replaceBlock } from "@/lib/timetable/blocks";
import { listClasses, setGradeClassCount, updateClass, type TtClass } from "@/lib/timetable/classes";
import { addSubjects, listSubjects, updateSubject, type TtSubject } from "@/lib/timetable/subjects";
import { addTeachers, type TtTeacher } from "@/lib/timetable/teachers";
import { boardName, ensureActiveYear } from "./timetable-helpers";
import { shouldSkip, skipIfNoTestDb, testSchoolA, testSchoolB } from "./setup";

describe.skipIf(skipIfNoTestDb)("timetable class names, group grades and group names", () => {
  let board: Board;
  let otherBoard: Board;
  let classes: TtClass[];
  let english: TtSubject;
  let teachers: TtTeacher[];

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(testSchoolA);
    board = await createBoard(testSchoolA, boardName("groups"));
    otherBoard = await createBoard(testSchoolA, boardName("groups-other"));
    classes = await setGradeClassCount(testSchoolA, board.id, 8, 3);
    [english] = await addSubjects(testSchoolA, board.id, ["אנגלית"]);
    teachers = await addTeachers(testSchoolA, board.id, ["כהן", "לוי"]);
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await deleteBoard(testSchoolA, board.id);
    await deleteBoard(testSchoolA, otherBoard.id);
  });

  it("names a class and sets its type; null goes back to the default", async () => {
    const named = await updateClass(testSchoolA, board.id, classes[2].id, { name: "ח מב\"ר", kind: "מב\"ר" });
    expect(named).toMatchObject({ grade: 8, number: 3, name: "ח מב\"ר", kind: "מב\"ר" });
    expect((await listClasses(testSchoolA, board.id)).find((c) => c.id === classes[2].id)?.kind).toBe("מב\"ר");
    const cleared = await updateClass(testSchoolA, board.id, classes[2].id, { name: null });
    expect(cleared).toMatchObject({ name: null, kind: "מב\"ר" });
  });

  it("does not touch a class of another board or another school", async () => {
    expect(await updateClass(testSchoolA, otherBoard.id, classes[0].id, { name: "x" })).toBeNull();
    expect(await updateClass(testSchoolB, board.id, classes[0].id, { name: "x" })).toBeNull();
    expect((await listClasses(testSchoolA, board.id)).find((c) => c.id === classes[0].id)?.name).toBeNull();
  });

  it("stores a subject's group grades sorted and unique; another school cannot change them", async () => {
    const updated = await updateSubject(testSchoolA, english.id, { groupGrades: [10, 8, 8] });
    expect(updated?.groupGrades).toEqual([8, 10]);
    expect(updated?.name).toBe("אנגלית");
    expect(await updateSubject(testSchoolB, english.id, { groupGrades: [] })).toBeNull();
    expect((await listSubjects(testSchoolA, board.id))[0].groupGrades).toEqual([8, 10]);
  });

  it("keeps a cluster's group names per teacher across a replace", async () => {
    const [first, second] = teachers.map((t) => t.id);
    const input = {
      subjectId: english.id,
      weeklyPeriods: 4,
      classIds: [classes[0].id, classes[1].id],
      teacherIds: [first, second],
      groupNames: { [first]: "רמה 1", [second]: "" },
    };
    const created = await createBlock(testSchoolA, board.id, input);
    expect(created.groupNames).toEqual({ [first]: "רמה 1" });
    expect((await listBlocks(testSchoolA, board.id)).find((b) => b.id === created.id)?.groupNames).toEqual({ [first]: "רמה 1" });
    await replaceBlock(testSchoolA, created.id, { ...input, teacherIds: [second], groupNames: { [first]: "x", [second]: "רמה 2" } });
    expect((await listBlocks(testSchoolA, board.id)).find((b) => b.id === created.id)?.groupNames).toEqual({ [second]: "רמה 2" });
    expect(await listBlocks(testSchoolB, board.id)).toEqual([]);
  });
});
