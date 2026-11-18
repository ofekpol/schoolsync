import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { TimetableError } from "@/lib/timetable/errors";

const { getStaffUserMock, getSchoolByIdMock, getBoardMock, editPlacementMock } = vi.hoisted(() => ({
  getStaffUserMock: vi.fn(),
  getSchoolByIdMock: vi.fn(),
  getBoardMock: vi.fn(),
  editPlacementMock: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getStaffUser: (...a: unknown[]) => getStaffUserMock(...a) }));
vi.mock("@/lib/db/schools", () => ({ getSchoolById: (...a: unknown[]) => getSchoolByIdMock(...a) }));
vi.mock("@/lib/timetable/boards", () => ({ getBoard: (...a: unknown[]) => getBoardMock(...a) }));
vi.mock("@/lib/timetable/edit", () => ({ editPlacement: (...a: unknown[]) => editPlacementMock(...a) }));

import { PATCH } from "@/app/api/v1/timetable/boards/[board]/runs/[run]/solutions/[solution]/placements/route";

const SCHOOL = "00000000-0000-0000-0000-00000000000a";
const BOARD_ID = "00000000-0000-0000-0000-0000000000b1";
const RUN_ID = "00000000-0000-0000-0000-0000000000f1";
const SOLUTION_ID = "00000000-0000-0000-0000-0000000000e1";
const BLOCK_ID = "00000000-0000-0000-0000-0000000000c1";
const ADMIN = { id: "00000000-0000-0000-0000-0000000000a1", schoolId: SCHOOL, role: "admin", status: "active" };
const MOVE = { action: "move", blockId: BLOCK_ID, from: { day: 0, period: 1 }, to: { day: 1, period: 2 } };
const ctx = (solution = SOLUTION_ID) => ({ params: Promise.resolve({ board: BOARD_ID, run: RUN_ID, solution }) });
const patch = (body: unknown) =>
  new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("PATCH …/solutions/[solution]/placements", () => {
  beforeEach(() => {
    getStaffUserMock.mockReset().mockResolvedValue(ADMIN);
    getSchoolByIdMock.mockReset().mockResolvedValue({ id: SCHOOL, services: ["gantt", "timetable"] });
    getBoardMock.mockReset().mockResolvedValue({ id: BOARD_ID });
    editPlacementMock.mockReset().mockResolvedValue(true);
  });

  it("204 on success", async () => {
    const res = await PATCH(patch(MOVE), ctx());
    expect(res.status).toBe(204);
    expect(editPlacementMock).toHaveBeenCalledWith(SCHOOL, { boardId: BOARD_ID, runId: RUN_ID, solutionId: SOLUTION_ID }, MOVE);
  });

  it("403 for a viewer", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, role: "viewer" });
    expect((await PATCH(patch(MOVE), ctx())).status).toBe(403);
    expect(editPlacementMock).not.toHaveBeenCalled();
  });

  it("403 demo_disabled for a demo user", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, demoExpiresAt: new Date() });
    const res = await PATCH(patch(MOVE), ctx());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "demo_disabled" });
  });

  it("400 when a move has neither from nor to", async () => {
    expect((await PATCH(patch({ ...MOVE, from: null, to: null }), ctx())).status).toBe(400);
    expect(editPlacementMock).not.toHaveBeenCalled();
  });

  it("404 for a non-uuid solution id", async () => {
    expect((await PATCH(patch(MOVE), ctx("nope"))).status).toBe(404);
  });

  it("404 when the edit finds nothing", async () => {
    editPlacementMock.mockResolvedValue(false);
    expect((await PATCH(patch(MOVE), ctx())).status).toBe(404);
  });

  it("409 on slot_taken", async () => {
    editPlacementMock.mockRejectedValue(new TimetableError("slot_taken"));
    const res = await PATCH(patch(MOVE), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "slot_taken" });
  });
});
