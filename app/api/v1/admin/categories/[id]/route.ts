import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { archiveCategory, replaceCategory } from "@/lib/profile/categories";
import { categoryErrorResponse, invalidInput, requireCategoryAdmin } from "@/lib/profile/api-guard";
import { CategoryInputSchema, ProfileCategorySchema } from "@/lib/validations/profile";

type RouteContext = { params: Promise<{ id: string }> };

const IdSchema = z.string().uuid();
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** PUT — replace a category's fields and options (admin). */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { user, response } = await requireCategoryAdmin(true);
  if (response) return response;
  const id = IdSchema.safeParse((await params).id);
  const parsed = CategoryInputSchema.safeParse(await request.json().catch(() => null));
  if (!id.success) return invalidInput();
  if (!parsed.success) return invalidInput(parsed.error.flatten());
  try {
    const category = await replaceCategory(user.schoolId, id.data, parsed.data);
    if (!category) return notFound();
    return NextResponse.json(ProfileCategorySchema.parse(category), { status: 200 });
  } catch (e) {
    const failure = categoryErrorResponse(e);
    if (failure) return failure;
    throw e;
  }
}

/** DELETE — archive a category; its options and staff labels are kept (admin). */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { user, response } = await requireCategoryAdmin(true);
  if (response) return response;
  const id = IdSchema.safeParse((await params).id);
  if (!id.success) return invalidInput();
  const archived = await archiveCategory(user.schoolId, id.data);
  return archived ? new NextResponse(null, { status: 204 }) : notFound();
}
