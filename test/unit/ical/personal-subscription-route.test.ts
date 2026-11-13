import { beforeEach, describe, expect, it, vi } from "vitest";
// Every school here has the Gantt service; the guard itself is tested in service-guard.test.ts.
vi.mock("@/lib/auth/service-guard", () => ({ serviceDisabledResponse: async () => null }));
import { NextRequest } from "next/server";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

const createPersonalCalendarSubscriptionMock = vi.fn();
vi.mock("@/lib/ical/subscriptions", () => ({
  createPersonalCalendarSubscription: (...args: unknown[]) =>
    createPersonalCalendarSubscriptionMock(...args),
}));

import { POST } from "@/app/api/v1/ical-subscriptions/personal/route";

const ACTIVE_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  schoolId: "00000000-0000-0000-0000-000000000002",
  role: "editor",
  status: "active",
  mustChangePassword: false,
};

function request(url = "http://localhost:3000/api/v1/ical-subscriptions/personal") {
  return new NextRequest(url, { method: "POST" });
}

beforeEach(() => {
  getStaffUserMock.mockReset();
  createPersonalCalendarSubscriptionMock.mockReset();
  createPersonalCalendarSubscriptionMock.mockResolvedValue({
    id: "sub-1",
    token: "token-123",
  });
});

describe("POST /api/v1/ical-subscriptions/personal", () => {
  it("returns 401 when unauthenticated", async () => {
    getStaffUserMock.mockResolvedValue(null);

    const res = await POST(request());

    expect(res.status).toBe(401);
    expect(createPersonalCalendarSubscriptionMock).not.toHaveBeenCalled();
  });

  it("returns 403 for users who must change password", async () => {
    getStaffUserMock.mockResolvedValue({ ...ACTIVE_USER, mustChangePassword: true });

    const res = await POST(request());

    expect(res.status).toBe(403);
    expect(createPersonalCalendarSubscriptionMock).not.toHaveBeenCalled();
  });

  it("creates a personal subscription and returns an absolute iCal URL", async () => {
    getStaffUserMock.mockResolvedValue(ACTIVE_USER);

    const res = await POST(request("https://app.example.test/api/v1/ical-subscriptions/personal"));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      id: "sub-1",
      url: "https://app.example.test/ical/token-123",
    });
    expect(createPersonalCalendarSubscriptionMock).toHaveBeenCalledWith(ACTIVE_USER);
  });
});
