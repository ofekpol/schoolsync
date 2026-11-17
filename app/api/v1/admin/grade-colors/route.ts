import { NextRequest, NextResponse } from "next/server";
import { getStaffUser } from "@/lib/auth/session";
import { serviceDisabledResponse } from "@/lib/auth/service-guard";
import { assertAdmin } from "@/lib/auth/admin";
import { getGradeColors, setGradeColors } from "@/lib/db/grade-colors";
import { invalidatePublicViewerCache } from "@/lib/views/public-viewer-data";
import { GradeColorsResponseSchema, GradeColorsUpdateSchema } from "@/lib/validations/admin";
import type { GradeColorMap } from "@/lib/grade-colors";
import { guardFailureResponse } from "@/lib/auth/thrown-response";

function respond(colors: GradeColorMap): NextResponse {
  const body = GradeColorsResponseSchema.parse({ colors });
  return NextResponse.json(body, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  const user = await getStaffUser();
  try {
    assertAdmin(user);
  } catch (e) {
    return guardFailureResponse(e);
  }
  const ganttOff = await serviceDisabledResponse(user!.schoolId, "gantt");
  if (ganttOff) return ganttOff;
  return respond(await getGradeColors(user!.schoolId));
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  try {
    assertAdmin(user);
  } catch (e) {
    return guardFailureResponse(e);
  }
  const ganttOff = await serviceDisabledResponse(user!.schoolId, "gantt");
  if (ganttOff) return ganttOff;
  const body = await request.json().catch(() => null);
  const parsed = GradeColorsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const colors = await setGradeColors(user!.schoolId, parsed.data.colors);
  invalidatePublicViewerCache(user!.schoolSlug);
  return respond(colors);
}
