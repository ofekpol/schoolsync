import "server-only";
import { notFound, redirect } from "next/navigation";
import type { StaffUserRecord } from "@/lib/auth/session";
import { getSchoolById } from "@/lib/db/schools";
import { hasService, homePathFor, type Service } from "@/lib/services";

const SERVICE_HOME: Record<Service, string> = { gantt: "/dashboard", timetable: "/timetable" };

/**
 * Page guard: sends a user whose school lacks `service` to the school's home
 * page, or not-found when that home would be this same service (no loop).
 */
export async function requireService(user: StaffUserRecord, service: Service): Promise<void> {
  const school = user.schoolId ? await getSchoolById(user.schoolId) : null;
  if (!school) notFound();
  if (hasService(school, service)) return;
  const home = homePathFor(school.services);
  if (home === SERVICE_HOME[service]) notFound();
  redirect(home);
}
