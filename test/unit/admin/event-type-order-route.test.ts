import { beforeEach, describe, expect, it, vi } from "vitest";
// Every school here has the Gantt service; the guard itself is tested in service-guard.test.ts.
vi.mock("@/lib/auth/service-guard", () => ({ serviceDisabledResponse: async () => null }));
import { NextRequest } from "next/server";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

const reorderMock = vi.fn();
vi.mock("@/lib/admin/event-types", () => ({
  reorderEventTypes: (...args: unknown[]) => reorderMock(...args),
}));

import { PUT } from "@/app/api/v1/admin/event-types/order/route";

const ADMIN = {
  id: "00000000-0000-0000-0000-0000000000a1",
  schoolId: "00000000-0000-0000-0000-00000000000a",
  role: "admin",
  status: "active",
};
const IDS = ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"];

function put(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/admin/event-types/order", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  reorderMock.mockResolvedValue({ reordered: true });
});

describe("PUT /api/v1/admin/event-types/order", () => {
  it("reorders for admins within their school", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    const res = await PUT(put({ ids: IDS }));
    expect(res.status).toBe(200);
    expect(reorderMock).toHaveBeenCalledWith(ADMIN.schoolId, IDS);
  });

  it("rejects editors and anonymous users", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, role: "editor" });
    expect((await PUT(put({ ids: IDS }))).status).toBe(403);
    getStaffUserMock.mockResolvedValue(null);
    expect((await PUT(put({ ids: IDS }))).status).toBe(401);
    expect(reorderMock).not.toHaveBeenCalled();
  });

  it("validates the body", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    expect((await PUT(put({ ids: ["not-a-uuid"] }))).status).toBe(400);
    expect((await PUT(put({ ids: [] }))).status).toBe(400);
  });

  it("returns 409 when the list does not match the school's types", async () => {
    getStaffUserMock.mockResolvedValue(ADMIN);
    reorderMock.mockResolvedValue({ reordered: false });
    const res = await PUT(put({ ids: IDS }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stale_order" });
  });
});
