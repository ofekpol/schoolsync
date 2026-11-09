import "server-only";
import type { StaffUserRecord } from "@/lib/db/staff";

/**
 * Guard for /admin/* routes. Throws Response(403) if user is not an admin.
 */
export function assertAdmin(
  user: StaffUserRecord | null,
): asserts user is StaffUserRecord & { role: "admin"; schoolId: string } {
  if (!user) throw new Response("Unauthorized", { status: 401 });
  if (!user.schoolId) throw new Response("Forbidden", { status: 403 });
  if (user.status !== "active") throw new Response("Forbidden", { status: 403 });
  if (user.role !== "admin") throw new Response("Forbidden", { status: 403 });
}

/**
 * Guard for creating event types. Admins and active editors are allowed.
 * Edit/delete remain admin-only (see assertAdmin).
 */
export function assertCanCreateEventType(
  user: StaffUserRecord | null,
): asserts user is StaffUserRecord & { schoolId: string } {
  if (!user) throw new Response("Unauthorized", { status: 401 });
  if (!user.schoolId) throw new Response("Forbidden", { status: 403 });
  if (user.status !== "active") throw new Response("Forbidden", { status: 403 });
  if (user.role !== "admin" && user.role !== "editor") {
    throw new Response("Forbidden", { status: 403 });
  }
}
