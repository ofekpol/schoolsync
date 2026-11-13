import { NextRequest, NextResponse } from "next/server";
import { createTextStreamResponse, isStepCount, streamText, toTextStream } from "ai";
import { z } from "zod";
import { getStaffUser } from "@/lib/auth/session";
import { serviceDisabledResponse } from "@/lib/auth/service-guard";
import { getAiModel, isAiEnabled } from "@/lib/ai/model";
import { consumeAiQuota } from "@/lib/ai/quota";
import { buildChatTools } from "@/lib/ai/chat/tools";
import { buildChatSystemPrompt } from "@/lib/ai/chat/prompt";
import { getSchoolById } from "@/lib/db/schools";
import { jerusalemDateString } from "@/lib/datetime";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";

const ChatRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(500) }))
    .min(1)
    .max(10)
    .refine((list) => list[list.length - 1].role === "user", "last message must be from the user"),
});

function error(code: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

/** Staff calendar assistant. Read-only, school-bound tools; answers stream as plain text. */
export async function POST(request: NextRequest): Promise<Response> {
  const user = await getStaffUser();
  if (isDemoUser(user)) return demoDisabledResponse();
  if (!user || !user.schoolId) return error("unauthorized", 401);
  if (user.status !== "active" || user.mustChangePassword) return error("forbidden", 403);
  const ganttOff = await serviceDisabledResponse(user.schoolId, "gantt");
  if (ganttOff) return ganttOff;
  if (!isAiEnabled()) return error("ai_disabled", 503);

  const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("invalid_input", 400);
  const { messages } = parsed.data;
  const question = messages[messages.length - 1].content;

  const quota = await consumeAiQuota(user.schoolId, user.id, "ai_chat", { chars: question.length });
  if (!quota.ok) return error("quota_exceeded", 429, { limit: quota.limit });

  try {
    const school = await getSchoolById(user.schoolId);
    const result = streamText({
      model: getAiModel(),
      system: buildChatSystemPrompt({ schoolName: school?.name ?? "", today: jerusalemDateString(new Date()) }),
      messages,
      tools: buildChatTools(user.schoolId),
      stopWhen: isStepCount(5),
      maxOutputTokens: 800,
      temperature: 0.2,
      timeout: 30_000,
    });
    return createTextStreamResponse({
      stream: toTextStream({ stream: result.stream }),
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return error("ai_unavailable", 502);
  }
}
