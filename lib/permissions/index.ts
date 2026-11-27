import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { staffUsers } from "@/lib/db/schema";
import {
  profileCategories,
  profileCategoryOptions,
  staffProfileOptions,
} from "@/lib/db/schema-profile";
import type { StaffUserRecord } from "@/lib/db/staff";
import { PERMISSIONS, type Permission } from "./catalog";

export { PERMISSIONS, type Permission } from "./catalog";

const NONE: ReadonlySet<Permission> = new Set();

/**
 * A staff member's powers: the union of the permissions on the active options they hold in
 * active, admin-assigned categories. Admins hold all; only active staff hold any.
 * Sits beside `role`; it never widens what roles control.
 */
export async function getPermissions(user: StaffUserRecord): Promise<ReadonlySet<Permission>> {
  if (user.status !== "active" || !user.schoolId) return NONE;
  if (user.role === "admin") return new Set(PERMISSIONS);
  const rows = await withSchool(user.schoolId, (tx) =>
    tx
      .select({ permissions: profileCategoryOptions.permissions })
      .from(staffProfileOptions)
      .innerJoin(staffUsers, eq(staffUsers.id, staffProfileOptions.staffUserId))
      .innerJoin(profileCategoryOptions, eq(profileCategoryOptions.id, staffProfileOptions.optionId))
      .innerJoin(profileCategories, eq(profileCategories.id, profileCategoryOptions.categoryId))
      .where(
        and(
          eq(staffProfileOptions.staffUserId, user.id),
          eq(staffUsers.status, "active"),
          eq(profileCategories.adminAssigned, true),
          isNull(profileCategories.archivedAt),
          isNull(profileCategoryOptions.archivedAt),
        ),
      ),
  );
  const held = new Set(rows.flatMap((row) => row.permissions));
  if (held.has("rooms.manage")) held.add("rooms.book");
  return held;
}

export async function hasPermission(user: StaffUserRecord | null, permission: Permission): Promise<boolean> {
  if (!user) return false;
  return (await getPermissions(user)).has(permission);
}
