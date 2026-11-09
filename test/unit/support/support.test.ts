import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getStaffUser: (...args: unknown[]) => getStaffUserMock(...args) }));
vi.mock("@/lib/db/client", () => ({ withSchool: vi.fn() }));
vi.mock("@/lib/db/schools", () => ({ getSchoolById: async () => ({ name: "Demo" }) }));
const sendMock = vi.fn();
vi.mock("@/lib/support/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/support/report")>();
  return { ...actual, sendSupportReport: (...args: unknown[]) => sendMock(...args) };
});

import { POST } from "@/app/api/v1/support/route";
import { buildSupportIssue, neutralize } from "@/lib/support/report";

const USER = { id: "u1", schoolId: "s1", fullName: "Dana", email: "dana@school.test", role: "editor", status: "active" };

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/v1/support", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "user-agent": "UA" },
    }),
  );
}

describe("POST /api/v1/support", () => {
  beforeEach(() => {
    sendMock.mockReset();
    getStaffUserMock.mockResolvedValue(USER);
    vi.stubEnv("GITHUB_SUPPORT_REPO", "owner/private-support");
    vi.stubEnv("GITHUB_SUPPORT_TOKEN", "test-token");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires a signed-in active staff member", async () => {
    getStaffUserMock.mockResolvedValue(null);
    expect((await post({ kind: "bug", message: "x" })).status).toBe(401);
    getStaffUserMock.mockResolvedValue({ ...USER, status: "deactivated" });
    expect((await post({ kind: "bug", message: "x" })).status).toBe(403);
  });

  it("answers 503 when support is not configured", async () => {
    vi.stubEnv("GITHUB_SUPPORT_TOKEN", "");
    expect((await post({ kind: "bug", message: "x" })).status).toBe(503);
  });

  it("validates the body", async () => {
    expect((await post({ kind: "spam", message: "x" })).status).toBe(422);
    expect((await post({ kind: "bug", message: "   " })).status).toBe(422);
  });

  it("sends the report with the user agent", async () => {
    sendMock.mockResolvedValue({ status: "sent", issue: 7 });
    expect((await post({ kind: "question", message: "help", page: "/dashboard" })).status).toBe(201);
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ id: "u1", schoolId: "s1" }), {
      kind: "question",
      message: "help",
      page: "/dashboard",
      userAgent: "UA",
    });
  });

  it("maps rate limiting and GitHub failures", async () => {
    sendMock.mockResolvedValue({ status: "rate_limited" });
    expect((await post({ kind: "bug", message: "x" })).status).toBe(429);
    sendMock.mockRejectedValue(new Error("GitHub issue creation failed: 401"));
    expect((await post({ kind: "bug", message: "x" })).status).toBe(502);
  });
});

describe("buildSupportIssue", () => {
  it("labels by kind and puts school, reporter and page in the body", () => {
    const issue = buildSupportIssue(USER, "כפר גלים", { kind: "bug", message: "הגאנט לא נטען\nפרטים", page: "/dashboard" });
    expect(issue.title).toBe("[כפר גלים] תקלה: הגאנט לא נטען");
    expect(issue.labels).toEqual(["bug"]);
    expect(issue.body).toContain("dana@​school.test");
    expect(issue.body).toContain("| עמוד | /dashboard |");
  });

  it("defuses @mentions and table pipes in staff text", () => {
    expect(neutralize("ping @octocat | x")).toBe("ping @​octocat \\| x");
  });
});
