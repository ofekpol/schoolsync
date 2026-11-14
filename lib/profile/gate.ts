import "server-only";
import { isDemoUser } from "@/lib/auth/demo-guard";
import type { StaffUserRecord } from "@/lib/db/staff";
import { countCategories } from "@/lib/profile/categories";

/**
 * True when a signed-in staff member should be sent to /profile first: their
 * school has at least one category and they have never saved a profile.
 * Adding a category later does not send anyone back; the staff table shows
 * who is missing a required label instead.
 */
export async function needsProfile(user: StaffUserRecord): Promise<boolean> {
  if (!user.schoolId || isDemoUser(user)) return false;
  // `undefined` (a record built without the column) is not "never completed".
  if (user.profileCompletedAt !== null) return false;
  return (await countCategories(user.schoolId)) > 0;
}
