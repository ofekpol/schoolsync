import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { ttPlacements, ttRuns } from "@/lib/db/schema-timetable";
import { createBoard, deleteBoard, type Board } from "@/lib/timetable/boards";
import { createBlock, listBlocks } from "@/lib/timetable/blocks";
import { setGradeClassCount } from "@/lib/timetable/classes";
import { TimetableError } from "@/lib/timetable/errors";
import { getRun, listRuns, startRun, executeRun, MAX_RUNS_PER_BOARD, type SolveFn } from "@/lib/timetable/runs";
import { SolverCallError } from "@/lib/timetable/solver-client";
import { SolverInputSchema } from "@/lib/timetable/solver-contract";
import { addSubjects } from "@/lib/timetable/subjects";
import { addTeachers } from "@/lib/timetable/teachers";
import { boardName, ensureActiveYear } from "./timetable-helpers";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

const MINUTE_MS = 60_000;

describe.skipIf(skipIfNoTestDb)("timetable runs", () => {
  let board: Board;
  let problemBoard: Board;
  let staffId: string;
  let blockCount = 0;

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
    await createBlock(testSchoolA, board.id, { subjectId: math.id, weeklyPeriods: 3, classIds: [c1.id], teacherIds: [t1.id] });
    await createBlock(testSchoolA, board.id, { subjectId: english.id, weeklyPeriods: 2, classIds: [c1.id], teacherIds: [t1.id] });
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
});
