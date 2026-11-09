// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DEMO_COOKIE, signDemoSession, verifyDemoSession } from "@/lib/auth/demo-session";

const db = vi.hoisted(() => ({
  reserve: vi.fn(),
  cleanup: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/db/demo", () => ({
  DEMO_CLEANUP_BATCH: 20,
  reserveDemoSlot: db.reserve,
  cleanupExpiredDemos: db.cleanup,
  createDemoSchool: db.create,
  deleteDemoSchool: db.remove,
}));
const supabaseMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: supabaseMock }));

import { POST as startDemo } from "@/app/api/v1/demo/route";
import { GET as cron } from "@/app/api/cron/demo-cleanup/route";
import { demoLimitResponse, withDemoLimits } from "@/lib/auth/demo-guard";

const SECRET = "k".repeat(32);
const ORIGIN = "http://localhost";
const DEMO = {
  schoolId: "22222222-2222-4222-8222-222222222222",
  staffId: "11111111-1111-4111-8111-111111111111",
  expiresAt: new Date(Date.now() + 86_400_000),
};

function post(headers: Record<string, string> = { origin: ORIGIN }): NextRequest {
  return new NextRequest(`${ORIGIN}/api/v1/demo`, { method: "POST", headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEMO_SESSION_SECRET", SECRET);
  db.reserve.mockResolvedValue("ok");
  db.cleanup.mockResolvedValue(0);
  db.create.mockResolvedValue(DEMO);
  db.remove.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/v1/demo", () => {
  it("creates a demo, sets a signed cookie and lands on the dashboard", async () => {
    const res = await startDemo(post({ origin: ORIGIN, "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
    const cookie = res.cookies.get(DEMO_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    const check = await verifyDemoSession(cookie?.value, SECRET);
    expect(check).toMatchObject({ status: "valid", session: { schoolId: DEMO.schoolId, staffId: DEMO.staffId } });
    const ipHash = db.reserve.mock.calls[0][0] as string;
    expect(ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(db.cleanup).toHaveBeenCalledWith(20);
  });

  it("refuses a cross-site POST before reserving anything", async () => {
    const res = await startDemo(post({ origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(db.reserve).not.toHaveBeenCalled();
    expect((await startDemo(post({}))).status).toBe(403);
  });

  it("fails closed without a secret", async () => {
    vi.stubEnv("DEMO_SESSION_SECRET", "");
    const res = await startDemo(post());
    expect(res.headers.get("location")).toBe(`${ORIGIN}/demo?error=unavailable`);
    expect(db.reserve).not.toHaveBeenCalled();
  });

  it.each(["ip_limit", "global_limit", "db_full"])("shows the busy notice on %s", async (outcome) => {
    db.reserve.mockResolvedValue(outcome);
    const res = await startDemo(post());
    expect(res.headers.get("location")).toBe(`${ORIGIN}/demo?error=busy`);
    expect(db.create).not.toHaveBeenCalled();
  });

  it("deletes the visitor's previous demo when starting over", async () => {
    const previous = await signDemoSession(
      { staffId: DEMO.staffId, schoolId: "44444444-4444-4444-8444-444444444444", exp: Date.now() + 1000 },
      SECRET,
    );
    await startDemo(post({ origin: ORIGIN, cookie: `${DEMO_COOKIE}=${previous}` }));
    expect(db.remove).toHaveBeenCalledWith("44444444-4444-4444-8444-444444444444");
  });

  it("deletes the new school when a step after creation fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    supabaseMock.mockRejectedValue(new Error("supabase down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await startDemo(post());
    expect(res.headers.get("location")).toBe(`${ORIGIN}/demo?error=unavailable`);
    expect(res.cookies.get(DEMO_COOKIE)).toBeUndefined();
    expect(db.remove).toHaveBeenCalledWith(DEMO.schoolId);
  });

  it("shows the unavailable notice when the reservation itself fails", async () => {
    db.reserve.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await startDemo(post());
    expect(res.headers.get("location")).toBe(`${ORIGIN}/demo?error=unavailable`);
    expect(db.create).not.toHaveBeenCalled();
  });

  it("shows the unavailable notice when creation fails", async () => {
    db.create.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await startDemo(post());
    expect(res.headers.get("location")).toBe(`${ORIGIN}/demo?error=unavailable`);
  });
});

describe("GET /api/cron/demo-cleanup", () => {
  const call = (auth?: string) =>
    cron(new NextRequest(`${ORIGIN}/api/cron/demo-cleanup`, auth ? { headers: { authorization: auth } } : {}));

  it("rejects missing, wrong or unconfigured secrets", async () => {
    vi.stubEnv("CRON_SECRET", "c".repeat(32));
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(db.cleanup).not.toHaveBeenCalled();
  });

  it("cleans up in batches until a batch comes back short", async () => {
    vi.stubEnv("CRON_SECRET", "c".repeat(32));
    db.cleanup.mockResolvedValueOnce(20).mockResolvedValueOnce(3);
    const res = await call(`Bearer ${"c".repeat(32)}`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: 23 });
    expect(db.cleanup).toHaveBeenCalledTimes(2);
  });
});

describe("demo limit errors", () => {
  it("maps trigger errors, including ones Drizzle wraps in `cause`", async () => {
    const wrapped = new Error("Failed query", { cause: new Error("demo_quota") });
    expect(demoLimitResponse(wrapped)?.status).toBe(403);
    expect(demoLimitResponse(new Error("demo_text_too_long"))?.status).toBe(400);
    expect(demoLimitResponse(new Error("demo_date_range"))?.status).toBe(400);
    expect(demoLimitResponse(new Error("something else"))).toBeNull();
    const handler = withDemoLimits(async () => {
      throw wrapped;
    });
    const res = await handler();
    await expect(res.json()).resolves.toEqual({ error: "demo_quota" });
    await expect(withDemoLimits(async () => { throw new Error("other"); })()).rejects.toThrow("other");
  });
});
