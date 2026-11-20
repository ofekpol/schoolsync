import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { ttBoards, ttPlacements, ttRuns, ttSolutions } from "@/lib/db/schema-timetable";
import { publishSolution } from "@/lib/timetable/edit";
import { DEFAULT_WEEK } from "@/lib/timetable/week";
import { createBoard, deleteBoard, type Board } from "@/lib/timetable/boards";
import { createBlock, deleteBlock, listBlocks } from "@/lib/timetable/blocks";
import { listClasses, setGradeClassCount } from "@/lib/timetable/classes";
import { TimetableError } from "@/lib/timetable/errors";
import { getRun, listRuns, startRun, executeRun, MAX_RUNS_PER_BOARD, type SolveFn } from "@/lib/timetable/runs";
import { getSolutionGrid } from "@/lib/timetable/solutions";
import { SolverCallError } from "@/lib/timetable/solver-client";
import { SolverInputSchema, type SolverInput, type SolverPlacement } from "@/lib/timetable/solver-contract";
import { addSubjects } from "@/lib/timetable/subjects";
import { addTeachers, deleteTeacher } from "@/lib/timetable/teachers";
import { boardName, ensureActiveYear } from "./timetable-helpers";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

const MINUTE_MS = 60_000;

describe.skipIf(skipIfNoTestDb)("timetable runs", () => {
  let board: Board;
  let problemBoard: Board;
  let staffId: string;
  let blockCount = 0;
  let mathId: string;
  let englishId: string;
  let teacherId: string;

  const solveOk: SolveFn = async (input) => ({
    version: 1,
    status: "ok",
    score: 1,
    placements: input.blocks.map((block, index) => ({ blockId: block.id, day: 0, period: index + 1 })),
    violations: [],
  });

  async function reset(): Promise<void> {
    await testDb!.delete(ttRuns).where(eq(ttRuns.boardId, board.id));
  }

  beforeAll(async () => {
    if (shouldSkip()) return;
    await ensureActiveYear(testSchoolA);
    const [staff] = await testDb!
      .insert(schema.staffUsers)
      .values({ id: randomUUID(), schoolId: testSchoolA, email: `${randomUUID()}@runs.test`, fullName: "runs", role: "admin" })
      .returning({ id: schema.staffUsers.id });
    staffId = staff.id;

    board = await createBoard(testSchoolA, boardName("runs"));
    const [c1] = await setGradeClassCount(testSchoolA, board.id, 9, 1);
    const [math, english] = await addSubjects(testSchoolA, board.id, ["מתמטיקה", "אנגלית"]);
    const [t1] = await addTeachers(testSchoolA, board.id, ["א"]);
    teacherId = t1.id;
    mathId = (await createBlock(testSchoolA, board.id, { subjectId: math.id, weeklyPeriods: 3, classIds: [c1.id], teacherIds: [t1.id] })).id;
    englishId = (await createBlock(testSchoolA, board.id, { subjectId: english.id, weeklyPeriods: 2, classIds: [c1.id], teacherIds: [t1.id] })).id;
    blockCount = (await listBlocks(testSchoolA, board.id)).length;

    problemBoard = await createBoard(testSchoolA, boardName("runs-problem"));
    const [pc] = await setGradeClassCount(testSchoolA, problemBoard.id, 9, 1);
    const [pm] = await addSubjects(testSchoolA, problemBoard.id, ["מתמטיקה"]);
    await createBlock(testSchoolA, problemBoard.id, { subjectId: pm.id, weeklyPeriods: 3, classIds: [pc.id], teacherIds: [] });
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await deleteBoard(testSchoolA, board.id);
    await deleteBoard(testSchoolA, problemBoard.id);
    await testDb!.delete(schema.staffUsers).where(eq(schema.staffUsers.id, staffId));
  });

  it("startRunStoresQueuedRunWithInput", async () => {
    await reset();
    const { runId } = await startRun(testSchoolA, board.id, staffId);
    const [row] = await testDb!.select().from(ttRuns).where(eq(ttRuns.id, runId));
    expect(row.status).toBe("queued");
    expect(row.requestedBy).toBe(staffId);
    expect(row.input).not.toHaveProperty("profile");
    expect(SolverInputSchema.safeParse({ ...(row.input as object), profile: "balanced" }).success).toBe(true);
  });

  it("startRunRefusesBoardWithProblems", async () => {
    const error = await startRun(testSchoolA, problemBoard.id, staffId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimetableError);
    expect((error as TimetableError).code).toBe("input_problems");
    expect((error as TimetableError).details).toHaveLength(1);
    expect(await listRuns(testSchoolA, problemBoard.id)).toEqual([]);
  });

  it("secondStartWhileRunningIsRefused", async () => {
    await reset();
    await startRun(testSchoolA, board.id, staffId);
    await expect(startRun(testSchoolA, board.id, staffId)).rejects.toMatchObject({ code: "run_in_progress" });
  });

  it("staleRunIsFailedAndDoesNotBlock", async () => {
    await reset();
    const start = new Date();
    const { runId } = await startRun(testSchoolA, board.id, staffId, start);
    const later = new Date(start.getTime() + 7 * MINUTE_MS);
    const run = await getRun(testSchoolA, board.id, runId, later);
    expect(run).toMatchObject({ status: "failed", error: "timed_out" });
    await expect(startRun(testSchoolA, board.id, staffId, later)).resolves.toHaveProperty("runId");
  });

  it("executeRunSavesThreeSolutions", async () => {
    await reset();
    const { runId } = await startRun(testSchoolA, board.id, staffId);
    await executeRun(testSchoolA, runId, solveOk);
    const run = await getRun(testSchoolA, board.id, runId);
    expect(run!.status).toBe("done");
    expect(run!.finishedAt).not.toBeNull();
    expect(run!.solutions.map((s) => s.profile).sort()).toEqual(["balanced", "classes", "teachers"]);
    expect(run!.solutions.every((s) => s.status === "ok")).toBe(true);
    const placements = await testDb!.select().from(ttPlacements).where(eq(ttPlacements.schoolId, testSchoolA));
    const ids = new Set(run!.solutions.map((s) => s.id));
    expect(placements.filter((p) => ids.has(p.solutionId))).toHaveLength(3 * blockCount);
  });

  it("oneProfileFailingStillSavesTheOthers", async () => {
    await reset();
    const { runId } = await startRun(testSchoolA, board.id, staffId);
    const solve: SolveFn = (input) =>
      input.profile === "classes" ? Promise.reject(new SolverCallError("solver_http_error", 500)) : solveOk(input);
    await executeRun(testSchoolA, runId, solve);
    const run = await getRun(testSchoolA, board.id, runId);
    expect(run!.status).toBe("done");
    const failed = run!.solutions.find((s) => s.profile === "classes");
    expect(failed).toMatchObject({ status: "failed", error: "solver_http_error" });
    expect(run!.solutions.filter((s) => s.status === "ok")).toHaveLength(2);
  });

  it("allProfilesFailingFailsTheRun", async () => {
    await reset();
    const { runId } = await startRun(testSchoolA, board.id, staffId);
    const solve: SolveFn = async () => ({ version: 1, status: "failed", error: "boom", score: 0, placements: [], violations: [] });
    await executeRun(testSchoolA, runId, solve);
    const run = await getRun(testSchoolA, board.id, runId);
    expect(run!.status).toBe("failed");
    expect(run!.solutions.every((s) => s.status === "failed" && s.error === "solver_failed")).toBe(true);
  });

  it("twentyFirstRunDeletesTheOldest", async () => {
    await reset();
    const base = new Date(Date.now() - 2 * 60 * MINUTE_MS);
    const rows = Array.from({ length: MAX_RUNS_PER_BOARD }, (_, i) => ({
      schoolId: testSchoolA,
      boardId: board.id,
      status: "done" as const,
      input: {},
      createdAt: new Date(base.getTime() + i * 1000),
    }));
    const inserted = await testDb!.insert(ttRuns).values(rows).returning({ id: ttRuns.id, createdAt: ttRuns.createdAt });
    const oldestId = [...inserted].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())[0].id;
    expect(await listRuns(testSchoolA, board.id)).toHaveLength(MAX_RUNS_PER_BOARD);
    const { runId: newest } = await startRun(testSchoolA, board.id, staffId);
    const runs = await listRuns(testSchoolA, board.id);
    expect(runs).toHaveLength(MAX_RUNS_PER_BOARD);
    expect(runs.map((r) => r.id)).not.toContain(oldestId);
    expect(runs[0].id).toBe(newest);
  });

  it("otherSchoolCannotReadRun", async () => {
    await reset();
    const { runId } = await startRun(testSchoolA, board.id, staffId);
    expect(await getRun(testSchoolB, board.id, runId)).toBeNull();
    expect(await listRuns(testSchoolB, board.id)).toEqual([]);
  });

  it("gridSurvivesDeletedTeacher", async () => {
    await reset();
    const [gone] = await addTeachers(testSchoolA, board.id, ["נמחק"]);
    const [subject] = await addSubjects(testSchoolA, board.id, ["תנך"]);
    const [cls] = await listClasses(testSchoolA, board.id);
    const goneBlock = await createBlock(testSchoolA, board.id, { subjectId: subject.id, weeklyPeriods: 1, classIds: [cls.id], teacherIds: [gone.id] });
    const { runId } = await startRun(testSchoolA, board.id, staffId);
    await executeRun(testSchoolA, runId, solveOk);
    await deleteBlock(testSchoolA, goneBlock.id);
    await deleteTeacher(testSchoolA, gone.id);
    const run = await getRun(testSchoolA, board.id, runId);
    const solution = run!.solutions[0];
    const grid = await getSolutionGrid(testSchoolA, board.id, runId, solution.id);
    expect(grid!.lessons).toHaveLength(blockCount + 1);
    expect(grid!.solution.id).toBe(solution.id);
    expect(grid!.names.teachers).not.toHaveProperty(gone.id);
    expect(Object.values(grid!.names.teachers)).toContain("א");
    expect(await getSolutionGrid(testSchoolB, board.id, runId, solution.id)).toBeNull();
    expect(await getSolutionGrid(testSchoolA, board.id, randomUUID(), solution.id)).toBeNull();
  });

  async function firstSolution(solve: SolveFn) {
    await reset();
    const { runId } = await startRun(testSchoolA, board.id, staffId);
    await executeRun(testSchoolA, runId, solve);
    const run = await getRun(testSchoolA, board.id, runId);
    return { runId, solution: run!.solutions[0] };
  }

  it("gridListsUnplacedLessons", async () => {
    const solveShort: SolveFn = async (input) => ({
      version: 1,
      status: "ok",
      score: 1,
      placements: input.blocks.filter((block) => block.weeklyPeriods === 3).map((block) => ({ blockId: block.id, day: 0, period: 1 })),
      violations: [],
    });
    const { runId, solution } = await firstSolution(solveShort);
    const grid = await getSolutionGrid(testSchoolA, board.id, runId, solution.id);
    expect(grid!.lessons).toHaveLength(1);
    expect(grid!.unplaced.map((u) => u.missing).sort()).toEqual([2, 2]);
  });

  it("gridMarksPublished", async () => {
    const { runId, solution } = await firstSolution(solveOk);
    expect((await getSolutionGrid(testSchoolA, board.id, runId, solution.id))!.published).toBe(false);
    await testDb!.update(ttBoards).set({ publishedSolutionId: solution.id }).where(eq(ttBoards.id, board.id));
    try {
      expect((await getSolutionGrid(testSchoolA, board.id, runId, solution.id))!.published).toBe(true);
    } finally {
      await testDb!.update(ttBoards).set({ publishedSolutionId: null }).where(eq(ttBoards.id, board.id));
    }
  });

  it("newSolutionReportIsFresh", async () => {
    const { solution } = await firstSolution(solveOk);
    expect(solution.reportStale).toBe(false);
  });

  describe("regenerate around pins", () => {
    const pin = (blockId: string, day: number, period: number, pinned = true): SolverPlacement => ({ blockId, day, period, pinned });
    const key = (p: SolverPlacement) => `${p.blockId}:${p.day}:${p.period}`;
    const sorted = (rows: SolverPlacement[]) => [...rows].sort((a, b) => key(a).localeCompare(key(b)));

    /** A finished run whose first solution holds exactly `rows`. */
    async function sourceWith(rows: SolverPlacement[]): Promise<string> {
      const { solution } = await firstSolution(solveOk);
      await testDb!.delete(ttPlacements).where(eq(ttPlacements.solutionId, solution.id));
      await testDb!.insert(ttPlacements).values(rows.map((r) => ({ ...r, schoolId: testSchoolA, solutionId: solution.id })));
      return solution.id;
    }

    async function regenerate(fromSolutionId: string, solve: SolveFn) {
      const { runId } = await startRun(testSchoolA, board.id, staffId, new Date(), fromSolutionId);
      await executeRun(testSchoolA, runId, solve);
      const solution = (await getRun(testSchoolA, board.id, runId))!.solutions.find((s) => s.profile === "balanced")!;
      const rows = await testDb!.select().from(ttPlacements).where(eq(ttPlacements.solutionId, solution.id));
      return { solution, rows };
    }

    it("regenerateSendsPinnedOnly", async () => {
      const pins = [pin(mathId, 0, 1), pin(mathId, 0, 2)];
      const source = await sourceWith([...pins, pin(mathId, 1, 1, false), pin(englishId, 1, 2, false), pin(englishId, 1, 3, false)]);
      const seen: SolverInput[] = [];
      await regenerate(source, (input) => {
        seen.push(input);
        return solveOk(input);
      });
      expect(seen).toHaveLength(3);
      expect(sorted(seen[0].placements)).toEqual(sorted(pins));
    });

    it("stalePinsAreDropped", async () => {
      const [cls] = await listClasses(testSchoolA, board.id);
      const [subject] = await addSubjects(testSchoolA, board.id, ["זמני"]);
      const temp = await createBlock(testSchoolA, board.id, { subjectId: subject.id, weeklyPeriods: 1, classIds: [cls.id], teacherIds: [teacherId] });
      const source = await sourceWith([
        pin(temp.id, 0, 3),
        pin(mathId, 5, 5),
        pin(englishId, 0, 4),
        pin(englishId, 0, 5),
        pin(englishId, 0, 6), // over the block's weeklyPeriods (2)
      ]);
      await deleteBlock(testSchoolA, temp.id);
      const shortFriday = { days: DEFAULT_WEEK.days.map((d) => (d.day === 5 ? { ...d, periods: d.periods.slice(0, 4) } : d)) };
      await testDb!.update(ttBoards).set({ week: shortFriday }).where(eq(ttBoards.id, board.id));
      try {
        const { runId } = await startRun(testSchoolA, board.id, staffId, new Date(), source);
        const [row] = await testDb!.select().from(ttRuns).where(eq(ttRuns.id, runId));
        const input = row.input as SolverInput;
        expect(sorted(input.placements)).toEqual([pin(englishId, 0, 4), pin(englishId, 0, 5)]);
        expect(SolverInputSchema.safeParse({ ...input, profile: "balanced" }).success).toBe(true);
      } finally {
        await testDb!.update(ttBoards).set({ week: DEFAULT_WEEK }).where(eq(ttBoards.id, board.id));
      }
    });

    it("keptPinsStayPinned", async () => {
      const pins = [pin(mathId, 2, 1), pin(mathId, 2, 2)];
      const source = await sourceWith(pins);
      const echo: SolveFn = async (input) => ({
        ...(await solveOk(input)),
        placements: [...input.placements.map(({ blockId, day, period }) => ({ blockId, day, period })), { blockId: englishId, day: 3, period: 1 }],
      });
      const { solution, rows } = await regenerate(source, echo);
      expect(sorted(rows.filter((r) => r.pinned).map((r) => pin(r.blockId, r.day, r.period)))).toEqual(sorted(pins));
      expect(rows.find((r) => r.blockId === englishId)!.pinned).toBe(false);
      expect(solution.violations.map((v) => v.type)).not.toContain("pin_moved");
    });

    it("movedPinsAreReported", async () => {
      const source = await sourceWith([pin(mathId, 2, 1), pin(mathId, 2, 2)]);
      const { solution, rows } = await regenerate(source, solveOk);
      expect(rows.every((r) => !r.pinned)).toBe(true);
      expect(solution.violations).toContainEqual({ constraintId: null, type: "pin_moved", hard: true, count: 2, teacherIds: [], classIds: [] });
    });

    it("regenerateFromOtherBoardIsRefused", async () => {
      await reset();
      const [otherRun] = await testDb!
        .insert(ttRuns)
        .values({ schoolId: testSchoolA, boardId: problemBoard.id, status: "done", input: {} })
        .returning({ id: ttRuns.id });
      try {
        const [other] = await testDb!
          .insert(ttSolutions)
          .values({ schoolId: testSchoolA, runId: otherRun.id, boardId: problemBoard.id, profile: "balanced", status: "ok", score: 0, violations: [] })
          .returning({ id: ttSolutions.id });
        await expect(startRun(testSchoolA, board.id, staffId, new Date(), other.id)).rejects.toMatchObject({ code: "unknown_id" });
        await expect(startRun(testSchoolA, board.id, staffId, new Date(), randomUUID())).rejects.toMatchObject({ code: "unknown_id" });
        expect(await listRuns(testSchoolA, board.id)).toEqual([]);
      } finally {
        await testDb!.delete(ttRuns).where(eq(ttRuns.id, otherRun.id));
      }
    });

    it("publishedRunIsNotPruned", async () => {
      await reset();
      const base = new Date(Date.now() - 2 * 60 * MINUTE_MS);
      const { runId: publishedRun } = await startRun(testSchoolA, board.id, staffId, base);
      await executeRun(testSchoolA, publishedRun, solveOk);
      const solutionId = (await getRun(testSchoolA, board.id, publishedRun))!.solutions[0].id;
      expect(await publishSolution(testSchoolA, { boardId: board.id, runId: publishedRun, solutionId })).toBe(true);
      try {
        const rows = Array.from({ length: MAX_RUNS_PER_BOARD - 1 }, (_, i) => ({
          schoolId: testSchoolA,
          boardId: board.id,
          status: "done" as const,
          input: {},
          createdAt: new Date(base.getTime() + (i + 1) * 1000),
        }));
        const inserted = await testDb!.insert(ttRuns).values(rows).returning({ id: ttRuns.id, createdAt: ttRuns.createdAt });
        const oldestUnpublished = [...inserted].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())[0].id;
        await startRun(testSchoolA, board.id, staffId);
        const ids = (await listRuns(testSchoolA, board.id)).map((r) => r.id);
        expect(ids).toHaveLength(MAX_RUNS_PER_BOARD);
        expect(ids).toContain(publishedRun);
        expect(ids).not.toContain(oldestUnpublished);
        const stillPublished = await testDb!
          .select({ id: ttBoards.id })
          .from(ttBoards)
          .where(and(eq(ttBoards.id, board.id), eq(ttBoards.publishedSolutionId, solutionId)));
        expect(stillPublished).toHaveLength(1);
      } finally {
        await testDb!.update(ttBoards).set({ publishedSolutionId: null, status: board.status }).where(eq(ttBoards.id, board.id));
      }
    });
  });
});
