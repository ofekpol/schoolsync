import "server-only";
import { cache } from "react";
import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import { db, rethrowWithDatabaseHint, withSchool } from "@/lib/db/client";
import { academicYears, auditLog, schools } from "@/lib/db/schema";
import { jerusalemDateString } from "@/lib/datetime";
import { hasService, type Service } from "@/lib/services";
import { SchoolAccessTokenSchema } from "@/lib/validations/school";

export interface PublicSchoolRecord {
  id: string;
  slug: string;
  name: string;
  locale: string;
  timezone: string;
  /** Secret school link token; only ever shown to that school's own admins / link holders. */
  accessToken: string;
  /** Non-null only for public demo schools (migration 0019). */
  demoExpiresAt: Date | null;
  services: Service[];
}

/**
 * The `schools` table has no RLS (it is the tenant root), so this is the one
 * place we can read without `withSchool` — because we need the school_id
 * *before* we can scope subsequent queries.
 *
 * Lives in `lib/db/` per CLAUDE.md "Multi-Tenancy (Critical)" — the
 * unrestricted `db` client must only be imported inside this directory.
 */
const SCHOOL_COLUMNS = {
  id: schools.id,
  slug: schools.slug,
  name: schools.name,
  locale: schools.locale,
  timezone: schools.timezone,
  accessToken: schools.accessToken,
  demoExpiresAt: schools.demoExpiresAt,
  services: schools.services,
};

async function findSchool(where: SQL): Promise<PublicSchoolRecord | null> {
  let row: PublicSchoolRecord | undefined;
  try {
    [row] = await db
      .select(SCHOOL_COLUMNS)
      .from(schools)
      .where(where)
      .limit(1);
  } catch (error) {
    rethrowWithDatabaseHint(error, "Failed to load school");
  }

  return row ?? null;
}

/**
 * Resolves an untrusted school link token (`/<token>` route param, `?school=`
 * sign-up link, signup metadata) to its school. Slugs are guessable and are
 * deliberately NOT accepted: holding the secret link is the only way in.
 * Anything malformed or unknown is "no school" — never an error.
 */
export async function resolveSchoolFromParam(raw: unknown): Promise<PublicSchoolRecord | null> {
  const parsed = SchoolAccessTokenSchema.safeParse(raw);
  if (!parsed.success) return null;
  return findSchool(eq(schools.accessToken, parsed.data));
}

/** `resolveSchoolFromParam` for the public Gantt surfaces: a school without `gantt` is "no school". */
export async function resolveGanttSchoolFromParam(raw: unknown): Promise<PublicSchoolRecord | null> {
  const school = await resolveSchoolFromParam(raw);
  return school && hasService(school, "gantt") ? school : null;
}

/**
 * School id for a staff sign-up / sign-in `?school=` link. Demo schools are
 * excluded: nobody can register into a public demo (it has no real staff).
 */
export async function resolveSchoolIdFromParam(raw: unknown): Promise<string | null> {
  const school = await resolveSchoolFromParam(raw);
  return school && school.demoExpiresAt === null ? school.id : null;
}

/**
 * Resolves a school by id. Used by authenticated pages where the caller
 * already has `user.schoolId` and needs the human-readable name. Cached per
 * request so the staff/admin layout header and the page share one query.
 */
export const getSchoolById = cache(
  (id: string): Promise<PublicSchoolRecord | null> => findSchool(eq(schools.id, id)),
);

/** The school's active academic year id. `schools` isn't readable inside `withSchool` (0010 revokes it). */
export async function getActiveAcademicYearId(schoolId: string): Promise<string | null> {
  const [row] = await db
    .select({ yearId: schools.activeAcademicYearId })
    .from(schools)
    .where(eq(schools.id, schoolId))
    .limit(1);
  return row?.yearId ?? null;
}

/**
 * Rooms needs an active school year (booking horizon, weekly use). When the school has none, makes
 * the current one (Sept 1 → Aug 31 on the Jerusalem calendar) active, creating it if needed.
 */
export async function ensureActiveAcademicYear(schoolId: string, now: Date = new Date()): Promise<string> {
  const existing = await getActiveAcademicYearId(schoolId);
  if (existing) return existing;
  const today = jerusalemDateString(now);
  const start = Number(today.slice(5, 7)) >= 9 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const label = `${start}-${start + 1}`;
  const yearId = await withSchool(schoolId, async (tx) => {
    await tx
      .insert(academicYears)
      .values({ schoolId, label, startDate: `${start}-09-01`, endDate: `${start + 1}-08-31` })
      .onConflictDoNothing({ target: [academicYears.schoolId, academicYears.label] });
    const [row] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.label, label));
    return row.id;
  });
  await db
    .update(schools)
    .set({ activeAcademicYearId: yearId })
    .where(and(eq(schools.id, schoolId), isNull(schools.activeAcademicYearId)));
  return (await getActiveAcademicYearId(schoolId)) ?? yearId;
}

/**
 * Every school with its secret link token, alphabetical by name.
 * Platform admins only (/platform/schools) — never expose to a school's users.
 */
export async function listAllSchools(): Promise<PublicSchoolRecord[]> {
  try {
    // Public demo schools are throwaway tenants, not customers.
    return await db
      .select(SCHOOL_COLUMNS)
      .from(schools)
      .where(isNull(schools.demoExpiresAt))
      .orderBy(asc(schools.name));
  } catch (error) {
    rethrowWithDatabaseHint(error, "Failed to list schools");
  }
}

/**
 * Platform admins only. Writes an audit_log row with the before/after lists.
 * The actor is an auth user id (a platform admin may have no staff row here).
 * Returns false when no school has this id.
 */
export async function updateSchoolServices(
  schoolId: string,
  services: Service[],
  actorAuthId: string,
): Promise<boolean> {
  try {
    const [before] = await db
      .select({ services: schools.services })
      .from(schools)
      .where(eq(schools.id, schoolId))
      .limit(1);
    if (!before) return false;
    await db.update(schools).set({ services }).where(eq(schools.id, schoolId));
    if (services.includes("rooms")) await ensureActiveAcademicYear(schoolId);
    await withSchool(schoolId, (tx) =>
      tx.insert(auditLog).values({
        schoolId,
        action: "school_services_updated",
        targetTable: "schools",
        targetId: schoolId,
        payload: { from: before.services, to: services, actorAuthId },
      }),
    );
    return true;
  } catch (error) {
    rethrowWithDatabaseHint(error, "Failed to update school services");
  }
}
