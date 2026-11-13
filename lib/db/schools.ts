import "server-only";
import { cache } from "react";
import { asc, eq, isNull, type SQL } from "drizzle-orm";
import { db, rethrowWithDatabaseHint } from "@/lib/db/client";
import { schools } from "@/lib/db/schema";
import type { Service } from "@/lib/services";
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
