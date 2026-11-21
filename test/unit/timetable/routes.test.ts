import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { BlockResponseSchema } from "@/lib/validations/timetable-api";
import { TimetableError } from "@/lib/timetable/errors";

const { getStaffUserMock, getSchoolByIdMock, domain, call } = vi.hoisted(() => {
  const domain: Record<string, ReturnType<typeof vi.fn<(...a: unknown[]) => unknown>>> = {};
  for (const name of [
    "listBoards", "createBoard", "getBoard", "listSubjects", "addSubjects", "updateSubject",
    "deleteSubject", "listTeachers", "addTeachers", "addTeachersFromStaff", "listBlocks",
    "createBlock", "replaceBlock",
  ]) {
    domain[name] = vi.fn<(...a: unknown[]) => unknown>();
  }
  const call =
    (name: string) =>
    (...a: unknown[]) =>
      domain[name](...a);
  return { getStaffUserMock: vi.fn(), getSchoolByIdMock: vi.fn(), domain, call };
});
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));
vi.mock("@/lib/db/schools", () => ({
  getSchoolById: (...args: unknown[]) => getSchoolByIdMock(...args),
}));
vi.mock("@/lib/timetable/boards", () => ({
  listBoards: call("listBoards"),
  createBoard: call("createBoard"),
  getBoard: call("getBoard"),
}));
vi.mock("@/lib/timetable/subjects", () => ({
  listSubjects: call("listSubjects"),
  addSubjects: call("addSubjects"),
  renameSubject: call("updateSubject"),
  deleteSubject: call("deleteSubject"),
}));
vi.mock("@/lib/timetable/teachers", () => ({
  listTeachers: call("listTeachers"),
  addTeachers: call("addTeachers"),
  addTeachersFromStaff: call("addTeachersFromStaff"),
  updateTeacher: vi.fn(),
  deleteTeacher: vi.fn(),
}));
vi.mock("@/lib/timetable/blocks", () => ({
  listBlocks: call("listBlocks"),
  createBlock: call("createBlock"),
  replaceBlock: call("replaceBlock"),
  deleteBlock: vi.fn(),
}));

import { GET as GET_BOARDS, POST as POST_BOARD } from "@/app/api/v1/timetable/boards/route";
import { POST as POST_SUBJECTS } from "@/app/api/v1/timetable/boards/[board]/subjects/route";
import { DELETE as DELETE_SUBJECT } from "@/app/api/v1/timetable/boards/[board]/subjects/[id]/route";
import { POST as POST_TEACHERS } from "@/app/api/v1/timetable/boards/[board]/teachers/route";
import { POST as POST_BLOCK } from "@/app/api/v1/timetable/boards/[board]/blocks/route";
import { PUT as PUT_BLOCK } from "@/app/api/v1/timetable/boards/[board]/blocks/[id]/route";

const SCHOOL = "00000000-0000-0000-0000-00000000000a";
const BOARD_ID = "00000000-0000-0000-0000-0000000000b1";
const ID = "00000000-0000-0000-0000-0000000000c1";
const CLASS_ID = "00000000-0000-0000-0000-0000000000d1";
const ADMIN = {
  id: "00000000-0000-0000-0000-0000000000a1",
  schoolId: SCHOOL,
  role: "admin",
  status: "active",
  mustChangePassword: false,
  email: "admin@school.test",
  fullName: "School Admin",
};
const BOARD = {
  id: BOARD_ID,
  name: "תשפ״ח",
  status: "setup",
  academicYearId: "00000000-0000-0000-0000-0000000000e1",
  week: { days: [{ day: 0, periods: [{ period: 1, start: "08:00", end: "08:45" }] }] },
};
const BLOCK_INPUT = { subjectId: ID, weeklyPeriods: 5, classIds: [CLASS_ID], teacherIds: [] };

function request(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/v1/timetable/boards", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const boardCtx = { params: Promise.resolve({ board: BOARD_ID }) };
const itemCtx = { params: Promise.resolve({ board: BOARD_ID, id: ID }) };

describe("/api/v1/timetable", () => {
  beforeEach(() => {
    getStaffUserMock.mockReset().mockResolvedValue(ADMIN);
    getSchoolByIdMock.mockReset().mockResolvedValue({ id: SCHOOL, services: ["gantt", "timetable"] });
    Object.values(domain).forEach((mock) => mock.mockReset());
    domain.getBoard.mockResolvedValue(BOARD);
  });

  it("401 when signed out", async () => {
    getStaffUserMock.mockResolvedValue(null);
    expect((await GET_BOARDS()).status).toBe(401);
  });

  it("403 for an editor", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, role: "editor" });
    expect((await GET_BOARDS()).status).toBe(403);
    expect((await POST_BOARD(request("POST", { name: "x" }))).status).toBe(403);
    expect(domain.createBoard).not.toHaveBeenCalled();
  });

  it("403 for a deactivated admin", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, status: "deactivated" });
    expect((await GET_BOARDS()).status).toBe(403);
  });

  it("403 service_disabled for an admin of a school without timetable", async () => {
    getSchoolByIdMock.mockResolvedValue({ id: SCHOOL, services: ["gantt"] });
    const res = await GET_BOARDS();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "service_disabled" });
    expect(domain.listBoards).not.toHaveBeenCalled();
  });

  it("403 demo_disabled for a demo admin on a write", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, demoExpiresAt: new Date() });
    const res = await POST_BOARD(request("POST", { name: "לוח" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "demo_disabled" });
    expect(domain.createBoard).not.toHaveBeenCalled();
  });

  it("400 for a 61-character subject name", async () => {
    const res = await POST_SUBJECTS(request("POST", { names: ["א".repeat(61)] }), boardCtx);
    expect(res.status).toBe(400);
    expect(domain.addSubjects).not.toHaveBeenCalled();
  });

  it("409 in_use when a used subject is deleted", async () => {
    domain.deleteSubject = vi.fn().mockRejectedValue(new TimetableError("in_use"));
    const res = await DELETE_SUBJECT(request("DELETE"), itemCtx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "in_use" });
  });

  it("400 mixed_grades from a block write", async () => {
    domain.replaceBlock.mockRejectedValue(new TimetableError("mixed_grades"));
    const res = await PUT_BLOCK(request("PUT", BLOCK_INPUT), itemCtx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "mixed_grades" });
  });

  it("400 when POST teachers sends both names and staffUserIds", async () => {
    const res = await POST_TEACHERS(request("POST", { names: ["דנה"], staffUserIds: [ID] }), boardCtx);
    expect(res.status).toBe(400);
    expect(domain.addTeachers).not.toHaveBeenCalled();
    expect(domain.addTeachersFromStaff).not.toHaveBeenCalled();
  });

  it("404 for an unknown board, before anything else", async () => {
    domain.getBoard.mockResolvedValue(null);
    const res = await POST_SUBJECTS(request("POST", { names: ["מתמטיקה"] }), boardCtx);
    expect(res.status).toBe(404);
    expect(domain.addSubjects).not.toHaveBeenCalled();
  });

  it("201 with the created block", async () => {
    domain.createBlock.mockResolvedValue({ id: "00000000-0000-0000-0000-0000000000f1", ...BLOCK_INPUT, groupNames: {} });
    const res = await POST_BLOCK(request("POST", BLOCK_INPUT), boardCtx);
    expect(res.status).toBe(201);
    const body = BlockResponseSchema.parse(await res.json());
    expect(body.block.classIds).toEqual([CLASS_ID]);
    expect(domain.createBlock).toHaveBeenCalledWith(SCHOOL, BOARD_ID, BLOCK_INPUT);
  });

  it("201 creates a board", async () => {
    domain.createBoard.mockResolvedValue(BOARD);
    const res = await POST_BOARD(request("POST", { name: " תשפ״ח " }));
    expect(res.status).toBe(201);
    expect(domain.createBoard).toHaveBeenCalledWith(SCHOOL, "תשפ״ח");
  });
});
