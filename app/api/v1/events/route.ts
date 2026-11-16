import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStaffUser } from "@/lib/auth/session";
import { serviceDisabledResponse } from "@/lib/auth/service-guard";
import { createDraft, updateDraft } from "@/lib/events/crud";
import { publishEvent } from "@/lib/events/approval";
import { EventDraftSchema } from "@/lib/validations/events";
import { canEditEvents, findDisallowedGrades } from "@/lib/events/scope";
import {
  getEditorDashboardEvents,
  isEventTypeAllowed,
} from "@/lib/events/queries";
import { withDemoLimits } from "@/lib/auth/demo-guard";
import { thrownResponseToJson } from "@/lib/auth/thrown-response";

const CreateBodySchema = EventDraftSchema.extend({
  eventTypeId: z.string().uuid(),
  publish: z.boolean().optional(),
});

export async function GET(): Promise<NextResponse> {
  const user = await getStaffUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.status !== "active") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ganttOff = await serviceDisabledResponse(user.schoolId, "gantt");
  if (ganttOff) return ganttOff;
  const events = await getEditorDashboardEvents(user.schoolId!, user.id);
  return NextResponse.json({ events }, { status: 200 });
}

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
  const parsed = CreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { eventTypeId, publish, ...draftFields } = parsed.data;

  if (!(await isEventTypeAllowed(user, eventTypeId))) {
    return NextResponse.json({ error: "scope_violation", eventTypeId }, { status: 403 });
  }

  const draft = await createDraft(user.schoolId!, user.id, eventTypeId);

  const hasDraftFields = Object.keys(draftFields).length > 0;
  if (!hasDraftFields && !publish) {
    return NextResponse.json(draft, { status: 201 });
  }

  const disallowedGrades = await findDisallowedGrades(user, draftFields.grades);
  if (disallowedGrades.length > 0) {
    return NextResponse.json(
      { error: "scope_violation", grades: disallowedGrades },
      { status: 403 },
    );
  }

  if (hasDraftFields) {
    const updated = await updateDraft(
      user.schoolId!,
      draft.id,
      user.id,
      user.role === "admin",
      draftFields,
      null,
    );
    if (updated.status !== "ok") {
      return NextResponse.json({ error: updated.status }, { status: 500 });
    }
  }

  if (publish) {
    try {
      await publishEvent(user.schoolId!, draft.id, user.id);
    } catch (e) {
      return thrownResponseToJson(e);
    }
    return NextResponse.json({ id: draft.id, status: "approved" }, { status: 201 });
  }

  return NextResponse.json(draft, { status: 201 });
}

// Demo-school limits (migration 0019 trigger) surface as 403/400, not 500.
export const POST = withDemoLimits(handlePOST);
