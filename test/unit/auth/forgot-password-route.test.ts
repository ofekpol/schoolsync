import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const resetMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { resetPasswordForEmail: resetMock } }),
}));

import { POST } from "@/app/api/v1/auth/forgot-password/route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/v1/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/v1/auth/forgot-password", () => {
  beforeEach(() => {
    resetMock.mockReset();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  });

  it("returns 422 for an invalid email", async () => {
    const res = await POST(makeRequest({ email: "nope" }));
    expect(res.status).toBe(422);
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("sends the recovery email through the callback to change-password", async () => {
    resetMock.mockResolvedValue({ error: null });
    const res = await POST(makeRequest({ email: "a@b.com" }));
    expect(res.status).toBe(200);
    expect(resetMock).toHaveBeenCalledWith("a@b.com", {
      redirectTo: "https://app.example.test/auth/callback?next=/auth/change-password",
    });
  });

  it("answers 200 even when Supabase fails, so accounts cannot be enumerated", async () => {
    resetMock.mockResolvedValue({ error: { message: "rate limit" } });
    const res = await POST(makeRequest({ email: "a@b.com" }));
    expect(res.status).toBe(200);
  });
});
