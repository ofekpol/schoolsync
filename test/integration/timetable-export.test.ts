import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBoard, deleteBoard, type Board } from "@/lib/timetable/boards";
import { createBlock, listBlocks } from "@/lib/timetable/blocks";
import { setGradeClassCount } from "@/lib/timetable/classes";
import { buildSolverInput } from "@/lib/timetable/export";
import { SolverInputSchema } from "@/lib/timetable/solver-contract";
import { addSubjects } from "@/lib/timetable/subjects";
import { addTeachers } from "@/lib/timetable/teachers";
import { boardName, ensureActiveYear } from "./timetable-helpers";
import { shouldSkip, skipIfNoTestDb, testSchoolA, testSchoolB } from "./setup";

describe.skipIf(skipIfNoTestDb)("timetable export", () => {
  let board: Board;
  let unteachedId: string;

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(testSchoolA);
    board = await createBoard(testSchoolA, boardName("export"));
    const [c1, c2] = await setGradeClassCount(testSchoolA, board.id, 9, 2);
    const [math, english] = await addSubjects(testSchoolA, board.id, ["מתמטיקה", "אנגלית"]);
    const [t1, t2] = await addTeachers(testSchoolA, board.id, ["א", "ב"]);
    await createBlock(testSchoolA, board.id, { subjectId: math.id, weeklyPeriods: 5, classIds: [c1.id, c2.id], teacherIds: [t1.id, t2.id] });
    await createBlock(testSchoolA, board.id, { subjectId: english.id, weeklyPeriods: 4, classIds: [c1.id], teacherIds: [t1.id] });
    unteachedId = (
      await createBlock(testSchoolA, board.id, { subjectId: english.id, weeklyPeriods: 4, classIds: [c2.id], teacherIds: [] })
    ).id;
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await deleteBoard(testSchoolA, board.id);
  });

  it("exports a valid solver input with the board's blocks and its one problem", async () => {
    const result = await buildSolverInput(testSchoolA, board.id);
    expect(result).not.toBeNull();
    expect(SolverInputSchema.safeParse(result!.input).success).toBe(true);
    const blockIds = (await listBlocks(testSchoolA, board.id)).map((b) => b.id).sort();
    expect(result!.input.blocks.map((b) => b.id).sort()).toEqual(blockIds);
    expect(result!.problems).toEqual([{ code: "block_without_teacher", blockId: unteachedId }]);
    expect(JSON.stringify(result!.input)).not.toMatch(/מתמטיקה|אנגלית/);
  });

  it("returns null for an unknown board and for another school's board", async () => {
    expect(await buildSolverInput(testSchoolA, randomUUID())).toBeNull();
    expect(await buildSolverInput(testSchoolB, board.id)).toBeNull();
  });
});
