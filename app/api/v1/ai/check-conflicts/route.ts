import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStaffUser } from "@/lib/auth/session";
import { findConflicts } from "@/lib/ai/adder/conflicts";
import { AdderWarningSchema, CandidateEventSchema } from "@/lib/ai/adder/types";
import { demoDisabledResponse, isDemoUser } from "@/lib/auth/demo-guard";

const RequestSchema = z.object({ candidates: z.array(CandidateEventSchema).min(1).max(30) });
const ResponseSchema = z.object({ warnings: z.record(z.array(AdderWarningSchema)) });

/**
 * Re-runs the duplicate/overlap check for edited adder cards. No model call
 * and no AI quota: it only reads the school's calendar.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  if (isDemoUser(user)) return demoDisabledResponse();
  if (!user || !user.schoolId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role === "viewer" || user.status !== "active" || user.mustChangePassword) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const conflicts = await findConflicts(user.schoolId, parsed.data.candidates);
  return NextResponse.json(ResponseSchema.parse({ warnings: Object.fromEntries(conflicts) }));
}
