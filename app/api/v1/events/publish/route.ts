import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { createPublishedEvent } from "@/lib/events/crud";
import { getEditorAllowedGrades, isEventTypeAllowed } from "@/lib/events/queries";
import { EventQuickPublishSchema } from "@/lib/validations/events";
import { invalidatePublicViewerCache } from "@/lib/views/public-viewer-data";
import { withDemoLimits } from "@/lib/auth/demo-guard";

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role === "viewer" || user.status !== "active" || user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = EventQuickPublishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (user.role !== "admin") {
    const allowed = await getEditorAllowedGrades(user.schoolId!, user.id);
    const allowedSet = new Set(allowed);
    const violators = parsed.data.grades.filter((grade) => !allowedSet.has(grade));
    if (violators.length > 0) {
      return NextResponse.json(
        { error: "scope_violation", grades: violators },
        { status: 403 },
      );
    }
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
