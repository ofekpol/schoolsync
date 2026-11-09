import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: () => getStaffUserMock(),
  getSession: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, has: () => false, delete: () => undefined }),
}));

// Every downstream side effect is a spy: a demo user must never reach any of them.
const { sideEffect } = vi.hoisted(() => ({ sideEffect: vi.fn() }));
vi.mock("@/lib/db/staff", () => ({ createStaffUserDirect: sideEffect, updateStaffUser: sideEffect, listStaffUsers: sideEffect }));
vi.mock("@/lib/db/invites", () => ({ createInvite: sideEffect, listInvitesForSchool: sideEffect, revokeInvite: sideEffect }));
vi.mock("@/lib/db/pending", () => ({ listPendingRegistrations: sideEffect, approvePendingRegistration: sideEffect, rejectPendingRegistration: sideEffect }));
vi.mock("@/lib/support/report", () => ({ SUPPORT_KINDS: ["bug", "question", "idea"], sendSupportReport: sideEffect }));
vi.mock("@/lib/support/github", () => ({ isSupportEnabled: () => true }));
vi.mock("@/lib/ai/model", () => ({ isAiEnabled: () => true, getModel: sideEffect }));
vi.mock("@/lib/ai/quota", () => ({ consumeAiQuota: sideEffect, AI_DAILY_LIMITS: {} }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: sideEffect }));

import { POST as createStaff } from "@/app/api/v1/admin/staff/route";
import { PATCH as editStaff } from "@/app/api/v1/admin/staff/[id]/route";
import { GET as listInvites, POST as createInvite } from "@/app/api/v1/admin/staff/invites/route";
import { DELETE as revokeInvite } from "@/app/api/v1/admin/staff/invites/[id]/route";
import { GET as listPending, POST as reviewPending } from "@/app/api/v1/admin/staff/pending/route";
import { POST as changePassword } from "@/app/api/v1/auth/change-password/route";
import { POST as support } from "@/app/api/v1/support/route";
import { POST as aiChat } from "@/app/api/v1/ai/chat/route";
import { POST as aiCheck } from "@/app/api/v1/ai/check-conflicts/route";
import { POST as aiParse } from "@/app/api/v1/ai/parse-events/route";

const DEMO_ADMIN = {
  id: "11111111-1111-4111-8111-111111111111",
  schoolId: "22222222-2222-4222-8222-222222222222",
  role: "admin",
  status: "active",
  mustChangePassword: false,
  email: "demo-x@demo.edusolutions.invalid",
  fullName: "מנהל/ת הדגמה",
  demoExpiresAt: new Date(Date.now() + 3_600_000),
};

function request(): NextRequest {
  return new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify({ message: "hi" }) });
}
const idParams = { params: Promise.resolve({ id: "33333333-3333-4333-8333-333333333333" }) };

const ROUTES: [string, () => Promise<Response>][] = [
  ["POST /admin/staff", () => createStaff(request())],
  ["PATCH /admin/staff/[id]", () => editStaff(request(), idParams)],
  ["GET /admin/staff/invites", () => listInvites()],
  ["POST /admin/staff/invites", () => createInvite(request())],
  ["DELETE /admin/staff/invites/[id]", () => revokeInvite(request(), idParams)],
  ["GET /admin/staff/pending", () => listPending()],
  ["POST /admin/staff/pending", () => reviewPending(request())],
  ["POST /auth/change-password", () => changePassword(request())],
  ["POST /support", () => support(request())],
  ["POST /ai/chat", () => aiChat(request())],
  ["POST /ai/check-conflicts", () => aiCheck(request())],
  ["POST /ai/parse-events", () => aiParse(request())],
];

describe("outbound and account routes refuse demo users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStaffUserMock.mockResolvedValue(DEMO_ADMIN);
  });

  it.each(ROUTES)("%s → 403 demo_disabled", async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "demo_disabled" });
    expect(sideEffect).not.toHaveBeenCalled();
  });
});
