import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ConstraintError } from "@/lib/timetable/constraints/errors";
import { MyBoardsResponseSchema } from "@/lib/validations/timetable-api";

type Fn = (...a: unknown[]) => unknown;
const { getStaffUserMock, getSchoolByIdMock, listMyBoards, answerAsTeacher } = vi.hoisted(() => ({
  getStaffUserMock: vi.fn(), getSchoolByIdMock: vi.fn(), listMyBoards: vi.fn<Fn>(), answerAsTeacher: vi.fn<Fn>(),
}));
vi.mock("@/lib/auth/session", () => ({ getStaffUser: (...a: unknown[]) => getStaffUserMock(...a) }));
vi.mock("@/lib/db/schools", () => ({ getSchoolById: (...a: unknown[]) => getSchoolByIdMock(...a) }));
vi.mock("@/lib/timetable/constraints/me", () => ({
  listMyBoards: (...a: unknown[]) => listMyBoards(...a),
  answerAsTeacher: (...a: unknown[]) => answerAsTeacher(...a),
}));

import { GET } from "@/app/api/v1/timetable/me/route";
import { PUT } from "@/app/api/v1/timetable/me/[board]/route";

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const VIEWER = { id: uuid(1), schoolId: uuid(2), role: "viewer", status: "active", mustChangePassword: false, email: "v@s.test", fullName: "V" };
const BOARD = uuid(3);
const ctx = { params: Promise.resolve({ board: BOARD }) };
const put = (body: unknown) => new NextRequest("http://localhost/api/v1/timetable/me/x", {
  method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" },
});

describe("/api/v1/timetable/me", () => {
  beforeEach(() => {
    getStaffUserMock.mockReset().mockResolvedValue(VIEWER);
    getSchoolByIdMock.mockReset().mockResolvedValue({ id: uuid(2), services: ["timetable"] });
    listMyBoards.mockReset().mockResolvedValue([]);
    answerAsTeacher.mockReset();
  });

  it("401 when signed out", async () => {
    getStaffUserMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("403 without the timetable service, and for a deactivated user", async () => {
    getSchoolByIdMock.mockResolvedValue({ id: uuid(2), services: ["gantt"] });
    expect(await (await GET()).json()).toEqual({ error: "service_disabled" });
    getSchoolByIdMock.mockResolvedValue({ id: uuid(2), services: ["timetable"] });
    getStaffUserMock.mockResolvedValue({ ...VIEWER, status: "deactivated" });
    expect((await GET()).status).toBe(403);
  });

  it("lets any active role read their own boards", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(MyBoardsResponseSchema.parse(await res.json())).toEqual({ boards: [] });
    expect(listMyBoards).toHaveBeenCalledWith(uuid(2), VIEWER.id);
  });

  it("403 demo_disabled on a demo write, 400 for a day out of range", async () => {
    getStaffUserMock.mockResolvedValue({ ...VIEWER, demoExpiresAt: new Date() });
    expect(await (await PUT(put({ freeDay: 5 }), ctx)).json()).toEqual({ error: "demo_disabled" });
    getStaffUserMock.mockResolvedValue(VIEWER);
    expect((await PUT(put({ freeDay: 7 }), ctx)).status).toBe(400);
    expect(answerAsTeacher).not.toHaveBeenCalled();
  });

  it("answers as the signed-in teacher and maps deadline_past to 422", async () => {
    answerAsTeacher.mockResolvedValue({ teacherId: uuid(4), answeredAt: "2026-11-17T10:00:00.000Z", byManagement: false, freeDay: 5 });
    expect((await PUT(put({ freeDay: 5 }), ctx)).status).toBe(200);
    expect(answerAsTeacher).toHaveBeenCalledWith(uuid(2), VIEWER.id, BOARD, 5);
    answerAsTeacher.mockRejectedValue(new ConstraintError("deadline_past"));
    expect((await PUT(put({ freeDay: null }), ctx)).status).toBe(422);
  });
});
