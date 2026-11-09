import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ withSchool: vi.fn() }));
vi.mock("@/lib/db/schools", () => ({ getSchoolById: vi.fn() }));

const TOKEN = "ab".repeat(32);
const CONTEXT = { method: "GET", path: `/${TOKEN}/agenda?week=2026-11-01`, routePath: "/[school]/agenda", routeType: "render" };

describe("error report helpers", () => {
  it("redacts school tokens and query strings from paths", async () => {
    const { redactPath } = await import("@/lib/support/error-report");
    expect(redactPath(CONTEXT.path)).toBe("/<token>/agenda");
  });

  it("fingerprints by route and message, not by request", async () => {
    const { errorFingerprint } = await import("@/lib/support/error-report");
    const a = errorFingerprint(new Error("boom"), "/[school]");
    expect(a).toHaveLength(12);
    expect(errorFingerprint(new Error("boom"), "/[school]")).toBe(a);
    expect(errorFingerprint(new Error("other"), "/[school]")).not.toBe(a);
  });

  it("keeps the token out of the issue even when the message contains it", async () => {
    const { buildErrorIssue } = await import("@/lib/support/error-report");
    const issue = buildErrorIssue(new Error(`no school for ${TOKEN}`), CONTEXT, "abc123abc123");
    expect(JSON.stringify(issue)).not.toContain(TOKEN);
    expect(issue.labels).toEqual(["error"]);
    expect(issue.body).toContain("fp:abc123abc123");
  });
});

describe("reportServerError", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GITHUB_SUPPORT_REPO", "owner/private-support");
    vi.stubEnv("GITHUB_SUPPORT_TOKEN", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("files a new error once, then skips repeats in the same instance", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ total_count: 0 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ number: 5 }), { status: 201 }));
    const { reportServerError } = await import("@/lib/support/error-report");
    await reportServerError(new Error("boom"), CONTEXT);
    await reportServerError(new Error("boom"), CONTEXT);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("search/issues");
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://api.github.com/repos/owner/private-support/issues");
  });

  it("does not file when an open issue already has the fingerprint", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ total_count: 1 })));
    const { reportServerError } = await import("@/lib/support/error-report");
    await reportServerError(new Error("known"), CONTEXT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never throws when GitHub fails, and does nothing when unconfigured", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const { reportServerError } = await import("@/lib/support/error-report");
    await expect(reportServerError(new Error("x"), CONTEXT)).resolves.toBeUndefined();
    vi.stubEnv("GITHUB_SUPPORT_TOKEN", "");
    fetchMock.mockReset();
    await reportServerError(new Error("y"), CONTEXT);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
