import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBoard, deleteBoard, type Board } from "@/lib/timetable/boards";
import { createBlock, listBlocks } from "@/lib/timetable/blocks";
import { detachClassFromPlata, setGradeSubjectPeriods } from "@/lib/timetable/blocks-grade";
import { setGradeClassCount, type TtClass } from "@/lib/timetable/classes";
import { addSubjects, type TtSubject } from "@/lib/timetable/subjects";
import { addTeachers, type TtTeacher } from "@/lib/timetable/teachers";
import { boardName, ensureActiveYear } from "./timetable-helpers";
import { shouldSkip, skipIfNoTestDb, testSchoolA, testSchoolB } from "./setup";

describe.skipIf(skipIfNoTestDb)("timetable grade-wide periods and Plata detach", () => {
  let board: Board;
  let otherBoard: Board;
  let classes: TtClass[];
  let history: TtSubject;
  let english: TtSubject;
  let otherSubject: TtSubject;
  let teacher: TtTeacher;

  const cls = (grade: number, number: number) => classes.find((c) => c.grade === grade && c.number === number)!.id;
  const blocksOf = async (subjectId: string) =>
    (await listBlocks(testSchoolA, board.id)).filter((b) => b.subjectId === subjectId);

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(testSchoolA);
    board = await createBoard(testSchoolA, boardName("grade-periods"));
    otherBoard = await createBoard(testSchoolA, boardName("grade-periods-other"));
    await setGradeClassCount(testSchoolA, board.id, 7, 4);
    classes = await setGradeClassCount(testSchoolA, board.id, 8, 2);
    [history, english] = await addSubjects(testSchoolA, board.id, ["היסטוריה", "אנגלית"]);
    [otherSubject] = await addSubjects(testSchoolA, otherBoard.id, ["היסטוריה"]);
    [teacher] = await addTeachers(testSchoolA, board.id, ["מורה להיסטוריה 1"]);
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await deleteBoard(testSchoolA, board.id);
    await deleteBoard(testSchoolA, otherBoard.id);
  });

  it("sets every class of the grade, keeping teachers and leaving other grades alone", async () => {
    await createBlock(testSchoolA, board.id, { subjectId: history.id, weeklyPeriods: 2, classIds: [cls(7, 1)], teacherIds: [teacher.id] });
    await createBlock(testSchoolA, board.id, { subjectId: history.id, weeklyPeriods: 2, classIds: [cls(8, 1)], teacherIds: [] });

    const result = await setGradeSubjectPeriods(testSchoolA, board.id, { grade: 7, subjectId: history.id, weeklyPeriods: 3 });
    expect(result).toEqual({ updated: 1, created: 3 });

    const blocks = await blocksOf(history.id);
    const grade7 = blocks.filter((b) => classes.find((c) => c.id === b.classIds[0])!.grade === 7);
    expect(grade7).toHaveLength(4);
    expect(grade7.every((b) => b.weeklyPeriods === 3 && b.classIds.length === 1)).toBe(true);
    expect(grade7.find((b) => b.classIds[0] === cls(7, 1))!.teacherIds).toEqual([teacher.id]);
    expect(blocks.find((b) => b.classIds[0] === cls(8, 1))!.weeklyPeriods).toBe(2);

    // Running it again only updates: no second lesson per class.
    expect(await setGradeSubjectPeriods(testSchoolA, board.id, { grade: 7, subjectId: history.id, weeklyPeriods: 3 }))
      .toEqual({ updated: 4, created: 0 });
  });

  it("changes a Plata's periods too, as one block", async () => {
    const plata = await createBlock(testSchoolA, board.id, {
      subjectId: english.id, weeklyPeriods: 4, classIds: [cls(7, 1), cls(7, 2), cls(7, 3)], teacherIds: [],
    });
    await setGradeSubjectPeriods(testSchoolA, board.id, { grade: 7, subjectId: english.id, weeklyPeriods: 5 });
    const blocks = await blocksOf(english.id);
    expect(blocks.find((b) => b.id === plata.id)!.weeklyPeriods).toBe(5);
    expect(blocks.filter((b) => b.classIds.includes(cls(7, 4))).map((b) => b.weeklyPeriods)).toEqual([5]);
  });

  it("takes a class out of a Plata into its own lesson", async () => {
    const [plata] = (await blocksOf(english.id)).filter((b) => b.classIds.length === 3);
    const own = await detachClassFromPlata(testSchoolA, board.id, plata.id, cls(7, 3));
    expect(own).toMatchObject({ subjectId: english.id, weeklyPeriods: 5, classIds: [cls(7, 3)], teacherIds: [] });

    const blocks = await blocksOf(english.id);
    expect(blocks.find((b) => b.id === plata.id)!.classIds.sort()).toEqual([cls(7, 1), cls(7, 2)].sort());
    expect(blocks.filter((b) => b.classIds.includes(cls(7, 3)))).toHaveLength(1);
  });

  it("refuses a class not in the Plata, a lone lesson, and a block of another board", async () => {
    const [plata] = (await blocksOf(english.id)).filter((b) => b.classIds.length === 2);
    await expect(detachClassFromPlata(testSchoolA, board.id, plata.id, cls(7, 4))).rejects.toMatchObject({ code: "unknown_id" });
    const [lone] = (await blocksOf(english.id)).filter((b) => b.classIds.length === 1);
    await expect(detachClassFromPlata(testSchoolA, board.id, lone.id, lone.classIds[0])).rejects.toMatchObject({ code: "unknown_id" });
    expect(await detachClassFromPlata(testSchoolA, otherBoard.id, plata.id, cls(7, 1))).toBeNull();
  });

  it("refuses a subject of another board and anything from another school", async () => {
    await expect(setGradeSubjectPeriods(testSchoolA, board.id, { grade: 7, subjectId: otherSubject.id, weeklyPeriods: 2 }))
      .rejects.toMatchObject({ code: "unknown_id" });
    await expect(setGradeSubjectPeriods(testSchoolB, board.id, { grade: 7, subjectId: history.id, weeklyPeriods: 2 }))
      .rejects.toThrow();
    const [plata] = (await blocksOf(english.id)).filter((b) => b.classIds.length === 2);
    expect(await detachClassFromPlata(testSchoolB, board.id, plata.id, cls(7, 1))).toBeNull();
    expect((await blocksOf(history.id)).every((b) => b.weeklyPeriods !== 2 || b.classIds[0] === cls(8, 1))).toBe(true);
  });
});
