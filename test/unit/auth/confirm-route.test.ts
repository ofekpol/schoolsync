import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const verifyOtpMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { verifyOtp: verifyOtpMock },
  }),
}));

const getStaffUserByAuthIdMock = vi.fn();
vi.mock("@/lib/db/staff", () => ({
  getStaffUserByAuthId: (...args: unknown[]) => getStaffUserByAuthIdMock(...args),
}));

const createPendingRegistrationMock = vi.fn();
const getPendingRegistrationByAuthIdMock = vi.fn();
vi.mock("@/lib/db/pending", () => ({
  createPendingRegistration: (...args: unknown[]) => createPendingRegistrationMock(...args),
  getPendingRegistrationByAuthId: (...args: unknown[]) => getPendingRegistrationByAuthIdMock(...args),
}));

const resolveSchoolIdFromParamMock = vi.fn();
vi.mock("@/lib/db/schools", () => ({
  resolveSchoolIdFromParam: (...args: unknown[]) => resolveSchoolIdFromParamMock(...args),
}));

import { GET } from "@/app/auth/confirm/route";

// Route handlers read the demo cookie; there is no request scope in unit tests.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, has: () => false, delete: () => undefined }),
}));

function confirm() {
  return GET(new NextRequest("http://localhost/auth/confirm?token_hash=validhash&type=signup"));
}

function verifiedUser(userMetadata: Record<string, unknown>) {
  verifyOtpMock.mockResolvedValue({
    data: { user: { id: "u1", email: "test@example.com", user_metadata: userMetadata } },
    error: null,
  });
}

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    verifyOtpMock.mockReset();
    getStaffUserByAuthIdMock.mockReset();
    createPendingRegistrationMock.mockReset();
    getPendingRegistrationByAuthIdMock.mockReset();
    getPendingRegistrationByAuthIdMock.mockResolvedValue(null);
    resolveSchoolIdFromParamMock.mockReset();
  });

  it("redirects to /auth/login?error=invalid_token when token_hash is missing", async () => {
    const res = await GET(new NextRequest("http://localhost/auth/confirm"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/login?error=invalid_token");
  });

  it("redirects to /auth/login?error=invalid_token when type is not signup", async () => {
    const res = await GET(new NextRequest("http://localhost/auth/confirm?token_hash=abc&type=recovery"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/login?error=invalid_token");
  });

  it("redirects to /auth/login?error=invalid_token when verifyOtp fails", async () => {
    verifyOtpMock.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    const res = await GET(new NextRequest("http://localhost/auth/confirm?token_hash=badhash&type=signup"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/login?error=invalid_token");
    expect(createPendingRegistrationMock).not.toHaveBeenCalled();
  });

  it("creates a pending registration with the school from user_metadata.school", async () => {
    verifiedUser({ full_name: "Test User", school: "test-a" });
    getStaffUserByAuthIdMock.mockResolvedValue(null);
    resolveSchoolIdFromParamMock.mockResolvedValue("school-uuid");

    const res = await confirm();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/login?confirmed=1");
    expect(resolveSchoolIdFromParamMock).toHaveBeenCalledWith("test-a");
    expect(createPendingRegistrationMock).toHaveBeenCalledWith({
      authUserId: "u1",
      email: "test@example.com",
      fullName: "Test User",
      schoolId: "school-uuid",
    });
  });

  it("skips creation when a pending row already exists", async () => {
    verifiedUser({});
    getStaffUserByAuthIdMock.mockResolvedValue(null);
    getPendingRegistrationByAuthIdMock.mockResolvedValue({ id: "p1" });

    await confirm();
    expect(createPendingRegistrationMock).not.toHaveBeenCalled();
  });

  it("skips creation when staff_users row already exists (idempotent)", async () => {
    verifiedUser({ full_name: "Test User" });
    getStaffUserByAuthIdMock.mockResolvedValue({ id: "u1", status: "active" });

    const res = await confirm();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/login?confirmed=1");
    expect(createPendingRegistrationMock).not.toHaveBeenCalled();
  });
});
