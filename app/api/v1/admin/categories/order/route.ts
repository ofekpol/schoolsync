import { NextRequest, NextResponse } from "next/server";
import { reorderCategories } from "@/lib/profile/categories";
import { invalidInput, requireCategoryAdmin } from "@/lib/profile/api-guard";
import { CategoryOrderSchema } from "@/lib/validations/profile";

/** PUT { ids } — admin sets the display order of the school's categories. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const { user, response } = await requireCategoryAdmin(true);
  if (response) return response;
  const parsed = CategoryOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error.flatten());
  await reorderCategories(user.schoolId, parsed.data.ids);
  return new NextResponse(null, { status: 204 });
}
