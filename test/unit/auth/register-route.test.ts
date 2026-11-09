import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const signUpMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { signUp: signUpMock },
  }),
}));

import { POST } from "@/app/api/v1/auth/register/route";

// Route handlers read the demo cookie; there is no request scope in unit tests.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, has: () => false, delete: () => undefined }),
}));

const SCHOOL_TOKEN = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";

describe("POST /api/v1/auth/register", () => {
  beforeEach(() => signUpMock.mockReset());

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 422 when email is missing", async () => {
    const res = await POST(makeRequest({ fullName: "Test", password: "password123" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns 422 when password is shorter than 8 chars", async () => {
    const res = await POST(makeRequest({ email: "a@b.com", fullName: "Test", password: "short" }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when fullName is empty", async () => {
    const res = await POST(makeRequest({ email: "a@b.com", fullName: "", password: "password123" }));
    expect(res.status).toBe(422);
  });

  it("returns 200 with confirmation_sent on success", async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await POST(makeRequest({ email: "a@b.com", fullName: "Test User", password: "password123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("confirmation_sent");
    expect(signUpMock).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "password123",
      options: {
        data: { full_name: "Test User" },
        emailRedirectTo: "http://localhost/auth/confirm",
      },
    });
  });

  it("returns 409 when Supabase reports user already registered", async () => {
    signUpMock.mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered" },
    });
    const res = await POST(makeRequest({ email: "exists@b.com", fullName: "Test", password: "password123" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("email_already_registered");
  });

  it("returns 500 on unexpected Supabase error", async () => {
    signUpMock.mockResolvedValue({ data: { user: null }, error: { message: "unexpected" } });
    const res = await POST(makeRequest({ email: "a@b.com", fullName: "Test", password: "password123" }));
    expect(res.status).toBe(500);
  });

  it("stores the school link token in user_metadata", async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await POST(
      makeRequest({ email: "a@b.com", fullName: "Test", password: "password123", school: SCHOOL_TOKEN }),
    );
    expect(res.status).toBe(200);
    expect(signUpMock.mock.calls[0][0].options.data).toMatchObject({ school: SCHOOL_TOKEN });
  });

  it.each([["../x"], ["test-a"]])("rejects %s (not a school link token) with 422", async (school) => {
    const res = await POST(
      makeRequest({ email: "a@b.com", fullName: "Test", password: "password123", school }),
    );
    expect(res.status).toBe(422);
    expect(signUpMock).not.toHaveBeenCalled();
  });
});
