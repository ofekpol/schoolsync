import { beforeEach, describe, expect, it, vi } from "vitest";
// Every school here has the Gantt service; the guard itself is tested in service-guard.test.ts.
vi.mock("@/lib/auth/service-guard", () => ({ serviceDisabledResponse: async () => null }));
import { NextRequest } from "next/server";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getStaffUser: () => getStaffUserMock() }));

const isAiEnabledMock = vi.fn();
const seenPrompts: string[] = [];
vi.mock("@/lib/ai/model", () => ({
  isAiEnabled: () => isAiEnabledMock(),
  getAiModel: () =>
    new MockLanguageModelV4({
      doStream: async (options) => {
        seenPrompts.push(JSON.stringify(options.prompt));
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start", id: "t" },
              { type: "text-delta", id: "t", delta: "יש " },
              { type: "text-delta", id: "t", delta: "טיול" },
              { type: "text-end", id: "t" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                logprobs: undefined,
                usage: {
                  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
                  outputTokens: { total: 1, text: 1, reasoning: undefined },
                },
              },
            ],
          }),
        };
      },
    }),
}));

const consumeAiQuotaMock = vi.fn();
vi.mock("@/lib/ai/quota", () => ({
  consumeAiQuota: (...args: unknown[]) => consumeAiQuotaMock(...args),
}));

const buildChatToolsMock = vi.fn(() => ({}));
vi.mock("@/lib/ai/chat/tools", () => ({
  buildChatTools: (...args: unknown[]) => buildChatToolsMock(...(args as [])),
}));

vi.mock("@/lib/db/schools", () => ({
  getSchoolById: async () => ({ id: "school-a", name: "תיכון הדוגמה" }),
}));

import { POST } from "@/app/api/v1/ai/chat/route";

const viewer = { id: "staff-1", schoolId: "school-a", role: "viewer", status: "active", mustChangePassword: false };

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/v1/ai/chat", { method: "POST", body: JSON.stringify(body) }));
}

const ask = (content: string) => ({ messages: [{ role: "user", content }] });

describe("POST /api/v1/ai/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seenPrompts.length = 0;
    getStaffUserMock.mockResolvedValue(viewer);
    isAiEnabledMock.mockReturnValue(true);
    consumeAiQuotaMock.mockResolvedValue({ ok: true, remaining: 49 });
  });

  it("401 without session", async () => {
    getStaffUserMock.mockResolvedValue(null);
    expect((await post(ask("מה יש מחר?"))).status).toBe(401);
  });

  it("403 for an inactive user", async () => {
    getStaffUserMock.mockResolvedValue({ ...viewer, status: "deactivated" });
    expect((await post(ask("x"))).status).toBe(403);
  });

  it("400 for >10 messages, >500 chars, or a last message that isn't the user's", async () => {
    const many = { messages: Array.from({ length: 11 }, () => ({ role: "user", content: "x" })) };
    expect((await post(many)).status).toBe(400);
    expect((await post(ask("א".repeat(501)))).status).toBe(400);
    expect((await post({ messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] })).status).toBe(400);
    expect(consumeAiQuotaMock).not.toHaveBeenCalled();
  });

  it("429 when chat quota exhausted", async () => {
    consumeAiQuotaMock.mockResolvedValue({ ok: false, limit: 50 });
    const res = await post(ask("x"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "quota_exceeded", limit: 50 });
  });

  it("503 when AI disabled", async () => {
    isAiEnabledMock.mockReturnValue(false);
    expect((await post(ask("x"))).status).toBe(503);
  });

  it("streams model text for a viewer, with tools bound to the session school", async () => {
    const res = await post({ ...ask("מה יש מחר?"), schoolId: "school-b" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("יש טיול");
    expect(buildChatToolsMock).toHaveBeenCalledWith("school-a");
    expect(consumeAiQuotaMock).toHaveBeenCalledWith("school-a", "staff-1", "ai_chat", { chars: 10 });
    expect(seenPrompts[0]).toContain("תיכון הדוגמה");
  });
});
