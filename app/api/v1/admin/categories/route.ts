import { NextRequest, NextResponse } from "next/server";
import { createCategory, listCategories } from "@/lib/profile/categories";
import { categoryErrorResponse, invalidInput, requireCategoryAdmin } from "@/lib/profile/api-guard";
import {
  CategoriesResponseSchema,
  CategoryInputSchema,
  ProfileCategorySchema,
} from "@/lib/validations/profile";

/** GET — the school's active profile categories with their options (admin). */
export async function GET(): Promise<NextResponse> {
  const { user, response } = await requireCategoryAdmin(false);
  if (response) return response;
  const categories = await listCategories(user.schoolId);
  return NextResponse.json(CategoriesResponseSchema.parse({ categories }), { status: 200 });
}

/** POST — create a category with its options (admin). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user, response } = await requireCategoryAdmin(true);
  if (response) return response;
  const parsed = CategoryInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error.flatten());
  try {
    const category = await createCategory(user.schoolId, parsed.data);
    return NextResponse.json(ProfileCategorySchema.parse(category), { status: 201 });
  } catch (e) {
    const failure = categoryErrorResponse(e);
    if (failure) return failure;
    throw e;
  }
}
