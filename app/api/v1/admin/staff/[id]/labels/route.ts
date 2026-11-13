import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isStaffOfSchool } from "@/lib/profile/staff-labels";
import { invalidInput, requireCategoryAdmin, saveStaffOptions } from "@/lib/profile/api-guard";
import { StaffOptionsSchema } from "@/lib/validations/profile";

type RouteContext = { params: Promise<{ id: string }> };

/** PUT { optionIds } — an admin replaces the labels of a staff member of their school. */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { user, response } = await requireCategoryAdmin(true);
  if (response) return response;
  const id = z.string().uuid().safeParse((await params).id);
  const parsed = StaffOptionsSchema.safeParse(await request.json().catch(() => null));
  if (!id.success) return invalidInput();
  if (!parsed.success) return invalidInput(parsed.error.flatten());
  if (!(await isStaffOfSchool(user.schoolId, id.data))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return saveStaffOptions(user.schoolId, id.data, parsed.data.optionIds);
}
