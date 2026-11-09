import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { publishEvent } from "@/lib/events/approval";
import { updateDraft } from "@/lib/events/crud";
import { EventDraftSchema } from "@/lib/validations/events";
import {
  getEditorAllowedGrades,
  getEventForEditor,
  isEventTypeAllowed,
} from "@/lib/events/queries";
import { invalidatePublicViewerCache } from "@/lib/views/public-viewer-data";
import { withDemoLimits } from "@/lib/auth/demo-guard";

type RouteContext = { params: Promise<{ id: string }> };

async function handlePOST(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    if (user.role === "viewer" || user.status !== "active" || user.mustChangePassword) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rawBody = await request.text();
    if (rawBody.length > 0) {
      const parsed = EventDraftSchema.safeParse(JSON.parse(rawBody));
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const draftFields = parsed.data;
      if (Object.keys(draftFields).length > 0) {
        if (draftFields.grades && draftFields.grades.length > 0 && user.role !== "admin") {
          const allowed = await getEditorAllowedGrades(user.schoolId!, user.id);
          const allowedSet = new Set(allowed);
          const violators = draftFields.grades.filter((g) => !allowedSet.has(g));
          if (violators.length > 0) {
            return NextResponse.json(
              { error: "scope_violation", grades: violators },
              { status: 403 },
            );
          }
        }
        const { eventTypeId } = draftFields;
        if (eventTypeId && !(await isEventTypeAllowed(user, eventTypeId))) {
          return NextResponse.json({ error: "scope_violation", eventTypeId }, { status: 403 });
        }
        const updated = await updateDraft(
          user.schoolId!,
          id,
          user.id,
          user.role === "admin",
          draftFields,
          null,
        );
        if (updated.status === "not_found") {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        if (updated.status === "conflict") {
          return NextResponse.json({ error: "version_conflict" }, { status: 409 });
        }
      }
    }

    // Check the stored draft too: an empty body, or scopes narrowed after the
    // draft was made, must not publish a type the editor may no longer use.
    if (user.role !== "admin") {
      const current = await getEventForEditor(user.schoolId!, id, user.id, false);
      if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const storedTypeId = current.event.eventTypeId;
      if (!(await isEventTypeAllowed(user, storedTypeId))) {
        return NextResponse.json(
          { error: "scope_violation", eventTypeId: storedTypeId },
          { status: 403 },
        );
      }
    }

    // All active staff publish directly — no admin-queue step.
    await publishEvent(user.schoolId!, id, user.id);
    invalidatePublicViewerCache(user.schoolSlug);
    return NextResponse.json({ ok: true, status: "approved" }, { status: 200 });
  } catch (e) {
    if (e instanceof Response) {
      return NextResponse.json(
        { error: e.statusText || "Error" },
        { status: e.status },
      );
    }
    throw e;
  }
}

// Demo-school limits (migration 0019 trigger) surface as 403/400, not 500.
export const POST = withDemoLimits(handlePOST);
