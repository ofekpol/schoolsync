import { afterEach, describe, expect, it, vi } from "vitest";
import { callSolver, solverUrl } from "@/lib/timetable/solver-client";
import type { SolverInput } from "@/lib/timetable/solver-contract";

const input = { version: 1, mode: "solve", profile: "balanced", timeLimitSeconds: 5 } as unknown as SolverInput;
const okOutput = { version: 1, status: "ok", score: 3, placements: [], violations: [], solverStatus: "OPTIMAL" };
const asEnv = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const env = (extra: Record<string, string> = {}) => asEnv({ SOLVER_URL: "https://s.test/api/solve", ...extra });

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("solverUrl", () => {
  it("prefers SOLVER_URL, falls back to VERCEL_URL, else null", () => {
    expect(solverUrl(asEnv({ SOLVER_URL: "https://x.test/s", VERCEL_URL: "a.vercel.app" }))).toBe("https://x.test/s");
    expect(solverUrl(asEnv({ VERCEL_URL: "abc.vercel.app" }))).toBe("https://abc.vercel.app/api/solve");
    expect(solverUrl(asEnv({}))).toBeNull();
  });
});

describe("callSolver", () => {
  it("sends auth and bypass headers only when configured", async () => {
    const withBoth = stubFetch(200, okOutput);
    await callSolver(input, env({ SOLVER_TOKEN: "t", VERCEL_AUTOMATION_BYPASS_SECRET: "b" }));
    const headers = withBoth.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t");
    expect(headers["x-vercel-protection-bypass"]).toBe("b");

    const bare = stubFetch(200, okOutput);
    await callSolver(input, env());
    const bareHeaders = bare.mock.calls[0][1].headers as Record<string, string>;
    expect(bareHeaders).not.toHaveProperty("Authorization");
    expect(bareHeaders).not.toHaveProperty("x-vercel-protection-bypass");
  });

  it("returns the parsed output and strips solverStatus", async () => {
    stubFetch(200, okOutput);
    const out = await callSolver(input, env());
    expect(out.score).toBe(3);
    expect(out).not.toHaveProperty("solverStatus");
  });

  it("rejects solver_bad_output on an invalid body", async () => {
    stubFetch(200, { version: 2 });
    await expect(callSolver(input, env())).rejects.toMatchObject({ code: "solver_bad_output" });
  });

  it("rejects solver_http_error with the status", async () => {
    stubFetch(401, { error: "unauthorized" });
    await expect(callSolver(input, env())).rejects.toMatchObject({ code: "solver_http_error", status: 401 });
  });

  it("rejects solver_unreachable when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(callSolver(input, env())).rejects.toMatchObject({ code: "solver_unreachable" });
  });

  it("rejects solver_not_configured without calling fetch", async () => {
    const fetchMock = stubFetch(200, okOutput);
    await expect(callSolver(input, asEnv({}))).rejects.toMatchObject({ code: "solver_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
