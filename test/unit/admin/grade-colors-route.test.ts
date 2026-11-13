import { beforeEach, describe, expect, it, vi } from "vitest";
// Every school here has the Gantt service; the guard itself is tested in service-guard.test.ts.
vi.mock("@/lib/auth/service-guard", () => ({ serviceDisabledResponse: async () => null }));
import { NextRequest } from "next/server";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

const getGradeColorsMock = vi.fn();
const setGradeColorsMock = vi.fn();
vi.mock("@/lib/db/grade-colors", () => ({
  getGradeColors: (...args: unknown[]) => getGradeColorsMock(...args),
  setGradeColors: (...args: unknown[]) => setGradeColorsMock(...args),
}));

const invalidateMock = vi.fn();
vi.mock("@/lib/views/public-viewer-data", () => ({
  invalidatePublicViewerCache: (...args: unknown[]) => invalidateMock(...args),
}));

import { GET, PUT } from "@/app/api/v1/admin/grade-colors/route";
import { DEFAULT_GRADE_COLORS } from "@/lib/grade-colors";

const ADMIN = {
  id: "00000000-0000-0000-0000-0000000000a1",
  schoolId: "00000000-0000-0000-0000-00000000000a",
  schoolSlug: "demo",
  role: "admin",
  status: "active",
};

function putRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/admin/grade-colors", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getGradeColorsMock.mockResolvedValue({ ...DEFAULT_GRADE_COLORS });
  setGradeColorsMock.mockResolvedValue({ ...DEFAULT_GRADE_COLORS, 7: "#DDF5D0" });
});

describe("/api/v1/admin/grade-colors", () => {
  it("returns the school's colors to admins", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).colors["7"]).toBe(DEFAULT_GRADE_COLORS[7]);
    expect(getGradeColorsMock).toHaveBeenCalledWith(ADMIN.schoolId);
  });

  it("rejects editors", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, role: "editor" });
    expect((await GET()).status).toBe(403);
    expect((await PUT(putRequest({ colors: [{ grade: 7, colorHex: "#DDF5D0" }] }))).status).toBe(403);
    expect(setGradeColorsMock).not.toHaveBeenCalled();
  });

  it("saves palette colors and invalidates the public cache", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    const res = await PUT(putRequest({ colors: [{ grade: 7, colorHex: "#DDF5D0" }] }));
    expect(res.status).toBe(200);
    expect(setGradeColorsMock).toHaveBeenCalledWith(ADMIN.schoolId, [{ grade: 7, colorHex: "#DDF5D0" }]);
    expect(invalidateMock).toHaveBeenCalledWith("demo");
  });

  it("rejects colors outside the curated palette", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    const res = await PUT(putRequest({ colors: [{ grade: 7, colorHex: "#FF0000" }] }));
    expect(res.status).toBe(400);
    expect(setGradeColorsMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate and out-of-range grades", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    const dup = [{ grade: 7, colorHex: "#DDF5D0" }, { grade: 7, colorHex: "#CFE3FA" }];
    expect((await PUT(putRequest({ colors: dup }))).status).toBe(400);
    expect((await PUT(putRequest({ colors: [{ grade: 3, colorHex: "#CFE3FA" }] }))).status).toBe(400);
  });
});
