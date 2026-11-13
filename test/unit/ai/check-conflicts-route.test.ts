import { beforeEach, describe, expect, it, vi } from "vitest";
// Every school here has the Gantt service; the guard itself is tested in service-guard.test.ts.
vi.mock("@/lib/auth/service-guard", () => ({ serviceDisabledResponse: async () => null }));
import { NextRequest } from "next/server";
import { cand } from "./adder-fixtures";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getStaffUser: () => getStaffUserMock() }));

const findConflictsMock = vi.fn();
vi.mock("@/lib/ai/adder/conflicts", () => ({
  findConflicts: (...args: unknown[]) => findConflictsMock(...args),
}));

const consumeAiQuotaMock = vi.fn();
vi.mock("@/lib/ai/quota", () => ({ consumeAiQuota: (...a: unknown[]) => consumeAiQuotaMock(...a) }));

import { POST } from "@/app/api/v1/ai/check-conflicts/route";

const editor = { id: "s1", schoolId: "school-a", role: "editor", status: "active", mustChangePassword: false };
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/v1/ai/check-conflicts", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/v1/ai/check-conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStaffUserMock.mockResolvedValue(editor);
    findConflictsMock.mockResolvedValue(new Map([["c1", [{ code: "duplicate", eventId: "e", title: "t", date: "2026-11-12" }]]]));
  });

  it("401 without session, 403 for viewer", async () => {
    getStaffUserMock.mockResolvedValueOnce(null);
    expect((await post({ candidates: [cand()] })).status).toBe(401);
    getStaffUserMock.mockResolvedValueOnce({ ...editor, role: "viewer" });
    expect((await post({ candidates: [cand()] })).status).toBe(403);
  });

  it("400 for more than 30 candidates", async () => {
    expect((await post({ candidates: Array.from({ length: 31 }, () => cand()) })).status).toBe(400);
  });

  it("returns warnings keyed by clientId for the session's school, without using AI quota", async () => {
    const res = await post({ candidates: [cand()], schoolId: "school-b" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ warnings: { c1: [{ code: "duplicate", eventId: "e", title: "t", date: "2026-11-12" }] } });
    expect(findConflictsMock.mock.calls[0][0]).toBe("school-a");
    expect(consumeAiQuotaMock).not.toHaveBeenCalled();
  });
});
