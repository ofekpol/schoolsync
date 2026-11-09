// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DEMO_COOKIE, signDemoSession } from "@/lib/auth/demo-session";

// No Supabase user: any route that reaches the Supabase path redirects to login.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { middleware } from "@/middleware";

const SECRET = "s".repeat(32);
const SESSION = {
  staffId: "11111111-1111-4111-8111-111111111111",
  schoolId: "22222222-2222-4222-8222-222222222222",
};

async function demoCookie(expOffsetMs: number): Promise<string> {
  return signDemoSession({ ...SESSION, exp: Date.now() + expOffsetMs }, SECRET);
}

function request(path: string, cookie?: string, method = "GET"): NextRequest {
  const headers = cookie ? { cookie: `${DEMO_COOKIE}=${cookie}` } : undefined;
  return new NextRequest(`http://localhost${path}`, { method, headers });
}

function passedThrough(res: Response): boolean {
  return res.headers.get("x-middleware-next") === "1";
}

beforeEach(() => {
  vi.stubEnv("DEMO_SESSION_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
});
afterEach(() => vi.unstubAllEnvs());

describe("middleware: demo sessions", () => {
  it("lets anyone reach /demo, the creation endpoint and the cron, with or without a cookie", async () => {
    const expired = await demoCookie(-1000);
    expect(passedThrough(await middleware(request("/demo")))).toBe(true);
    expect(passedThrough(await middleware(request("/demo", expired)))).toBe(true);
    expect(passedThrough(await middleware(request("/api/v1/demo", undefined, "POST")))).toBe(true);
    expect(passedThrough(await middleware(request("/api/v1/demo", expired, "POST")))).toBe(true);
    expect(passedThrough(await middleware(request("/api/cron/demo-cleanup")))).toBe(true);
  });

  it("still sends a visitor with no cookie on a staff page to login", async () => {
    const res = await middleware(request("/dashboard"));
    expect(res.headers.get("location")).toContain("/auth/login");
  });

  it("lets a valid demo cookie reach staff pages and APIs", async () => {
    const valid = await demoCookie(60_000);
    expect(passedThrough(await middleware(request("/dashboard", valid)))).toBe(true);
    expect(passedThrough(await middleware(request("/api/v1/events", valid, "POST")))).toBe(true);
  });

  it("keeps a demo cookie out of platform routes", async () => {
    const valid = await demoCookie(60_000);
    const page = await middleware(request("/platform/schools", valid));
    expect(page.headers.get("location")).toBe("http://localhost/dashboard");
    const api = await middleware(request("/api/v1/platform/schools", valid));
    expect(api.status).toBe(403);
  });

  it.each([
    ["expired", () => demoCookie(-1000)],
    ["tampered", async () => `${(await demoCookie(60_000)).slice(0, -3)}xyz`],
  ])("sends an %s cookie to the ended screen and clears it", async (_label, make) => {
    const cookie = await make();
    const page = await middleware(request("/dashboard", cookie));
    expect(page.headers.get("location")).toBe("http://localhost/demo?expired=1");
    expect(page.headers.get("set-cookie")).toMatch(new RegExp(`^${DEMO_COOKIE}=;`));
    const api = await middleware(request("/api/v1/events", cookie, "POST"));
    expect(api.status).toBe(401);
  });

  it("treats every demo cookie as invalid when the secret is missing", async () => {
    const valid = await demoCookie(60_000);
    vi.stubEnv("DEMO_SESSION_SECRET", "");
    const res = await middleware(request("/dashboard", valid));
    expect(res.headers.get("location")).toBe("http://localhost/demo?expired=1");
  });
});
