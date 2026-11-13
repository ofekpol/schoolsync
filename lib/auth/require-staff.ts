import { redirect } from "next/navigation";
import { getStaffUser, type StaffUserRecord } from "@/lib/auth/session";
import { signedOutPath } from "@/lib/auth/demo-guard";

/**
 * Layout guard: returns the signed-in, active staff user or redirects.
 * Signed out → login; pending → /auth/pending; deactivated → /auth/deactivated;
 * must change password → /auth/change-password.
 */
export async function requireActiveStaff(): Promise<StaffUserRecord> {
  const user = await getStaffUser();
  if (!user) redirect(await signedOutPath());
  if (user.status === "pending") redirect("/auth/pending");
  if (user.status === "deactivated") redirect("/auth/deactivated");
  if (user.mustChangePassword) redirect("/auth/change-password");
  return user;
}
