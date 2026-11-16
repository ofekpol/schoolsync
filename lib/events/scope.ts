import "server-only";
import { getEditorAllowedGrades } from "@/lib/events/queries";

interface EventActor {
  id: string;
  schoolId: string | null;
  role: "editor" | "admin" | "viewer";
  status: "pending" | "active" | "deactivated";
  mustChangePassword: boolean;
}

/**
 * Whether `user` may create, edit or publish events: an active editor or
 * admin who does not still have to change their password. Viewers only read.
 */
export function canEditEvents(user: EventActor): boolean {
  return user.role !== "viewer" && user.status === "active" && !user.mustChangePassword;
}

/**
 * The grades in `grades` that `user` may not assign; empty when all are allowed.
 * Admins may assign every grade. An editor without a school may assign none.
 * The event routes answer a non-empty result with 403 `scope_violation`.
 */
export async function findDisallowedGrades(
  user: Pick<EventActor, "id" | "schoolId" | "role">,
  grades: readonly number[] | undefined,
): Promise<number[]> {
  if (!grades || grades.length === 0 || user.role === "admin") return [];
  if (!user.schoolId) return [...grades];
  const allowed = new Set(await getEditorAllowedGrades(user.schoolId, user.id));
  return grades.filter((grade) => !allowed.has(grade));
}
