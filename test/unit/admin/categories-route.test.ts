import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { CategoriesResponseSchema, ProfileCategorySchema } from "@/lib/validations/profile";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

const domain = {
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  replaceCategory: vi.fn(),
  archiveCategory: vi.fn(),
  reorderCategories: vi.fn(),
};
vi.mock("@/lib/profile/categories", () => {
  class CategoryError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    CategoryError,
    listCategories: (...a: unknown[]) => domain.listCategories(...a),
    createCategory: (...a: unknown[]) => domain.createCategory(...a),
    replaceCategory: (...a: unknown[]) => domain.replaceCategory(...a),
    archiveCategory: (...a: unknown[]) => domain.archiveCategory(...a),
    reorderCategories: (...a: unknown[]) => domain.reorderCategories(...a),
  };
});

import { GET, POST } from "@/app/api/v1/admin/categories/route";
import { PUT, DELETE } from "@/app/api/v1/admin/categories/[id]/route";
import { PUT as PUT_ORDER } from "@/app/api/v1/admin/categories/order/route";
import { CategoryError } from "@/lib/profile/categories";

const SCHOOL = "00000000-0000-0000-0000-00000000000a";
const ID = "00000000-0000-0000-0000-0000000000c1";
const ADMIN = {
  id: "00000000-0000-0000-0000-0000000000a1",
  schoolId: SCHOOL,
  role: "admin",
  status: "active",
  mustChangePassword: false,
  email: "admin@school.test",
  fullName: "School Admin",
};
const BODY = { name: "מקצוע", multiSelect: true, required: false, options: [{ label: "מתמטיקה" }] };
const CATEGORY = {
  id: ID,
  name: "מקצוע",
  multiSelect: true,
  required: false,
  sortOrder: 1,
  options: [{ id: "00000000-0000-0000-0000-0000000000d1", label: "מתמטיקה", sortOrder: 0 }],
};

function request(method: string, body?: unknown, path = "") {
  return new NextRequest(`http://localhost/api/v1/admin/categories${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ id: ID }) };

describe("/api/v1/admin/categories", () => {
  beforeEach(() => {
    getStaffUserMock.mockReset();
    Object.values(domain).forEach((mock) => mock.mockReset());
  });

  it("401 when signed out", async () => {
    getStaffUserMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("403 for an editor", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, role: "editor" });
    expect((await POST(request("POST", BODY))).status).toBe(403);
    expect((await GET()).status).toBe(403);
    expect(domain.createCategory).not.toHaveBeenCalled();
  });

  it("403 for a deactivated admin", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, status: "deactivated" });
    expect((await POST(request("POST", BODY))).status).toBe(403);
    expect(domain.createCategory).not.toHaveBeenCalled();
  });

  it("403 demo_disabled for a demo admin on every write", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, demoExpiresAt: new Date() });
    const responses = [
      await POST(request("POST", BODY)),
      await PUT(request("PUT", BODY, `/${ID}`), ctx),
      await DELETE(request("DELETE", undefined, `/${ID}`), ctx),
      await PUT_ORDER(request("PUT", { ids: [ID] }, "/order")),
    ];
    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "demo_disabled" });
    }
    expect(domain.createCategory).not.toHaveBeenCalled();
    expect(domain.archiveCategory).not.toHaveBeenCalled();
  });

  it("400 for a 61-character name", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    const res = await POST(request("POST", { ...BODY, name: "א".repeat(61) }));
    expect(res.status).toBe(400);
    expect(domain.createCategory).not.toHaveBeenCalled();
  });

  it("409 for a duplicate name and 422 at the limit", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    domain.createCategory.mockRejectedValueOnce(new CategoryError("duplicate_name"));
    const duplicate = await POST(request("POST", BODY));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "duplicate_name" });
    domain.createCategory.mockRejectedValueOnce(new CategoryError("limit_reached"));
    expect((await POST(request("POST", BODY))).status).toBe(422);
  });

  it("201 with the created category", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    domain.createCategory.mockResolvedValue(CATEGORY);
    const res = await POST(request("POST", BODY));
    expect(res.status).toBe(201);
    expect(ProfileCategorySchema.parse(await res.json()).id).toBe(ID);
    expect(domain.createCategory).toHaveBeenCalledWith(SCHOOL, BODY);
  });

  it("GET lists the school's categories", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    domain.listCategories.mockResolvedValue([CATEGORY]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(CategoriesResponseSchema.parse(await res.json()).categories).toHaveLength(1);
    expect(domain.listCategories).toHaveBeenCalledWith(SCHOOL);
  });

  it("PUT [id]: 200 when found, 404 when not, 400 for a bad id", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    domain.replaceCategory.mockResolvedValueOnce(CATEGORY);
    expect((await PUT(request("PUT", BODY, `/${ID}`), ctx)).status).toBe(200);
    domain.replaceCategory.mockResolvedValueOnce(null);
    expect((await PUT(request("PUT", BODY, `/${ID}`), ctx)).status).toBe(404);
    const bad = { params: Promise.resolve({ id: "nope" }) };
    expect((await PUT(request("PUT", BODY, "/nope"), bad)).status).toBe(400);
  });

  it("DELETE [id]: 204 when archived, 404 when not found", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    domain.archiveCategory.mockResolvedValueOnce(true);
    expect((await DELETE(request("DELETE", undefined, `/${ID}`), ctx)).status).toBe(204);
    domain.archiveCategory.mockResolvedValueOnce(false);
    expect((await DELETE(request("DELETE", undefined, `/${ID}`), ctx)).status).toBe(404);
  });

  it("PUT order: 204, and 400 for a bad body", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    expect((await PUT_ORDER(request("PUT", { ids: [ID] }, "/order"))).status).toBe(204);
    expect(domain.reorderCategories).toHaveBeenCalledWith(SCHOOL, [ID]);
    expect((await PUT_ORDER(request("PUT", { ids: "x" }, "/order"))).status).toBe(400);
  });
});
