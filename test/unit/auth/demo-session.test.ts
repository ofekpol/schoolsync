// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  demoCookieOptions,
  demoHmacHex,
  demoSecret,
  signDemoSession,
  verifyDemoSession,
  type DemoSession,
} from "@/lib/auth/demo-session";

const SECRET = "a".repeat(32);
const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);
const SESSION: DemoSession = {
  staffId: "11111111-1111-4111-8111-111111111111",
  schoolId: "22222222-2222-4222-8222-222222222222",
  exp: NOW + 60_000,
};

afterEach(() => vi.unstubAllEnvs());

describe("demo session cookie", () => {
  it("round-trips a signed session", async () => {
    const token = await signDemoSession(SESSION, SECRET);
    await expect(verifyDemoSession(token, SECRET, NOW)).resolves.toEqual({
      status: "valid",
      session: SESSION,
    });
  });

  it("reports an expired session separately from an invalid one", async () => {
    const token = await signDemoSession(SESSION, SECRET);
    await expect(verifyDemoSession(token, SECRET, SESSION.exp)).resolves.toEqual({
      status: "expired",
      session: SESSION,
    });
  });

  it("rejects a tampered payload", async () => {
    const token = await signDemoSession(SESSION, SECRET);
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...SESSION, exp: NOW + 10 ** 9 })).toString("base64url");
    await expect(verifyDemoSession(`${forged}.${signature}`, SECRET, NOW)).resolves.toEqual({
      status: "invalid",
    });
  });

  it("rejects a tampered signature and a different secret", async () => {
    const token = await signDemoSession(SESSION, SECRET);
    const flipped = `${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`;
    await expect(verifyDemoSession(flipped, SECRET, NOW)).resolves.toEqual({ status: "invalid" });
    await expect(verifyDemoSession(token, "b".repeat(32), NOW)).resolves.toEqual({ status: "invalid" });
  });

  it("rejects garbage, missing tokens and a missing secret", async () => {
    await expect(verifyDemoSession("not-a-token", SECRET, NOW)).resolves.toEqual({ status: "invalid" });
    await expect(verifyDemoSession("a.b.c", SECRET, NOW)).resolves.toEqual({ status: "invalid" });
    await expect(verifyDemoSession(undefined, SECRET, NOW)).resolves.toEqual({ status: "invalid" });
    const token = await signDemoSession(SESSION, SECRET);
    await expect(verifyDemoSession(token, null, NOW)).resolves.toEqual({ status: "invalid" });
  });

  it("fails closed when the secret is unset or shorter than 32 bytes", () => {
    vi.stubEnv("DEMO_SESSION_SECRET", "");
    expect(demoSecret()).toBeNull();
    vi.stubEnv("DEMO_SESSION_SECRET", "short");
    expect(demoSecret()).toBeNull();
    vi.stubEnv("DEMO_SESSION_SECRET", SECRET);
    expect(demoSecret()).toBe(SECRET);
  });

  it("keeps the cookie a week past expiry so the app can show the ended screen", () => {
    const options = demoCookieOptions(NOW + 3_600_000, NOW);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(options.maxAge).toBe(3600 + 7 * 24 * 3600);
  });

  it("hashes IPs deterministically without exposing them", async () => {
    const hash = await demoHmacHex(SECRET, "ip:203.0.113.7");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(await demoHmacHex(SECRET, "ip:203.0.113.7"));
    expect(hash).not.toContain("203.0.113.7");
  });
});
