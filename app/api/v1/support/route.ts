import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStaffUser } from "@/lib/auth/session";
import { isSupportEnabled } from "@/lib/support/github";
import { SUPPORT_KINDS, sendSupportReport } from "@/lib/support/report";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";

const SupportRequestSchema = z.object({
  kind: z.enum(SUPPORT_KINDS),
  message: z.string().trim().min(1).max(5000),
  page: z.string().max(500).optional(),
});

const MAX_USER_AGENT = 300;

/** Any active staff member (viewers included) can report a problem or ask for help. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  if (isDemoUser(user)) return demoDisabledResponse();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (user.status !== "active" || !user.schoolId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isSupportEnabled()) return NextResponse.json({ error: "support_disabled" }, { status: 503 });

  const parsed = SupportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 422 });

  try {
    const result = await sendSupportReport(
      { id: user.id, schoolId: user.schoolId, fullName: user.fullName, email: user.email, role: user.role },
      { ...parsed.data, userAgent: request.headers.get("user-agent")?.slice(0, MAX_USER_AGENT) },
    );
    if (result.status === "rate_limited") return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    return NextResponse.json({ status: "sent" }, { status: 201 });
  } catch (error) {
    console.error("[support] report failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
}
