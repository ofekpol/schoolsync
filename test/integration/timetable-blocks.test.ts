import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBoard, deleteBoard, type Board } from "@/lib/timetable/boards";
import { createBlock, deleteBlock, listBlocks, replaceBlock } from "@/lib/timetable/blocks";
import { setGradeClassCount, type TtClass } from "@/lib/timetable/classes";
import { addSubjects, type TtSubject } from "@/lib/timetable/subjects";
import { addTeachers, type TtTeacher } from "@/lib/timetable/teachers";
import { boardName, ensureActiveYear } from "./timetable-helpers";
import { shouldSkip, skipIfNoTestDb, testSchoolA, testSchoolB } from "./setup";

describe.skipIf(skipIfNoTestDb)("timetable lesson blocks", () => {
  let board: Board;
  let otherBoard: Board;
  let classes: TtClass[];
  let math: TtSubject;
  let english: TtSubject;
  let teachers: TtTeacher[];
  let otherClass: TtClass;

  const cls = (grade: number, number: number) => classes.find((c) => c.grade === grade && c.number === number)!.id;

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(testSchoolA);
    board = await createBoard(testSchoolA, boardName("blocks"));
    otherBoard = await createBoard(testSchoolA, boardName("blocks-other"));
    await setGradeClassCount(testSchoolA, board.id, 7, 4);
    classes = await setGradeClassCount(testSchoolA, board.id, 8, 1);
    [otherClass] = await setGradeClassCount(testSchoolA, otherBoard.id, 7, 1);
    [math, english] = await addSubjects(testSchoolA, board.id, ["מתמטיקה", "אנגלית"]);
    teachers = await addTeachers(testSchoolA, board.id, ["א", "ב", "ג"]);
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await deleteBoard(testSchoolA, board.id);
    await deleteBoard(testSchoolA, otherBoard.id);
  });

  it("round-trips an ordinary lesson and a Plata", async () => {
    const lesson = await createBlock(testSchoolA, board.id, {
      subjectId: english.id, weeklyPeriods: 4, classIds: [cls(7, 4)], teacherIds: [teachers[0].id],
    });
    const plata = await createBlock(testSchoolA, board.id, {
      subjectId: math.id, weeklyPeriods: 5, classIds: [cls(7, 1), cls(7, 2), cls(7, 3)], teacherIds: teachers.map((t) => t.id),
    });
    const listed = await listBlocks(testSchoolA, board.id);
    expect(listed).toContainEqual(lesson);
    const stored = listed.find((b) => b.id === plata.id)!;
    expect(stored.classIds.sort()).toEqual(plata.classIds.sort());
    expect(stored.teacherIds.sort()).toEqual(plata.teacherIds.sort());
  });

  it("rejects ids from another board or another school", async () => {
    await expect(
      createBlock(testSchoolA, board.id, { subjectId: english.id, weeklyPeriods: 1, classIds: [otherClass.id], teacherIds: [] }),
    ).rejects.toMatchObject({ code: "unknown_id" });
    await expect(
      createBlock(testSchoolB, board.id, { subjectId: english.id, weeklyPeriods: 1, classIds: [cls(8, 1)], teacherIds: [] }),
    ).rejects.toMatchObject({ code: "unknown_id" });
    expect((await listBlocks(testSchoolA, board.id)).some((b) => b.classIds.includes(otherClass.id))).toBe(false);
  });

  it("rejects a Plata across grades", async () => {
    await expect(
      createBlock(testSchoolA, board.id, { subjectId: english.id, weeklyPeriods: 2, classIds: [cls(7, 1), cls(8, 1)], teacherIds: [] }),
    ).rejects.toMatchObject({ code: "mixed_grades" });
  });

  it("rejects a second block of a subject a class already has", async () => {
    await expect(
      createBlock(testSchoolA, board.id, { subjectId: math.id, weeklyPeriods: 5, classIds: [cls(7, 1)], teacherIds: [] }),
    ).rejects.toMatchObject({ code: "duplicate_lesson" });
    const ok = await createBlock(testSchoolA, board.id, {
      subjectId: english.id, weeklyPeriods: 4, classIds: [cls(7, 1)], teacherIds: [],
    });
    expect(ok.teacherIds).toEqual([]);
  });

  it("replaces a block: itself is no duplicate, and a class moved out is free again", async () => {
    const plata = (await listBlocks(testSchoolA, board.id)).find((b) => b.classIds.length === 3)!;
    const same = { subjectId: plata.subjectId, weeklyPeriods: plata.weeklyPeriods, classIds: plata.classIds, teacherIds: plata.teacherIds };
    expect(await replaceBlock(testSchoolA, plata.id, same)).toMatchObject({ id: plata.id });

    const smaller = await replaceBlock(testSchoolA, plata.id, {
      ...same, classIds: [cls(7, 1), cls(7, 2)], teacherIds: same.teacherIds.slice(0, 2),
    });
    expect(smaller?.classIds).toHaveLength(2);
    const alone = await createBlock(testSchoolA, board.id, {
      subjectId: math.id, weeklyPeriods: 5, classIds: [cls(7, 3)], teacherIds: [teachers[2].id],
    });
    expect(await deleteBlock(testSchoolA, alone.id)).toBe(true);
    expect(await replaceBlock(testSchoolB, plata.id, same)).toBeNull();
  });
});
