import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ProfileResponseSchema } from "@/lib/validations/profile";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

const listCategoriesMock = vi.fn();
vi.mock("@/lib/profile/categories", () => ({
  CategoryError: class extends Error {},
  listCategories: (...a: unknown[]) => listCategoriesMock(...a),
}));

const labels = {
  getStaffOptionIds: vi.fn(),
  setStaffOptions: vi.fn(),
  isActiveStaffOfSchool: vi.fn(),
};
vi.mock("@/lib/profile/staff-labels", () => {
  class ProfileValidationError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    ProfileValidationError,
    getStaffOptionIds: (...a: unknown[]) => labels.getStaffOptionIds(...a),
    setStaffOptions: (...a: unknown[]) => labels.setStaffOptions(...a),
    isActiveStaffOfSchool: (...a: unknown[]) => labels.isActiveStaffOfSchool(...a),
  };
});

import { GET, PUT } from "@/app/api/v1/profile/route";
import { PUT as PUT_ADMIN } from "@/app/api/v1/admin/staff/[id]/labels/route";
import { ProfileValidationError } from "@/lib/profile/staff-labels";

const SCHOOL = "00000000-0000-0000-0000-00000000000a";
const OPTION = "00000000-0000-0000-0000-0000000000d1";
const OTHER = "00000000-0000-0000-0000-0000000000b2";
const VIEWER = {
  id: "00000000-0000-0000-0000-0000000000a2",
  schoolId: SCHOOL,
  role: "viewer",
  status: "active",
  mustChangePassword: false,
  email: "viewer@school.test",
  fullName: "Viewer",
};
const ADMIN = { ...VIEWER, id: "00000000-0000-0000-0000-0000000000a1", role: "admin" };

function put(body: unknown, path = "/api/v1/profile") {
  return new NextRequest(`http://localhost${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ id: OTHER }) };
const adminPath = `/api/v1/admin/staff/${OTHER}/labels`;

describe("/api/v1/profile", () => {
  beforeEach(() => {
    getStaffUserMock.mockReset();
    listCategoriesMock.mockReset();
    Object.values(labels).forEach((mock) => mock.mockReset());
  });

  it("401 when signed out", async () => {
    getStaffUserMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await PUT(put({ optionIds: [] }))).status).toBe(401);
  });

  it("403 for deactivated staff", async () => {
    getStaffUserMock.mockResolvedValue({ ...VIEWER, status: "deactivated" });
    expect((await PUT(put({ optionIds: [] }))).status).toBe(403);
    expect(labels.setStaffOptions).not.toHaveBeenCalled();
  });

  it("GET returns the categories and the caller's selection", async () => {
    getStaffUserMock.mockResolvedValue(VIEWER);
    listCategoriesMock.mockResolvedValue([]);
    labels.getStaffOptionIds.mockResolvedValue([OPTION]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(ProfileResponseSchema.parse(await res.json()).selected).toEqual([OPTION]);
    expect(labels.getStaffOptionIds).toHaveBeenCalledWith(SCHOOL, VIEWER.id);
  });

  it("a viewer can save their own profile", async () => {
    getStaffUserMock.mockResolvedValue(VIEWER);
    const res = await PUT(put({ optionIds: [OPTION] }));
    expect(res.status).toBe(204);
    expect(labels.setStaffOptions).toHaveBeenCalledWith(SCHOOL, VIEWER.id, [OPTION]);
  });

  it("400 with the validation code", async () => {
    getStaffUserMock.mockResolvedValue(VIEWER);
    labels.setStaffOptions.mockRejectedValue(new ProfileValidationError("too_many"));
    const res = await PUT(put({ optionIds: [OPTION] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "too_many" });
  });

  it("400 for a malformed body", async () => {
    getStaffUserMock.mockResolvedValue(VIEWER);
    expect((await PUT(put({ optionIds: ["nope"] }))).status).toBe(400);
    expect(labels.setStaffOptions).not.toHaveBeenCalled();
  });

  it("403 demo_disabled for a demo user", async () => {
    getStaffUserMock.mockResolvedValue({ ...VIEWER, demoExpiresAt: new Date() });
    const res = await PUT(put({ optionIds: [] }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "demo_disabled" });
  });
});

describe("PUT /api/v1/admin/staff/[id]/labels", () => {
  beforeEach(() => {
    getStaffUserMock.mockReset();
    Object.values(labels).forEach((mock) => mock.mockReset());
  });

  it("403 for an editor", async () => {
    getStaffUserMock.mockResolvedValue({ ...VIEWER, role: "editor" });
    expect((await PUT_ADMIN(put({ optionIds: [] }, adminPath), ctx)).status).toBe(403);
    expect(labels.setStaffOptions).not.toHaveBeenCalled();
  });

  it("404 when the staff user is not active in the admin's school", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    labels.isActiveStaffOfSchool.mockResolvedValue(false);
    expect((await PUT_ADMIN(put({ optionIds: [] }, adminPath), ctx)).status).toBe(404);
    expect(labels.setStaffOptions).not.toHaveBeenCalled();
  });

  it("204 for an admin, and 400 with the validation code", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    labels.isActiveStaffOfSchool.mockResolvedValue(true);
    expect((await PUT_ADMIN(put({ optionIds: [OPTION] }, adminPath), ctx)).status).toBe(204);
    expect(labels.setStaffOptions).toHaveBeenCalledWith(SCHOOL, OTHER, [OPTION]);
    labels.setStaffOptions.mockRejectedValue(new ProfileValidationError("required_missing"));
    const res = await PUT_ADMIN(put({ optionIds: [] }, adminPath), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "required_missing" });
  });
});
