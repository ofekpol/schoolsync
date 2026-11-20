import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { RunResponseSchema, SolutionGridResponseSchema, RunsResponseSchema, StartRunResponseSchema } from "@/lib/validations/timetable-runs";
import { TimetableError } from "@/lib/timetable/errors";

const { getStaffUserMock, getSchoolByIdMock, getBoardMock, runs } = vi.hoisted(() => ({
  getStaffUserMock: vi.fn(),
  getSchoolByIdMock: vi.fn(),
  getBoardMock: vi.fn(),
  runs: { startRun: vi.fn(), executeRun: vi.fn(), getRun: vi.fn(), listRuns: vi.fn() },
}));
const getSolutionGridMock = vi.hoisted(() => vi.fn());
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (callback: () => unknown) => void callback() };
});
vi.mock("@/lib/auth/session", () => ({ getStaffUser: (...a: unknown[]) => getStaffUserMock(...a) }));
vi.mock("@/lib/db/schools", () => ({ getSchoolById: (...a: unknown[]) => getSchoolByIdMock(...a) }));
vi.mock("@/lib/timetable/boards", () => ({ getBoard: (...a: unknown[]) => getBoardMock(...a) }));
vi.mock("@/lib/timetable/runs", () => ({
  startRun: (...a: unknown[]) => runs.startRun(...a),
  executeRun: (...a: unknown[]) => runs.executeRun(...a),
  getRun: (...a: unknown[]) => runs.getRun(...a),
  listRuns: (...a: unknown[]) => runs.listRuns(...a),
}));

import { GET as GET_RUNS, POST as POST_RUN } from "@/app/api/v1/timetable/boards/[board]/runs/route";
vi.mock("@/lib/timetable/solutions", () => ({ getSolutionGrid: (...a: unknown[]) => getSolutionGridMock(...a) }));

import { GET as GET_SOLUTION } from "@/app/api/v1/timetable/boards/[board]/runs/[run]/solutions/[solution]/route";
import { GET as GET_RUN } from "@/app/api/v1/timetable/boards/[board]/runs/[run]/route";

const SCHOOL = "00000000-0000-0000-0000-00000000000a";
const BOARD_ID = "00000000-0000-0000-0000-0000000000b1";
const RUN_ID = "00000000-0000-0000-0000-0000000000f1";
const ADMIN = { id: "00000000-0000-0000-0000-0000000000a1", schoolId: SCHOOL, role: "admin", status: "active" };
const RUN = {
  id: RUN_ID,
  status: "done",
  error: null,
  createdAt: "2026-11-18T10:00:00.000Z",
  finishedAt: "2026-11-18T10:01:00.000Z",
  solutions: [
    {
      id: "00000000-0000-0000-0000-0000000000e1",
      profile: "balanced",
      status: "ok",
      error: null,
      score: 12,
      violations: [],
      reportStale: false,
    },
  ],
};
const req = (method: string) => new NextRequest("http://localhost/api/v1/timetable/boards/x/runs", { method });
const boardCtx = { params: Promise.resolve({ board: BOARD_ID }) };
const runCtx = (run: string) => ({ params: Promise.resolve({ board: BOARD_ID, run }) });

describe("/api/v1/timetable/boards/[board]/runs", () => {
  beforeEach(() => {
    getStaffUserMock.mockReset().mockResolvedValue(ADMIN);
    getSchoolByIdMock.mockReset().mockResolvedValue({ id: SCHOOL, services: ["gantt", "timetable"] });
    getBoardMock.mockReset().mockResolvedValue({ id: BOARD_ID });
    Object.values(runs).forEach((mock) => mock.mockReset());
  });

  it("202 on POST and schedules executeRun", async () => {
    runs.startRun.mockResolvedValue({ runId: RUN_ID });
    const res = await POST_RUN(req("POST"), boardCtx);
    expect(res.status).toBe(202);
    expect(StartRunResponseSchema.parse(await res.json())).toEqual({ runId: RUN_ID });
    expect(runs.startRun).toHaveBeenCalledWith(SCHOOL, BOARD_ID, ADMIN.id, undefined, undefined);
    expect(runs.executeRun).toHaveBeenCalledWith(SCHOOL, RUN_ID);
  });

  const post = (body: string) => new NextRequest("http://localhost/api/v1/timetable/boards/x/runs", { method: "POST", body });

  it("202 on POST with fromSolutionId passes it to startRun", async () => {
    runs.startRun.mockResolvedValue({ runId: RUN_ID });
    const res = await POST_RUN(post(JSON.stringify({ fromSolutionId: RUN_ID })), boardCtx);
    expect(res.status).toBe(202);
    expect(runs.startRun).toHaveBeenCalledWith(SCHOOL, BOARD_ID, ADMIN.id, undefined, RUN_ID);
  });

  it("400 on POST with a bad fromSolutionId or invalid JSON", async () => {
    expect((await POST_RUN(post(JSON.stringify({ fromSolutionId: "x" })), boardCtx)).status).toBe(400);
    expect((await POST_RUN(post("{nope"), boardCtx)).status).toBe(400);
    expect(runs.startRun).not.toHaveBeenCalled();
  });

  it("400 on POST for an unknown source solution", async () => {
    runs.startRun.mockRejectedValue(new TimetableError("unknown_id"));
    expect((await POST_RUN(post(JSON.stringify({ fromSolutionId: RUN_ID })), boardCtx)).status).toBe(400);
  });

  it("403 on POST for a viewer", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, role: "viewer" });
    expect((await POST_RUN(req("POST"), boardCtx)).status).toBe(403);
    expect(runs.startRun).not.toHaveBeenCalled();
  });

  it("403 demo_disabled on POST for a demo user", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, demoExpiresAt: new Date() });
    const res = await POST_RUN(req("POST"), boardCtx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "demo_disabled" });
    expect(runs.startRun).not.toHaveBeenCalled();
  });

  it("422 with problems on input_problems", async () => {
    const problems = [{ code: "x" }];
    runs.startRun.mockRejectedValue(new TimetableError("input_problems", problems));
    const res = await POST_RUN(req("POST"), boardCtx);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "input_problems", problems });
    expect(runs.executeRun).not.toHaveBeenCalled();
  });

  it("409 on run_in_progress", async () => {
    runs.startRun.mockRejectedValue(new TimetableError("run_in_progress"));
    const res = await POST_RUN(req("POST"), boardCtx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "run_in_progress" });
  });

  it("GET list returns runs matching the schema", async () => {
    runs.listRuns.mockResolvedValue([RUN]);
    const res = await GET_RUNS(req("GET"), boardCtx);
    expect(res.status).toBe(200);
    expect(RunsResponseSchema.parse(await res.json()).runs).toHaveLength(1);
  });

  it("GET one returns the run matching the schema", async () => {
    runs.getRun.mockResolvedValue(RUN);
    const res = await GET_RUN(req("GET"), runCtx(RUN_ID));
    expect(res.status).toBe(200);
    expect(RunResponseSchema.parse(await res.json()).run.id).toBe(RUN_ID);
  });

  it("404 for an unknown run id", async () => {
    runs.getRun.mockResolvedValue(null);
    expect((await GET_RUN(req("GET"), runCtx(RUN_ID))).status).toBe(404);
  });

  it("404 for a non-uuid run id without querying", async () => {
    expect((await GET_RUN(req("GET"), runCtx("nope"))).status).toBe(404);
    expect(runs.getRun).not.toHaveBeenCalled();
  });

  describe("GET solution grid", () => {
    const SOLUTION_ID = "00000000-0000-0000-0000-0000000000e1";
    const solutionCtx = (solution: string) => ({ params: Promise.resolve({ board: BOARD_ID, run: RUN_ID, solution }) });
    const GRID = {
      solution: RUN.solutions[0],
      week: { days: [{ day: 0, periods: [{ period: 1, start: "08:00", end: "08:45" }] }] },
      lessons: [{ blockId: SOLUTION_ID, subjectId: null, classIds: [], teacherIds: [], day: 0, period: 1, pinned: false }],
      unplaced: [],
      published: false,
      names: { classes: {}, teachers: {}, subjects: {} },
    };

    it("returns a grid matching the schema", async () => {
      getSolutionGridMock.mockReset().mockResolvedValue(GRID);
      const res = await GET_SOLUTION(req("GET"), solutionCtx(SOLUTION_ID));
      expect(res.status).toBe(200);
      expect(SolutionGridResponseSchema.parse(await res.json()).lessons).toHaveLength(1);
      expect(getSolutionGridMock).toHaveBeenCalledWith(SCHOOL, BOARD_ID, RUN_ID, SOLUTION_ID);
    });

    it("404 when the solution does not belong to the run", async () => {
      getSolutionGridMock.mockReset().mockResolvedValue(null);
      expect((await GET_SOLUTION(req("GET"), solutionCtx(SOLUTION_ID))).status).toBe(404);
    });

    it("404 for a non-uuid id without querying", async () => {
      getSolutionGridMock.mockReset();
      expect((await GET_SOLUTION(req("GET"), solutionCtx("nope"))).status).toBe(404);
      expect(getSolutionGridMock).not.toHaveBeenCalled();
    });
  });
});
