import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { staffUsers } from "@/lib/db/schema";
import {
  profileCategories,
  profileCategoryOptions,
  staffProfileOptions,
} from "@/lib/db/schema-profile";

type Tx = Parameters<Parameters<typeof withSchool>[1]>[0];

/** A selection the user has to fix (400 at the API). */
export class ProfileValidationError extends Error {
  constructor(readonly code: "unknown_option" | "too_many" | "required_missing") {
    super(code);
    this.name = "ProfileValidationError";
  }
}

const activeOption = and(
  isNull(profileCategoryOptions.archivedAt),
  isNull(profileCategories.archivedAt),
);

interface ActiveOption {
  id: string;
  categoryId: string;
  multiSelect: boolean;
  required: boolean;
}

/** Every active option of every active category of the school in `tx`. */
function loadActiveOptions(tx: Tx): Promise<ActiveOption[]> {
  return tx
    .select({
      id: profileCategoryOptions.id,
      categoryId: profileCategories.id,
      multiSelect: profileCategories.multiSelect,
      required: profileCategories.required,
    })
    .from(profileCategoryOptions)
    .innerJoin(profileCategories, eq(profileCategoryOptions.categoryId, profileCategories.id))
    .where(activeOption);
}

/** Throws ProfileValidationError unless `optionIds` is a valid selection for the school. */
function validateSelection(options: ActiveOption[], optionIds: string[]): void {
  const byId = new Map(options.map((option) => [option.id, option]));
  const perCategory = new Map<string, number>();
  for (const id of optionIds) {
    const option = byId.get(id);
    if (!option) throw new ProfileValidationError("unknown_option");
    perCategory.set(option.categoryId, (perCategory.get(option.categoryId) ?? 0) + 1);
  }
  // A category with no active options cannot be required of anyone.
  for (const option of options) {
    const picked = perCategory.get(option.categoryId) ?? 0;
    if (!option.multiSelect && picked > 1) throw new ProfileValidationError("too_many");
    if (option.required && picked === 0) throw new ProfileValidationError("required_missing");
  }
}

/** The staff member's labels: active options of active categories only. */
export function getStaffOptionIds(schoolId: string, staffUserId: string): Promise<string[]> {
  return withSchool(schoolId, async (tx) => {
    const rows = await tx
      .select({ optionId: staffProfileOptions.optionId })
      .from(staffProfileOptions)
      .innerJoin(profileCategoryOptions, eq(staffProfileOptions.optionId, profileCategoryOptions.id))
      .innerJoin(profileCategories, eq(profileCategoryOptions.categoryId, profileCategories.id))
      .where(and(eq(staffProfileOptions.staffUserId, staffUserId), activeOption));
    return rows.map((row) => row.optionId);
  });
}

/**
 * Replaces the staff member's active labels and marks their profile complete.
 * Rows pointing at archived options are left alone (history).
 */
export function setStaffOptions(
  schoolId: string,
  staffUserId: string,
  optionIds: string[],
): Promise<void> {
  const wanted = [...new Set(optionIds)];
  return withSchool(schoolId, async (tx) => {
    const options = await loadActiveOptions(tx);
    validateSelection(options, wanted);
    const activeIds = options.map((option) => option.id);
    if (activeIds.length > 0) {
      await tx
        .delete(staffProfileOptions)
        .where(
          and(
            eq(staffProfileOptions.staffUserId, staffUserId),
            inArray(staffProfileOptions.optionId, activeIds),
          ),
        );
    }
    if (wanted.length > 0) {
      await tx
        .insert(staffProfileOptions)
        .values(wanted.map((optionId) => ({ staffUserId, optionId, schoolId })));
    }
    await tx
      .update(staffUsers)
      .set({ profileCompletedAt: new Date() })
      .where(eq(staffUsers.id, staffUserId));
  });
}

/** staffUserId -> active option ids, for the school's active staff only. */
export function listStaffLabels(schoolId: string): Promise<Record<string, string[]>> {
  return withSchool(schoolId, async (tx) => {
    const rows = await tx
      .select({ staffUserId: staffProfileOptions.staffUserId, optionId: staffProfileOptions.optionId })
      .from(staffProfileOptions)
      .innerJoin(staffUsers, eq(staffProfileOptions.staffUserId, staffUsers.id))
      .innerJoin(profileCategoryOptions, eq(staffProfileOptions.optionId, profileCategoryOptions.id))
      .innerJoin(profileCategories, eq(profileCategoryOptions.categoryId, profileCategories.id))
      .where(and(eq(staffUsers.status, "active"), activeOption));
    const labels: Record<string, string[]> = {};
    for (const row of rows) (labels[row.staffUserId] ??= []).push(row.optionId);
    return labels;
  });
}

/** True when the staff user is active in this school (RLS hides every other school's). */
export function isActiveStaffOfSchool(schoolId: string, staffUserId: string): Promise<boolean> {
  return withSchool(schoolId, async (tx) => {
    const rows = await tx
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(and(eq(staffUsers.id, staffUserId), eq(staffUsers.status, "active")))
      .limit(1);
    return rows.length > 0;
  });
}
