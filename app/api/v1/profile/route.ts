import { NextRequest, NextResponse } from "next/server";
import { listCategories } from "@/lib/profile/categories";
import { getStaffOptionIds } from "@/lib/profile/staff-labels";
import { invalidInput, requireActiveStaff, saveStaffOptions } from "@/lib/profile/api-guard";
import { ProfileResponseSchema, StaffOptionsSchema } from "@/lib/validations/profile";

/** GET — the school's categories and the caller's own labels (any active staff role). */
export async function GET(): Promise<NextResponse> {
  const { user, response } = await requireActiveStaff(false);
  if (response) return response;
  const [categories, selected] = await Promise.all([
    listCategories(user.schoolId),
    getStaffOptionIds(user.schoolId, user.id),
  ]);
  return NextResponse.json(ProfileResponseSchema.parse({ categories, selected }), { status: 200 });
}

/** PUT { optionIds } — the caller replaces their own labels. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const { user, response } = await requireActiveStaff(true);
  if (response) return response;
  const parsed = StaffOptionsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error.flatten());
  return saveStaffOptions(user.schoolId, user.id, parsed.data.optionIds);
}
