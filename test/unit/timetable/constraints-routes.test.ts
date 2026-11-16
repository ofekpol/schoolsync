import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ConstraintResponseSchema } from "@/lib/validations/timetable-api";
import { ConstraintError } from "@/lib/timetable/constraints/errors";

type Fn = (...a: unknown[]) => unknown;
const { getStaffUserMock, getSchoolByIdMock, domain, call } = vi.hoisted(() => {
  const domain: Record<string, ReturnType<typeof vi.fn<Fn>>> = {};
  for (const name of ["getBoard", "listTeachers", "listConstraints", "createConstraint", "replaceConstraint",
    "deleteConstraint", "exportConstraints", "getCollectState", "startCollecting", "listResponses", "fillInForTeacher"]) {
    domain[name] = vi.fn<Fn>();
  }
  const call = (name: string) => (...a: unknown[]) => domain[name](...a);
  return { getStaffUserMock: vi.fn(), getSchoolByIdMock: vi.fn(), domain, call };
});
vi.mock("@/lib/auth/session", () => ({ getStaffUser: (...a: unknown[]) => getStaffUserMock(...a) }));
vi.mock("@/lib/db/schools", () => ({ getSchoolById: (...a: unknown[]) => getSchoolByIdMock(...a) }));
vi.mock("@/lib/timetable/boards", () => ({ getBoard: call("getBoard") }));
vi.mock("@/lib/timetable/teachers", () => ({ listTeachers: call("listTeachers") }));
vi.mock("@/lib/timetable/constraints/crud", () => ({
  listConstraints: call("listConstraints"),
  createConstraint: call("createConstraint"),
  replaceConstraint: call("replaceConstraint"),
  deleteConstraint: call("deleteConstraint"),
}));
vi.mock("@/lib/timetable/constraints/export", () => ({ exportConstraints: call("exportConstraints") }));
vi.mock("@/lib/timetable/constraints/collect", () => ({
  getCollectState: call("getCollectState"),
  startCollecting: call("startCollecting"),
  listResponses: call("listResponses"),
  fillInForTeacher: call("fillInForTeacher"),
}));

import { POST as POST_CONSTRAINT } from "@/app/api/v1/timetable/boards/[board]/constraints/route";
import { PUT as PUT_COLLECT } from "@/app/api/v1/timetable/boards/[board]/collect/route";
import { PUT as FILL_IN } from "@/app/api/v1/timetable/boards/[board]/collect/[teacher]/route";

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const SCHOOL = uuid(1);
const BOARD = uuid(2);
const TEACHER = uuid(3);
const ADMIN = { id: uuid(4), schoolId: SCHOOL, role: "admin", status: "active", mustChangePassword: false, email: "a@s.test", fullName: "A" };
const BOARD_ROW = { id: BOARD, name: "x", status: "setup", academicYearId: uuid(5),
  week: { days: [{ day: 0, periods: [{ period: 1, start: "08:00", end: "08:45" }] }] } };
const MEETING = { type: "meeting", hard: true, weight: 100,
  params: { target: { kind: "teachers", teacherIds: [TEACHER] }, weeklyPeriods: 2, consecutive: true } };

const request = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/v1/timetable/boards/x", {
    method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" },
  });
const boardCtx = { params: Promise.resolve({ board: BOARD }) };

describe("/api/v1/timetable constraints and collect", () => {
  beforeEach(() => {
    getStaffUserMock.mockReset().mockResolvedValue(ADMIN);
    getSchoolByIdMock.mockReset().mockResolvedValue({ id: SCHOOL, services: ["timetable"] });
    Object.values(domain).forEach((m) => m.mockReset());
    domain.getBoard.mockResolvedValue(BOARD_ROW);
  });

  it("403 demo_disabled for a demo admin", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, demoExpiresAt: new Date() });
    const res = await POST_CONSTRAINT(request("POST", MEETING), boardCtx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "demo_disabled" });
  });

  it("400 for a hard teacher_few_gaps", async () => {
    const res = await POST_CONSTRAINT(request("POST", { type: "teacher_few_gaps", hard: true, weight: 10, params: {} }), boardCtx);
    expect(res.status).toBe(400);
    expect(domain.createConstraint).not.toHaveBeenCalled();
  });

  it("409 duplicate_free_day and 422 deadline_past", async () => {
    domain.fillInForTeacher.mockRejectedValue(new ConstraintError("duplicate_free_day"));
    const dup = await FILL_IN(request("PUT", { freeDay: 5 }), { params: Promise.resolve({ board: BOARD, teacher: TEACHER }) });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ error: "duplicate_free_day" });
    domain.startCollecting.mockRejectedValue(new ConstraintError("deadline_past"));
    const past = await PUT_COLLECT(request("PUT", { deadline: "2020-01-01T00:00:00.000Z" }), boardCtx);
    expect(past.status).toBe(422);
  });

  it("404 for an unknown board before reading the body", async () => {
    domain.getBoard.mockResolvedValue(null);
    const res = await POST_CONSTRAINT(request("POST", "not json"), boardCtx);
    expect(res.status).toBe(404);
  });

  it("201 with the created constraint, made by the admin as management", async () => {
    domain.createConstraint.mockResolvedValue({ id: uuid(9), type: "meeting", hard: true, weight: 100, params: MEETING.params,
      source: "management", teacherId: null, updatedAt: "2026-11-16T10:00:00.000Z" });
    const res = await POST_CONSTRAINT(request("POST", MEETING), boardCtx);
    expect(res.status).toBe(201);
    expect(ConstraintResponseSchema.parse(await res.json()).constraint.id).toBe(uuid(9));
    expect(domain.createConstraint).toHaveBeenCalledWith(SCHOOL, BOARD, MEETING, { staffUserId: ADMIN.id, source: "management" });
  });
});
