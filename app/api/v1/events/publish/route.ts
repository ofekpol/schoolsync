import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { serviceDisabledResponse } from "@/lib/auth/service-guard";
import { createPublishedEvent } from "@/lib/events/crud";
import { isEventTypeAllowed } from "@/lib/events/queries";
import { EventQuickPublishSchema } from "@/lib/validations/events";
import { canEditEvents, findDisallowedGrades } from "@/lib/events/scope";
import { invalidatePublicViewerCache } from "@/lib/views/public-viewer-data";
import { withDemoLimits } from "@/lib/auth/demo-guard";

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canEditEvents(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ganttOff = await serviceDisabledResponse(user.schoolId, "gantt");
  if (ganttOff) return ganttOff;

  const body = await request.json().catch(() => null);
  const parsed = EventQuickPublishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const disallowedGrades = await findDisallowedGrades(user, parsed.data.grades);
  if (disallowedGrades.length > 0) {
    return NextResponse.json(
      { error: "scope_violation", grades: disallowedGrades },
      { status: 403 },
    );
  }
  if (!(await isEventTypeAllowed(user, parsed.data.eventTypeId))) {
    return NextResponse.json(
      { error: "scope_violation", eventTypeId: parsed.data.eventTypeId },
      { status: 403 },
    );
  }

  const event = await createPublishedEvent(user.schoolId!, user.id, parsed.data);
  invalidatePublicViewerCache(user.schoolSlug);
  return NextResponse.json(event, { status: 201 });
}

// Demo-school limits (migration 0019 trigger) surface as 403/400, not 500.
export const POST = withDemoLimits(handlePOST);
