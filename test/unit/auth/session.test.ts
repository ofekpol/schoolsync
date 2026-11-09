import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/lib/supabase/server so getSession() is testable in isolation
const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

// Mock the new lib/db/staff module — keeps the unit test free of DB
const getStaffUserByAuthIdMock = vi.fn();
vi.mock("@/lib/db/staff", () => ({
  getStaffUserByAuthId: (...args: unknown[]) => getStaffUserByAuthIdMock(...args),
}));

import { getSession, getStaffUser } from "@/lib/auth/session";

// Route handlers read the demo cookie; there is no request scope in unit tests.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, delete: () => undefined }),
}));

describe("AUTH-04: getSession()", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    getStaffUserByAuthIdMock.mockReset();
  });

  it("returns null when no auth cookie present", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(getSession()).resolves.toBeNull();
  });

  it("returns User object when valid session exists", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "x@y" } }, error: null });
    const u = await getSession();
    expect(u?.id).toBe("u1");
  });

  it("returns null when getUser errors (invalid JWT)", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    await expect(getSession()).resolves.toBeNull();
  });

  it("uses getUser() not getSession() (security: Pitfall 2)", () => {
    // Static check: source contains 'getUser(' and does NOT call .auth.getSession()
    const src = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "../../../lib/auth/session.ts"),
      "utf8",
    );
    expect(src).toMatch(/auth\.getUser\(/);
    expect(src).not.toMatch(/auth\.getSession\(/);
  });

  it("does NOT import supabaseAdmin (CLAUDE.md: service-role stays in lib/db/)", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "../../../lib/auth/session.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/supabaseAdmin/);
  });
});

describe("AUTH-04: getStaffUser()", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    getStaffUserByAuthIdMock.mockReset();
  });

  it("returns null when no auth user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(getStaffUser()).resolves.toBeNull();
    expect(getStaffUserByAuthIdMock).not.toHaveBeenCalled();
  });

  it("returns null when auth user has no matching staff_users row", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "x@y" } }, error: null });
    getStaffUserByAuthIdMock.mockResolvedValue(null);
    await expect(getStaffUser()).resolves.toBeNull();
  });

  it("never binds a session to a staff row by email", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "attacker", email: "admin@school.test" } }, error: null });
    getStaffUserByAuthIdMock.mockResolvedValue(null);
    await expect(getStaffUser()).resolves.toBeNull();
    expect(getStaffUserByAuthIdMock).toHaveBeenCalledTimes(1);
    expect(getStaffUserByAuthIdMock).toHaveBeenCalledWith("attacker");
  });

  it("returns staff record when row exists", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "x@y" } }, error: null });
    getStaffUserByAuthIdMock.mockResolvedValue({
      id: "u1",
      schoolId: "s1",
      role: "admin",
      email: "x@y",
      fullName: "X Y",
    });
    const s = await getStaffUser();
    expect(s?.schoolId).toBe("s1");
    expect(getStaffUserByAuthIdMock).toHaveBeenCalledWith("u1");
  });
});
