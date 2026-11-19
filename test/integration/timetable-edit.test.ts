import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { ttBoards, ttPlacements, ttRuns, ttSolutions } from "@/lib/db/schema-timetable";
import { createBoard, deleteBoard, type Board } from "@/lib/timetable/boards";
import { createBlock } from "@/lib/timetable/blocks";
import { setGradeClassCount } from "@/lib/timetable/classes";
import { editPlacement, evaluateSolution, publishSolution, type SolutionRef } from "@/lib/timetable/edit";
import { SolverCallError } from "@/lib/timetable/solver-client";
import { executeRun, getRun, startRun, type SolveFn } from "@/lib/timetable/runs";
import type { Slot } from "@/lib/timetable/grid";
import type { PlacementEdit } from "@/lib/validations/timetable-runs";
import { addSubjects } from "@/lib/timetable/subjects";
import { addTeachers } from "@/lib/timetable/teachers";
import { boardName, ensureActiveYear } from "./timetable-helpers";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

const move = (blockId: string, from: Slot | null, to: Slot | null): PlacementEdit => ({ action: "move", blockId, from, to });

describe.skipIf(skipIfNoTestDb)("timetable edit", () => {
  let board: Board;
  let otherBoard: Board;
  let staffId: string;
  let blockX: string; // class 1, teacher 1, 1 period
  let blockY: string; // class 2, teacher 1, 1 period (shares the teacher with X)
  let blockW: string; // class 1, teacher 2, 2 periods (one placed)
  let otherBlock: string;
  let ref: SolutionRef;
  let otherRef: SolutionRef;

  const solveFixed =
    (slots: Record<string, [number, number]>): SolveFn =>
    async (input) => ({
      version: 1,
      status: "ok",
      score: 1,
      placements: input.blocks.map((b) => ({ blockId: b.id, day: slots[b.id]?.[0] ?? 0, period: slots[b.id]?.[1] ?? 1 })),
      violations: [],
    });

  async function solutionFor(target: Board, solve: SolveFn): Promise<SolutionRef> {
    await testDb!.delete(ttRuns).where(eq(ttRuns.boardId, target.id));
    const { runId } = await startRun(testSchoolA, target.id, staffId);
    await executeRun(testSchoolA, runId, solve);
    const run = await getRun(testSchoolA, target.id, runId);
    return { boardId: target.id, runId, solutionId: run!.solutions[0].id };
  }

  const freshRef = async () => {
    ref = await solutionFor(board, solveFixed({ [blockX]: [0, 1], [blockY]: [0, 2], [blockW]: [0, 3] }));
  };
  const rows = (solutionId: string) => testDb!.select().from(ttPlacements).where(eq(ttPlacements.solutionId, solutionId));
  const rowsOf = async (blockId: string) => (await rows(ref.solutionId)).filter((r) => r.blockId === blockId);
  const storedRow = async (solutionId: string) =>
    (await testDb!.select().from(ttSolutions).where(eq(ttSolutions.id, solutionId)))[0];
  const stale = async (solutionId: string) =>
    (await testDb!.select().from(ttSolutions).where(eq(ttSolutions.id, solutionId)))[0].reportStale;

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(testSchoolA);
    const [staff] = await testDb!
      .insert(schema.staffUsers)
      .values({ id: randomUUID(), schoolId: testSchoolA, email: `${randomUUID()}@edit.test`, fullName: "edit", role: "admin" })
      .returning({ id: schema.staffUsers.id });
    staffId = staff.id;

    board = await createBoard(testSchoolA, boardName("edit"));
    const [c1, c2] = await setGradeClassCount(testSchoolA, board.id, 9, 2);
    const [math, english, art] = await addSubjects(testSchoolA, board.id, ["מתמטיקה", "אנגלית", "אמנות"]);
    const [t1, t2] = await addTeachers(testSchoolA, board.id, ["א", "ב"]);
    blockX = (await createBlock(testSchoolA, board.id, { subjectId: math.id, weeklyPeriods: 1, classIds: [c1.id], teacherIds: [t1.id] })).id;
    blockY = (await createBlock(testSchoolA, board.id, { subjectId: english.id, weeklyPeriods: 1, classIds: [c2.id], teacherIds: [t1.id] })).id;
    blockW = (await createBlock(testSchoolA, board.id, { subjectId: art.id, weeklyPeriods: 2, classIds: [c1.id], teacherIds: [t2.id] })).id;

    otherBoard = await createBoard(testSchoolA, boardName("edit-other"));
    const [oc] = await setGradeClassCount(testSchoolA, otherBoard.id, 9, 1);
    const [os] = await addSubjects(testSchoolA, otherBoard.id, ["מתמטיקה"]);
    const [ot] = await addTeachers(testSchoolA, otherBoard.id, ["ג"]);
    otherBlock = (await createBlock(testSchoolA, otherBoard.id, { subjectId: os.id, weeklyPeriods: 1, classIds: [oc.id], teacherIds: [ot.id] })).id;
    otherRef = await solutionFor(otherBoard, solveFixed({}));

  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await deleteBoard(testSchoolA, board.id);
    await deleteBoard(testSchoolA, otherBoard.id);
    await testDb!.delete(schema.staffUsers).where(eq(schema.staffUsers.id, staffId));
  });

  it("moveChangesSlotPinsAndMarksStale", async () => {
    await freshRef();
    expect(await editPlacement(testSchoolA, ref, move(blockX, { day: 0, period: 1 }, { day: 1, period: 4 }))).toBe(true);
    expect((await rowsOf(blockX))[0]).toMatchObject({ day: 1, period: 4, pinned: true });
    expect(await stale(ref.solutionId)).toBe(true);
  });

  it("moveToTrayDeletesRow", async () => {
    await freshRef();
    expect(await editPlacement(testSchoolA, ref, move(blockW, { day: 0, period: 3 }, null))).toBe(true);
    expect(await rowsOf(blockW)).toHaveLength(0);
    expect(await stale(ref.solutionId)).toBe(true);
  });

  it("placeFromTrayInsertsPinnedRow", async () => {
    await freshRef();
    expect(await editPlacement(testSchoolA, ref, move(blockW, null, { day: 2, period: 2 }))).toBe(true);
    const placed = await rowsOf(blockW);
    expect(placed).toHaveLength(2);
    expect(placed.find((r) => r.day === 2)).toMatchObject({ period: 2, pinned: true });
    expect(await stale(ref.solutionId)).toBe(true);
  });

  it("placeFullyPlacedBlockIsRefused", async () => {
    await freshRef();
    await expect(editPlacement(testSchoolA, ref, move(blockX, null, { day: 2, period: 2 }))).rejects.toMatchObject({ code: "fully_placed" });
    expect(await rowsOf(blockX)).toHaveLength(1);
  });

  it("moveOutsideWeekIsRefused", async () => {
    await freshRef();
    await expect(editPlacement(testSchoolA, ref, move(blockX, { day: 0, period: 1 }, { day: 5, period: 6 }))).rejects.toMatchObject({
      code: "not_in_week",
    });
    expect((await rowsOf(blockX))[0]).toMatchObject({ day: 0, period: 1 });
  });

  it("moveOntoSameBlockIsRefused", async () => {
    await freshRef();
    await editPlacement(testSchoolA, ref, move(blockW, null, { day: 2, period: 2 }));
    await expect(editPlacement(testSchoolA, ref, move(blockW, { day: 0, period: 3 }, { day: 2, period: 2 }))).rejects.toMatchObject({
      code: "slot_taken",
    });
    expect(await rowsOf(blockW)).toHaveLength(2);
  });

  it("moveIntoClashIsAllowed", async () => {
    await freshRef();
    expect(await editPlacement(testSchoolA, ref, move(blockY, { day: 0, period: 2 }, { day: 0, period: 1 }))).toBe(true);
    const atSlot = (await rows(ref.solutionId)).filter((r) => r.day === 0 && r.period === 1);
    expect(atSlot.map((r) => r.blockId).sort()).toEqual([blockX, blockY].sort());
  });

  it("missingSourceReturnsFalse", async () => {
    await freshRef();
    const edit = move(blockX, { day: 0, period: 1 }, { day: 1, period: 4 });
    expect(await editPlacement(testSchoolA, ref, edit)).toBe(true);
    expect(await editPlacement(testSchoolA, ref, edit)).toBe(false);
    expect(await rowsOf(blockX)).toHaveLength(1);
  });

  it("pinTogglesWithoutStale", async () => {
    await freshRef();
    const edit: PlacementEdit = { action: "pin", blockId: blockX, day: 0, period: 1, pinned: true };
    expect(await editPlacement(testSchoolA, ref, edit)).toBe(true);
    expect((await rowsOf(blockX))[0].pinned).toBe(true);
    expect(await stale(ref.solutionId)).toBe(false);
    expect(await editPlacement(testSchoolA, ref, { ...edit, pinned: false })).toBe(true);
    expect((await rowsOf(blockX))[0].pinned).toBe(false);
    expect(await editPlacement(testSchoolA, ref, { ...edit, period: 9 })).toBe(false);
  });

  it("otherBoardsSolutionIsNotFound", async () => {
    const before = await rows(otherRef.solutionId);
    const crossed = { ...otherRef, boardId: board.id };
    expect(await editPlacement(testSchoolA, crossed, move(otherBlock, { day: 0, period: 1 }, { day: 1, period: 1 }))).toBe(false);
    expect(await rows(otherRef.solutionId)).toEqual(before);
  });

  it("failedSolutionIsRefused", async () => {
    const failing: SolveFn = async () => ({ version: 1, status: "failed", error: "boom", score: 0, placements: [], violations: [] });
    const failedRef = await solutionFor(board, failing);
    await expect(editPlacement(testSchoolA, failedRef, move(blockX, null, { day: 1, period: 1 }))).rejects.toMatchObject({
      code: "solution_failed",
    });
  });

  const published = async (target: Board) =>
    (await testDb!.select().from(ttBoards).where(eq(ttBoards.id, target.id)))[0];

  it("publishSetsBoardPublished", async () => {
    await freshRef();
    expect(await publishSolution(testSchoolA, ref)).toBe(true);
    expect(await published(board)).toMatchObject({ publishedSolutionId: ref.solutionId, status: "published" });
  });

  it("publishingAnotherReplacesIt", async () => {
    await freshRef();
    await publishSolution(testSchoolA, ref);
    const first = ref.solutionId;
    await freshRef();
    expect(await publishSolution(testSchoolA, ref)).toBe(true);
    expect((await published(board)).publishedSolutionId).toBe(ref.solutionId);
    expect(ref.solutionId).not.toBe(first);
  });

  it("publishFailedIsRefused", async () => {
    const failing: SolveFn = async () => ({ version: 1, status: "failed", error: "boom", score: 0, placements: [], violations: [] });
    const failedRef = await solutionFor(board, failing);
    await expect(publishSolution(testSchoolA, failedRef)).rejects.toMatchObject({ code: "solution_failed" });
  });

  it("publishOtherBoardsSolutionIsNotFound", async () => {
    await freshRef();
    const crossed = { ...otherRef, boardId: board.id };
    await testDb!.update(ttBoards).set({ publishedSolutionId: null, status: "review" }).where(eq(ttBoards.id, board.id));
    expect(await publishSolution(testSchoolA, crossed)).toBe(false);
    expect(await published(board)).toMatchObject({ publishedSolutionId: null, status: "review" });
  });

  describe("evaluate", () => {
    const viol = { constraintId: null, type: "teacher_clash", hard: true, count: 1, teacherIds: [], classIds: [] };
    const echo = (violations = [viol]): SolveFn => async (input) => ({
      version: 1,
      status: "ok",
      score: 7,
      placements: input.placements.map(({ blockId, day, period }) => ({ blockId, day, period })),
      violations,
    });
    const stored = async () => (await testDb!.select().from(ttSolutions).where(eq(ttSolutions.id, ref.solutionId)))[0];
    const editedRef = async () => {
      await freshRef();
      await editPlacement(testSchoolA, ref, move(blockX, { day: 0, period: 1 }, { day: 1, period: 4 }));
    };

    it("evaluateSendsCurrentPlacementsInEvaluateMode", async () => {
      await editedRef();
      let seen: Parameters<SolveFn>[0] | undefined;
      await evaluateSolution(testSchoolA, ref, async (input) => {
        seen = input;
        return echo()(input);
      });
      expect(seen!.mode).toBe("evaluate");
      expect(seen!.profile).toBe((await stored()).profile);
      expect(seen!.placements).toHaveLength(3);
      expect(seen!.placements.find((p) => p.blockId === blockX)).toEqual({ blockId: blockX, day: 1, period: 4, pinned: true });
    });

    it("evaluateStoresReportAndClearsStale", async () => {
      await editedRef();
      const result = await evaluateSolution(testSchoolA, ref, echo());
      expect(result).toMatchObject({ ok: true, solution: { reportStale: false, score: 7, violations: [viol] } });
      expect(await stored()).toMatchObject({ reportStale: false, score: 7, violations: [viol] });
    });

    it("evaluateRejectsDifferentPlacements", async () => {
      await editedRef();
      const different: SolveFn = async (input) => ({ ...(await echo()(input)), placements: [{ blockId: blockX, day: 4, period: 1 }] });
      expect(await evaluateSolution(testSchoolA, ref, different)).toEqual({ ok: false, error: "evaluate_unsupported" });
      expect(await stored()).toMatchObject({ reportStale: true, violations: [] });
    });

    it("evaluateSolverErrorIsReported", async () => {
      await editedRef();
      const boom: SolveFn = async () => {
        throw new SolverCallError("solver_http_error", 500);
      };
      expect(await evaluateSolution(testSchoolA, ref, boom)).toEqual({ ok: false, error: "solver_http_error" });
      expect(await stored()).toMatchObject({ reportStale: true, violations: [] });
    });

    it("evaluateRefusesWhenPlacementsChangedMeanwhile", async () => {
      await editedRef();
      const editsWhileSolving: SolveFn = async (input) => {
        await editPlacement(testSchoolA, ref, move(blockY, { day: 0, period: 2 }, { day: 2, period: 5 }));
        return echo()(input);
      };
      expect(await evaluateSolution(testSchoolA, ref, editsWhileSolving)).toEqual({ ok: false, error: "placements_changed" });
      expect(await stored()).toMatchObject({ reportStale: true, violations: [] });
    });

    it("evaluateOtherBoardsSolutionIsNotFound", async () => {
      expect(await evaluateSolution(testSchoolA, { ...otherRef, boardId: board.id }, echo())).toBeNull();
    });
  });

  describe("cross-school denial", () => {
    it("school B cannot edit, publish or evaluate school A's solution, nor regenerate from it", async () => {
      await freshRef();
      const runsBefore = await testDb!.select().from(ttRuns).where(eq(ttRuns.boardId, board.id));
      const before = await rows(ref.solutionId);
      const reportBefore = await storedRow(ref.solutionId);

      expect(await editPlacement(testSchoolB, ref, move(blockX, { day: 0, period: 1 }, { day: 1, period: 4 }))).toBe(false);
      expect(await publishSolution(testSchoolB, ref)).toBe(false);
      expect(await evaluateSolution(testSchoolB, ref, async () => {
        throw new Error("solver must not be called");
      })).toBeNull();
      await expect(startRun(testSchoolB, board.id, staffId, new Date(), ref.solutionId)).rejects.toThrow();

      expect(await rows(ref.solutionId)).toEqual(before);
      expect(await storedRow(ref.solutionId)).toEqual(reportBefore);
      const [boardRow] = await testDb!.select().from(ttBoards).where(eq(ttBoards.id, board.id));
      expect(boardRow.publishedSolutionId).not.toBe(ref.solutionId);
      expect(await testDb!.select().from(ttRuns).where(eq(ttRuns.boardId, board.id))).toHaveLength(runsBefore.length);
    });
  });
});
