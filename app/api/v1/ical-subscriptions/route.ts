import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { serviceDisabledResponse } from "@/lib/auth/service-guard";
import {
  createSubscription,
  listSubscriptionsForStaff,
} from "@/lib/ical/subscriptions";
import { ICalSubscriptionSchema } from "@/lib/validations/events";
import { withDemoLimits } from "@/lib/auth/demo-guard";

export async function GET(): Promise<NextResponse> {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.status !== "active") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ganttOff = await serviceDisabledResponse(user.schoolId, "gantt");
  if (ganttOff) return ganttOff;
  const rows = await listSubscriptionsForStaff(user.schoolId!, user.id);
  return NextResponse.json({ subscriptions: rows }, { status: 200 });
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.status !== "active" || user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ganttOff = await serviceDisabledResponse(user.schoolId, "gantt");
  if (ganttOff) return ganttOff;

  const body = await request.json().catch(() => null);
  const parsed = ICalSubscriptionSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await createSubscription(user.schoolId!, user.id, {
    grades: parsed.data.grades ?? [],
    eventTypes: parsed.data.eventTypes ?? [],
  });

  return NextResponse.json(
    { id: result.id, token: result.token },
    { status: 201 },
  );
}

// Demo-school limits (migration 0019 trigger) surface as 403/400, not 500.
export const POST = withDemoLimits(handlePOST);
