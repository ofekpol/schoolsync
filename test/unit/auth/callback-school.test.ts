import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const exchangeMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { exchangeCodeForSession: exchangeMock, signOut: vi.fn() },
  }),
}));

vi.mock("@/lib/db/staff", () => ({
  getStaffUserByAuthId: async () => null,
  createStaffUserFromInvite: vi.fn(),
}));
vi.mock("@/lib/db/invites", () => ({
  getInviteByToken: vi.fn(),
  markInviteUsed: vi.fn(),
  updateInviteUsedBy: vi.fn(),
}));

const createPendingMock = vi.fn();
const getPendingMock = vi.fn();
const assignSchoolMock = vi.fn();
vi.mock("@/lib/db/pending", () => ({
  createPendingRegistration: (...args: unknown[]) => createPendingMock(...args),
  getPendingRegistrationByAuthId: (...args: unknown[]) => getPendingMock(...args),
  assignPendingSchoolIfMissing: (...args: unknown[]) => assignSchoolMock(...args),
}));

const resolveMock = vi.fn();
vi.mock("@/lib/db/schools", () => ({
  resolveSchoolIdFromParam: (...args: unknown[]) => resolveMock(...args),
}));

import { GET } from "@/app/auth/callback/route";

// Route handlers read the demo cookie; there is no request scope in unit tests.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, delete: () => undefined }),
}));

function callback(query: string) {
  return GET(new NextRequest(`http://localhost/auth/callback?code=c${query}`));
}

const SCHOOL_TOKEN = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";

describe("GET /auth/callback without an invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPendingMock.mockResolvedValue(null);
    exchangeMock.mockResolvedValue({
      data: { user: { id: "auth-1", email: "g@b.com", user_metadata: { full_name: "G" } } },
      error: null,
    });
  });

  it("sends a banned Google sign-in to the deactivated page", async () => {
    const res = await GET(
      new NextRequest("http://localhost/auth/callback?error=access_denied&error_code=user_banned"),
    );
    expect(res.headers.get("location")).toContain("/auth/deactivated");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("creates the pending registration in the school whose link token is in ?school=", async () => {
    resolveMock.mockResolvedValue("school-a-id");
    const res = await callback(`&school=${SCHOOL_TOKEN}`);
    expect(resolveMock).toHaveBeenCalledWith(SCHOOL_TOKEN);
    expect(createPendingMock).toHaveBeenCalledWith(
      expect.objectContaining({ authUserId: "auth-1", schoolId: "school-a-id" }),
    );
    expect(res.headers.get("location")).toContain("/auth/pending");
  });

  it("fills the school on an existing pending row that has none", async () => {
    getPendingMock.mockResolvedValue({ id: "p1", schoolId: null });
    resolveMock.mockResolvedValue("school-a-id");
    await callback(`&school=${SCHOOL_TOKEN}`);
    expect(createPendingMock).not.toHaveBeenCalled();
    expect(assignSchoolMock).toHaveBeenCalledWith("auth-1", "school-a-id");
  });

  it("uses a null school when the param is not a known link token", async () => {
    resolveMock.mockResolvedValue(null);
    await callback("&school=test-a");
    expect(createPendingMock).toHaveBeenCalledWith(expect.objectContaining({ schoolId: null }));
  });
});
