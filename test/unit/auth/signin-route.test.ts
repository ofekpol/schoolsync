import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const signInMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { signInWithPassword: signInMock },
  }),
}));

const getStaffMock = vi.fn();
const getStaffByAuthIdMock = vi.fn();
const incrementLoginAttemptsMock = vi.fn();
const resetLoginAttemptsMock = vi.fn();
const createFromInviteMock = vi.fn();
vi.mock("@/lib/db/staff", () => ({
  getStaffUserByAuthId: (...args: unknown[]) => getStaffByAuthIdMock(...args),
  getStaffUserByEmail: (...args: unknown[]) => getStaffMock(...args),
  createStaffUserFromInvite: (...args: unknown[]) => createFromInviteMock(...args),
  incrementLoginAttempts: (...args: unknown[]) => incrementLoginAttemptsMock(...args),
  resetLoginAttempts: (...args: unknown[]) => resetLoginAttemptsMock(...args),
}));

const getInviteMock = vi.fn();
const markInviteUsedMock = vi.fn();
const updateInviteUsedByMock = vi.fn();
vi.mock("@/lib/db/invites", () => ({
  getInviteByToken: (...args: unknown[]) => getInviteMock(...args),
  markInviteUsed: (...args: unknown[]) => markInviteUsedMock(...args),
  updateInviteUsedBy: (...args: unknown[]) => updateInviteUsedByMock(...args),
}));

const assignSchoolMock = vi.fn();
vi.mock("@/lib/db/pending", () => ({
  assignPendingSchoolIfMissing: (...args: unknown[]) => assignSchoolMock(...args),
}));

const resolveSchoolMock = vi.fn();
vi.mock("@/lib/db/schools", () => ({
  resolveSchoolIdFromParam: (...args: unknown[]) => resolveSchoolMock(...args),
}));

import { POST } from "@/app/api/v1/auth/signin/route";

// Route handlers read the demo cookie; there is no request scope in unit tests.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, delete: () => undefined }),
}));

describe("POST /api/v1/auth/signin", () => {
  beforeEach(() => {
    signInMock.mockReset();
    getStaffMock.mockReset();
    getStaffByAuthIdMock.mockReset();
    incrementLoginAttemptsMock.mockReset();
    resetLoginAttemptsMock.mockReset();
    createFromInviteMock.mockReset();
    getInviteMock.mockReset();
    markInviteUsedMock.mockReset();
    updateInviteUsedByMock.mockReset();
  });

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost/api/v1/auth/signin", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 422 when email is missing", async () => {
    const res = await POST(makeRequest({ password: "password123" }));
    expect(res.status).toBe(422);
  });

  it("returns 423 with lockedUntil when account is locked", async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    getStaffMock.mockResolvedValue({
      id: "u1",
      status: "active",
      loginAttempts: 10,
      lockedUntil,
    });

    const res = await POST(makeRequest({ email: "a@b.com", password: "password123" }));
    expect(res.status).toBe(423);
    const body = await res.json();
    expect(body.error).toBe("account_locked");
    expect(body.lockedUntil).toBe(lockedUntil);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("returns 401 and increments attempts on wrong password", async () => {
    getStaffMock.mockResolvedValue({
      id: "u1",
      status: "active",
      loginAttempts: 2,
      lockedUntil: null,
    });
    signInMock.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });

    const res = await POST(makeRequest({ email: "a@b.com", password: "wrongpass" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid_credentials");
    expect(body.attemptsRemaining).toBe(7); // 10 - (2+1)
  });

  it("sends a banned user to the deactivated page without counting a failed attempt", async () => {
    getStaffMock.mockResolvedValue({
      id: "u1",
      status: "deactivated",
      loginAttempts: 2,
      lockedUntil: null,
    });
    signInMock.mockResolvedValue({
      data: { user: null },
      error: { code: "user_banned", message: "User is banned" },
    });

    const res = await POST(makeRequest({ email: "a@b.com", password: "password123" }));

    expect(res.status).toBe(200);
    expect((await res.json()).redirectTo).toBe("/auth/deactivated");
    expect(incrementLoginAttemptsMock).not.toHaveBeenCalled();
  });

  it("returns 200 on successful staff sign in and redirects to dashboard", async () => {
    getStaffMock.mockResolvedValue({
      id: "u1",
      status: "active",
      loginAttempts: 0,
      lockedUntil: null,
    });
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getStaffByAuthIdMock.mockResolvedValue({
      id: "u1",
      schoolId: "school-1",
      schoolSlug: "demo-school",
      role: "editor",
      status: "active",
      email: "a@b.com",
      fullName: "Test User",
      mustChangePassword: false,
    });

    const res = await POST(makeRequest({ email: "a@b.com", password: "password123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.redirectTo).toBe("/dashboard");
  });

  it("redirects viewers to the read-only dashboard after sign in", async () => {
    getStaffMock.mockResolvedValue({
      id: "u1",
      status: "active",
      loginAttempts: 0,
      lockedUntil: null,
    });
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getStaffByAuthIdMock.mockResolvedValue({
      id: "u1",
      schoolId: "school-1",
      schoolSlug: "demo-school",
      role: "viewer",
      status: "active",
      email: "a@b.com",
      fullName: "Test User",
      mustChangePassword: false,
    });

    const res = await POST(makeRequest({ email: "a@b.com", password: "password123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.redirectTo).toBe("/dashboard");
  });

  it("returns 401 when staff_users row not found (no account)", async () => {
    getStaffMock.mockResolvedValue(null);
    signInMock.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });

    const res = await POST(makeRequest({ email: "ghost@b.com", password: "password123" }));
    expect(res.status).toBe(401);
  });

  it("returns /auth/pending when the user has no staff row", async () => {
    getStaffMock.mockResolvedValue(null);
    getStaffByAuthIdMock.mockResolvedValue(null);
    signInMock.mockResolvedValue({
      data: { user: { id: "auth-2", email: "fresh@b.com", user_metadata: {} } },
      error: null,
    });

    const res = await POST(makeRequest({ email: "fresh@b.com", password: "password123" }));
    expect(res.status).toBe(200);
    expect((await res.json()).redirectTo).toBe("/auth/pending");
  });

  it("files a school-less pending registration under the school from the sign-in link", async () => {
    getStaffMock.mockResolvedValue(null);
    getStaffByAuthIdMock.mockResolvedValue(null);
    signInMock.mockResolvedValue({
      data: { user: { id: "auth-3", email: "late@b.com", user_metadata: {} } },
      error: null,
    });
    resolveSchoolMock.mockResolvedValue("school-a-id");

    await POST(makeRequest({ email: "late@b.com", password: "password123", school: "test-a" }));
    expect(resolveSchoolMock).toHaveBeenCalledWith("test-a");
    expect(assignSchoolMock).toHaveBeenCalledWith("auth-3", "school-a-id");
  });

  describe("invite fallback (auth user without staff row)", () => {
    const invite = {
      schoolId: "school-1",
      role: "admin",
      gradeScopes: [],
      eventTypeScopes: [],
      multiUse: false,
      usedAt: null,
      revokedAt: null,
    };

    function signInWithInviteMetadata() {
      getStaffMock.mockResolvedValue(null);
      getStaffByAuthIdMock.mockResolvedValue(null);
      signInMock.mockResolvedValue({
        data: {
          user: { id: "auth-1", email: "new@b.com", user_metadata: { invite_token: "tok" } },
        },
        error: null,
      });
      getInviteMock.mockResolvedValue(invite);
    }

    it("claims a single-use invite before creating the staff row", async () => {
      signInWithInviteMetadata();
      markInviteUsedMock.mockResolvedValue({ affected: 1 });
      createFromInviteMock.mockResolvedValue({ id: "auth-1" });

      await POST(makeRequest({ email: "new@b.com", password: "password123" }));

      expect(markInviteUsedMock).toHaveBeenCalledWith("tok", null, false);
      expect(createFromInviteMock).toHaveBeenCalledTimes(1);
      expect(updateInviteUsedByMock).toHaveBeenCalledWith("tok", "auth-1");
    });

    it("does not create a staff row when the invite was already claimed", async () => {
      signInWithInviteMetadata();
      markInviteUsedMock.mockResolvedValue({ affected: 0 });

      await POST(makeRequest({ email: "new@b.com", password: "password123" }));

      expect(createFromInviteMock).not.toHaveBeenCalled();
    });
  });
});
