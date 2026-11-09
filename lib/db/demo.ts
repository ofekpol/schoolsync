import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, count, eq, gt, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db, withSchool } from "./client";
import * as schema from "./schema";
import { insertDefaultEventTypes, insertSchool } from "./provision";
import { insertDemoAcademicYear, insertDemoEvents } from "./demo-content";
import type { StaffUserRecord } from "./staff";

/** Public demo sandbox (docs/superpowers/specs/2026-11-09-demo-sandbox-design.md). */
export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;
export const DEMO_PER_IP_PER_HOUR = 3;
export const DEMO_GLOBAL_PER_DAY = 100;
const DEFAULT_DB_SIZE_LIMIT_MB = 350;
export const DEMO_CLEANUP_BATCH = 20;
const HOUR_MS = 60 * 60 * 1000;
const DEMO_SCHOOL_NAME = "תיכון נווה ים (הדגמה)";
const DEMO_ADMIN_NAME = "מנהל/ת הדגמה";

export type DemoReservation = "ok" | "ip_limit" | "global_limit" | "db_full";

function dbSizeLimitBytes(): number {
  const mb = Number(process.env.DEMO_DB_SIZE_LIMIT_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_DB_SIZE_LIMIT_MB) * 1024 * 1024;
}

/**
 * Atomically claims one demo creation for this IP hash. The global advisory
 * lock serializes reservations across server instances, and the ledger row is
 * never deleted on failure or "start over", so it always counts.
 */
export async function reserveDemoSlot(ipHash: string, now: Date = new Date()): Promise<DemoReservation> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('demo_create'))`);
    const { rows } = await tx.execute(sql`select pg_database_size(current_database())::bigint as size`);
    if (Number((rows[0] as { size: string | number }).size) > dbSizeLimitBytes()) return "db_full";
    const dayAgo = new Date(now.getTime() - DEMO_TTL_MS);
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    const [{ total }] = await tx
      .select({ total: count() })
      .from(schema.demoCreations)
      .where(gte(schema.demoCreations.createdAt, dayAgo));
    if (total >= DEMO_GLOBAL_PER_DAY) return "global_limit";
    const [{ mine }] = await tx
      .select({ mine: count() })
      .from(schema.demoCreations)
      .where(and(eq(schema.demoCreations.ipHash, ipHash), gte(schema.demoCreations.createdAt, hourAgo)));
    if (mine >= DEMO_PER_IP_PER_HOUR) return "ip_limit";
    await tx.insert(schema.demoCreations).values({ ipHash, createdAt: now });
    return "ok";
  });
}

export interface CreatedDemo {
  schoolId: string;
  staffId: string;
  expiresAt: Date;
}

/** Creates a filled demo school with one admin (no Supabase Auth user). Cleans up on failure. */
export async function createDemoSchool(now: Date = new Date()): Promise<CreatedDemo> {
  const expiresAt = new Date(now.getTime() + DEMO_TTL_MS);
  const suffix = randomBytes(6).toString("hex");
  const { id: schoolId } = await insertSchool({
    slug: `demo-${suffix}`,
    name: DEMO_SCHOOL_NAME,
    locale: "he",
    timezone: "Asia/Jerusalem",
    demoExpiresAt: expiresAt,
  });
  const staffId = randomUUID();
  try {
    const yearId = await withSchool(schoolId, async (tx) => {
      await insertDefaultEventTypes(tx, schoolId);
      await tx.insert(schema.staffUsers).values({
        id: staffId,
        schoolId,
        email: `demo-${staffId}@demo.edusolutions.invalid`,
        fullName: DEMO_ADMIN_NAME,
        role: "admin",
        status: "active",
        mustChangePassword: false,
      });
      await insertDemoEvents(tx, schoolId, staffId);
      return insertDemoAcademicYear(tx, schoolId);
    });
    await db.update(schema.schools).set({ activeAcademicYearId: yearId }).where(eq(schema.schools.id, schoolId));
  } catch (error) {
    await deleteDemoSchool(schoolId);
    throw error;
  }
  return { schoolId, staffId, expiresAt };
}

/** Child tables first; events cascade to event_grades, event_revisions and dismissals. */
const SCHOOL_OWNED_TABLES = [
  "audit_log",
  "ical_subscriptions",
  "staff_event_dismissals",
  "events",
  "event_types",
  "staff_invites",
  "pending_registrations",
  "school_grade_colors",
] as const;

/**
 * Deletes a demo school and every row it owns, in one transaction. Refuses a
 * real school (demo_expires_at IS NULL). A missing school is success (idempotent).
 */
export async function deleteDemoSchool(schoolId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [school] = await tx
      .select({ demoExpiresAt: schema.schools.demoExpiresAt })
      .from(schema.schools)
      .where(eq(schema.schools.id, schoolId))
      .for("update");
    if (!school) return;
    if (school.demoExpiresAt === null) throw new Error(`refusing to delete non-demo school ${schoolId}`);
    await tx.update(schema.schools).set({ activeAcademicYearId: null }).where(eq(schema.schools.id, schoolId));
    for (const table of SCHOOL_OWNED_TABLES) {
      await tx.execute(sql`delete from ${sql.identifier(table)} where school_id = ${schoolId}`);
    }
    await tx.execute(
      sql`delete from editor_scopes where staff_user_id in (select id from staff_users where school_id = ${schoolId})`,
    );
    await tx.delete(schema.staffUsers).where(eq(schema.staffUsers.schoolId, schoolId));
    await tx.delete(schema.academicYears).where(eq(schema.academicYears.schoolId, schoolId));
    await tx.delete(schema.schools).where(eq(schema.schools.id, schoolId));
  });
}

/** Deletes up to `limit` expired demos and prunes ledger rows older than 24 h. */
export async function cleanupExpiredDemos(limit: number, now: Date = new Date()): Promise<number> {
  const expired = await db
    .select({ id: schema.schools.id })
    .from(schema.schools)
    .where(and(isNotNull(schema.schools.demoExpiresAt), lte(schema.schools.demoExpiresAt, now)))
    .orderBy(schema.schools.demoExpiresAt)
    .limit(limit);
  for (const { id } of expired) await deleteDemoSchool(id);
  await db
    .delete(schema.demoCreations)
    .where(lte(schema.demoCreations.createdAt, new Date(now.getTime() - DEMO_TTL_MS)));
  return expired.length;
}

/**
 * Resolves a verified demo cookie to its staff row: only when the row belongs
 * to the cookie's school, that school is a live (unexpired) demo, and the row
 * is active. A cookie naming a real school therefore never resolves.
 */
export async function getDemoStaffUser(
  staffId: string,
  schoolId: string,
  now: Date = new Date(),
): Promise<StaffUserRecord | null> {
  const [row] = await db
    .select({
      id: schema.staffUsers.id,
      schoolId: schema.staffUsers.schoolId,
      schoolSlug: schema.schools.slug,
      role: schema.staffUsers.role,
      status: schema.staffUsers.status,
      email: schema.staffUsers.email,
      fullName: schema.staffUsers.fullName,
      mustChangePassword: schema.staffUsers.mustChangePassword,
      demoExpiresAt: schema.schools.demoExpiresAt,
    })
    .from(schema.staffUsers)
    .innerJoin(schema.schools, eq(schema.staffUsers.schoolId, schema.schools.id))
    .where(
      and(
        eq(schema.staffUsers.id, staffId),
        eq(schema.staffUsers.schoolId, schoolId),
        eq(schema.staffUsers.status, "active"),
        gt(schema.schools.demoExpiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}
