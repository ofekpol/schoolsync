import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { serviceDisabledResponse } from "@/lib/auth/service-guard";
import { EventDraftSchema } from "@/lib/validations/events";
import {
  deleteOrCancelEvent,
  dismissCanceledEventForStaff,
  updateDraft,
} from "@/lib/events/crud";
import {
  getEditorAllowedGrades,
  getEventForEditor,
  isEventTypeAllowed,
} from "@/lib/events/queries";
import { invalidatePublicViewerCache } from "@/lib/views/public-viewer-data";
import { withDemoLimits } from "@/lib/auth/demo-guard";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.status !== "active") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ganttOff = await serviceDisabledResponse(user.schoolId, "gantt");
  if (ganttOff) return ganttOff;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await getEventForEditor(
    user.schoolId!,
    id,
    user.id,
    user.role === "admin",
  );
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result, { status: 200 });
}

async function handlePATCH(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "viewer" || user.status !== "active" || user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ganttOff = await serviceDisabledResponse(user.schoolId, "gantt");
  if (ganttOff) return ganttOff;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ifMatch = request.headers.get("If-Match");
  const expectedVersion = ifMatch !== null ? Number(ifMatch) : null;
  if (
    ifMatch !== null &&
    (isNaN(expectedVersion!) || !Number.isInteger(expectedVersion) || expectedVersion! < 1)
  ) {
    return NextResponse.json({ error: "Invalid If-Match" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = EventDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Scope check: every grade in body.grades must be in the editor's allowed set (WIZARD-05)
  if (parsed.data.grades && parsed.data.grades.length > 0 && user.role !== "admin") {
    const allowed = await getEditorAllowedGrades(user.schoolId!, user.id);
    const allowedSet = new Set(allowed);
    const violators = parsed.data.grades.filter((g) => !allowedSet.has(g));
    if (violators.length > 0) {
      return NextResponse.json(
        { error: "scope_violation", grades: violators },
        { status: 403 },
      );
    }
  }

  const { eventTypeId } = parsed.data;
  if (eventTypeId && !(await isEventTypeAllowed(user, eventTypeId))) {
    return NextResponse.json({ error: "scope_violation", eventTypeId }, { status: 403 });
  }

  const result = await updateDraft(
    user.schoolId!,
    id,
    user.id,
    user.role === "admin",
    parsed.data,
    expectedVersion,
  );

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result.status === "conflict") {
    return NextResponse.json({ error: "version_conflict" }, { status: 409 });
  }
  invalidatePublicViewerCache(user.schoolSlug);
  return NextResponse.json({ version: result.version }, { status: 200 });
}

async function handleDELETE(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const user = await getStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.status !== "active" || user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ganttOff = await serviceDisabledResponse(user.schoolId, "gantt");
  if (ganttOff) return ganttOff;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role === "viewer") {
    const dismissResult = await dismissCanceledEventForStaff(user.schoolId!, id, user.id);
    if (dismissResult.status === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(dismissResult, { status: 200 });
  }

  const result = await deleteOrCancelEvent(user.schoolId!, id, user.id, user.role === "admin");
  if (result.status !== "not_found") {
    invalidatePublicViewerCache(user.schoolSlug);
    return NextResponse.json(result, { status: 200 });
  }

  const dismissResult = await dismissCanceledEventForStaff(user.schoolId!, id, user.id);
  if (dismissResult.status === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(dismissResult, { status: 200 });
}

// Demo-school limits (migration 0019 trigger) surface as 403/400, not 500.
export const PATCH = withDemoLimits(handlePATCH);
export const DELETE = withDemoLimits(handleDELETE);
