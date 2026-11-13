import "server-only";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { profileCategories, profileCategoryOptions } from "@/lib/db/schema-profile";
import {
  MAX_CATEGORIES,
  type CategoryInput,
  type ProfileCategory,
  type ProfileOption,
} from "@/lib/validations/profile";

type Tx = Parameters<Parameters<typeof withSchool>[1]>[0];

/** A category write the caller can explain to the user (409 / 422 at the API). */
export class CategoryError extends Error {
  constructor(readonly code: "duplicate_name" | "limit_reached") {
    super(code);
    this.name = "CategoryError";
  }
}

const activeCategory = isNull(profileCategories.archivedAt);
const activeOption = isNull(profileCategoryOptions.archivedAt);

async function loadOptions(tx: Tx, categoryIds: string[]): Promise<Map<string, ProfileOption[]>> {
  const byCategory = new Map<string, ProfileOption[]>();
  if (categoryIds.length === 0) return byCategory;
  const rows = await tx
    .select()
    .from(profileCategoryOptions)
    .where(and(inArray(profileCategoryOptions.categoryId, categoryIds), activeOption))
    .orderBy(asc(profileCategoryOptions.sortOrder), asc(profileCategoryOptions.label));
  for (const row of rows) {
    const list = byCategory.get(row.categoryId) ?? [];
    list.push({ id: row.id, label: row.label, sortOrder: row.sortOrder });
    byCategory.set(row.categoryId, list);
  }
  return byCategory;
}

async function loadCategories(tx: Tx, id?: string): Promise<ProfileCategory[]> {
  const rows = await tx
    .select()
    .from(profileCategories)
    .where(id ? and(activeCategory, eq(profileCategories.id, id)) : activeCategory)
    .orderBy(asc(profileCategories.sortOrder), asc(profileCategories.createdAt));
  const options = await loadOptions(tx, rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    multiSelect: row.multiSelect,
    required: row.required,
    sortOrder: row.sortOrder,
    options: options.get(row.id) ?? [],
  }));
}

async function assertNameFree(tx: Tx, name: string, exceptId?: string): Promise<void> {
  const clash = await tx
    .select({ id: profileCategories.id })
    .from(profileCategories)
    .where(
      and(
        activeCategory,
        eq(profileCategories.name, name),
        exceptId ? ne(profileCategories.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (clash.length > 0) throw new CategoryError("duplicate_name");
}

/** A school's active categories with their active options, in display order. */
export function listCategories(schoolId: string): Promise<ProfileCategory[]> {
  return withSchool(schoolId, (tx) => loadCategories(tx));
}

/** How many active categories the school has (0 = the profile step is off). */
export function countCategories(schoolId: string): Promise<number> {
  return withSchool(schoolId, async (tx) => {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(profileCategories)
      .where(activeCategory);
    return row.count;
  });
}

/** Adds a category at the end of the school's display order. */
export function createCategory(schoolId: string, input: CategoryInput): Promise<ProfileCategory> {
  return withSchool(schoolId, async (tx) => {
    const existing = await tx
      .select({ sortOrder: profileCategories.sortOrder })
      .from(profileCategories)
      .where(activeCategory);
    if (existing.length >= MAX_CATEGORIES) throw new CategoryError("limit_reached");
    await assertNameFree(tx, input.name);
    const sortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1;
    const [row] = await tx
      .insert(profileCategories)
      .values({
        schoolId,
        name: input.name,
        multiSelect: input.multiSelect,
        required: input.required,
        sortOrder,
      })
      .returning({ id: profileCategories.id });
    if (input.options.length > 0) {
      await tx.insert(profileCategoryOptions).values(
        input.options.map((option, index) => ({
          schoolId,
          categoryId: row.id,
          label: option.label,
          sortOrder: index,
        })),
      );
    }
    return (await loadCategories(tx, row.id))[0];
  });
}

/**
 * Options sent with a known id are updated, the rest are created, and active
 * options that were not sent are archived (staff rows pointing at them stay).
 */
async function syncOptions(
  tx: Tx,
  schoolId: string,
  categoryId: string,
  options: CategoryInput["options"],
): Promise<void> {
  const current = await tx
    .select({ id: profileCategoryOptions.id, label: profileCategoryOptions.label })
    .from(profileCategoryOptions)
    .where(and(eq(profileCategoryOptions.categoryId, categoryId), activeOption));
  const currentLabels = new Map(current.map((row) => [row.id, row.label]));
  const keptIds = new Set(options.flatMap((o) => (o.id && currentLabels.has(o.id) ? [o.id] : [])));
  const dropped = current.filter((row) => !keptIds.has(row.id)).map((row) => row.id);
  if (dropped.length > 0) {
    await tx
      .update(profileCategoryOptions)
      .set({ archivedAt: new Date() })
      .where(inArray(profileCategoryOptions.id, dropped));
  }
  // Park renamed options on their id first, so swapping two labels cannot
  // trip the (category_id, label) unique index midway.
  const renamed = options.filter((o) => o.id && keptIds.has(o.id) && currentLabels.get(o.id) !== o.label);
  for (const option of renamed) {
    await tx
      .update(profileCategoryOptions)
      .set({ label: option.id! })
      .where(eq(profileCategoryOptions.id, option.id!));
  }
  for (const [index, option] of options.entries()) {
    if (option.id && keptIds.has(option.id)) {
      await tx
        .update(profileCategoryOptions)
        .set({ label: option.label, sortOrder: index })
        .where(eq(profileCategoryOptions.id, option.id));
    } else {
      await tx
        .insert(profileCategoryOptions)
        .values({ schoolId, categoryId, label: option.label, sortOrder: index });
    }
  }
}

/** Replaces a category's fields and options. Null when it is not this school's active category. */
export function replaceCategory(
  schoolId: string,
  id: string,
  input: CategoryInput,
): Promise<ProfileCategory | null> {
  return withSchool(schoolId, async (tx) => {
    const [found] = await tx
      .select({ id: profileCategories.id })
      .from(profileCategories)
      .where(and(eq(profileCategories.id, id), activeCategory));
    if (!found) return null;
    await assertNameFree(tx, input.name, id);
    await tx
      .update(profileCategories)
      .set({ name: input.name, multiSelect: input.multiSelect, required: input.required })
      .where(eq(profileCategories.id, id));
    await syncOptions(tx, schoolId, id, input.options);
    return (await loadCategories(tx, id))[0];
  });
}

/** Archives a category (never deletes). False when it is not this school's active category. */
export function archiveCategory(schoolId: string, id: string): Promise<boolean> {
  return withSchool(schoolId, async (tx) => {
    const rows = await tx
      .update(profileCategories)
      .set({ archivedAt: new Date() })
      .where(and(eq(profileCategories.id, id), activeCategory))
      .returning({ id: profileCategories.id });
    return rows.length > 0;
  });
}

/** Sets the display order to `ids` (first = 1). Ids that are not this school's are ignored. */
export function reorderCategories(schoolId: string, ids: string[]): Promise<void> {
  return withSchool(schoolId, async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx
        .update(profileCategories)
        .set({ sortOrder: index + 1 })
        .where(eq(profileCategories.id, id));
    }
  });
}
