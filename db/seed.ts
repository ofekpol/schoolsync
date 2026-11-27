import "dotenv/config";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db, supabaseAdmin, withSchool } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { DEMO_SCHOOL_ACCESS_TOKEN } from "@/db/demo-school";
import { enableDemoRooms, seedRooms } from "@/db/seed-rooms";

const SCHOOL_SLUG = "demo-school";
const ADMIN_EMAIL = "admin@demo-school.test";

// 6 grade-supervisor editors (grades 7-12)
const GRADE_EDITORS = [
  { grade: 7, email: "grade7@demo-school.test", fullName: "Grade 7 Coordinator" },
  { grade: 8, email: "grade8@demo-school.test", fullName: "Grade 8 Coordinator" },
  { grade: 9, email: "grade9@demo-school.test", fullName: "Grade 9 Coordinator" },
  { grade: 10, email: "grade10@demo-school.test", fullName: "Grade 10 Coordinator" },
  { grade: 11, email: "grade11@demo-school.test", fullName: "Grade 11 Coordinator" },
  { grade: 12, email: "grade12@demo-school.test", fullName: "Grade 12 Coordinator" },
];
const COUNSELOR = {
  eventTypeKey: "counseling",
  email: "counselor@demo-school.test",
  fullName: "School Counselor",
};
const VIEWER = {
  email: "viewer@demo-school.test",
  fullName: "Demo Viewer",
};

// 11 default event types (color-blind safe glyphs, distinct colors)
const EVENT_TYPES = [
  { key: "trip", labelHe: "טיול", labelEn: "Trip", colorHex: "#1f77b4", glyph: "T", sortOrder: 1 },
  { key: "exam", labelHe: "מבחן", labelEn: "Exam", colorHex: "#d62728", glyph: "E", sortOrder: 2 },
  { key: "ceremony", labelHe: "טקס", labelEn: "Ceremony", colorHex: "#9467bd", glyph: "C", sortOrder: 3 },
  { key: "vacation", labelHe: "חופשה", labelEn: "Vacation", colorHex: "#2ca02c", glyph: "V", sortOrder: 4 },
  { key: "parent_meeting", labelHe: "אסיפת הורים", labelEn: "Parent Meeting", colorHex: "#ff7f0e", glyph: "P", sortOrder: 5 },
  { key: "counseling", labelHe: "ייעוץ", labelEn: "Counseling", colorHex: "#8c564b", glyph: "S", sortOrder: 6 },
  { key: "lecture", labelHe: "הרצאה", labelEn: "Lecture", colorHex: "#17becf", glyph: "L", sortOrder: 7 },
  { key: "workshop", labelHe: "סדנה", labelEn: "Workshop", colorHex: "#bcbd22", glyph: "W", sortOrder: 8 },
  { key: "sport", labelHe: "ספורט", labelEn: "Sport", colorHex: "#e377c2", glyph: "X", sortOrder: 9 },
  { key: "holiday", labelHe: "חג", labelEn: "Holiday", colorHex: "#7f7f7f", glyph: "H", sortOrder: 10 },
  { key: "general", labelHe: "כללי", labelEn: "General", colorHex: "#aec7e8", glyph: "G", sortOrder: 11 },
];

type Database = NodePgDatabase<typeof schema>;

export interface SeedOptions {
  /**
   * Resolves an email to the staff_users.id to use. In production this is the
   * Supabase auth.users.id (via ensureAuthUser). In CI/tests it can be any
   * deterministic UUID — staff_users.id has no DB-level FK to auth.users.
   */
  ensureStaffUserId: (email: string) => Promise<string>;
  /** Optional injection point for the Drizzle client (tests). Defaults to the production singleton. */
  database?: Database;
}

// Temporary password assigned to all seeded staff accounts.
// Users are forced to change it on first login (mustChangePassword=true).
const SEED_TEMP_PASSWORD = "ChangeMe123!";

async function ensureAuthUser(email: string, password?: string): Promise<string> {
  // listUsers paginated; sufficient for small seed.
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = existing.users.find((u) => u.email === email);
  if (found) {
    // Ensure password is set even for pre-existing users (idempotent re-seed).
    if (password) {
      await supabaseAdmin.auth.admin.updateUserById(found.id, { password });
    }
    return found.id;
  }
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(password ? { password } : {}),
  });
  if (error ?? !data.user) throw new Error(`createUser ${email}: ${error?.message ?? "unknown"}`);
  return data.user.id;
}

/**
 * Seeds the canonical demo-school bootstrap into the DB pointed at by `opts.database`
 * (defaults to the production singleton). All Supabase Auth interaction is delegated
 * to `opts.ensureStaffUserId` so CI/tests can run the full DB seed without a real
 * Supabase Auth project.
 */
export async function seedDb(opts: SeedOptions): Promise<{ schoolId: string }> {
  const database = opts.database ?? db;

  // 1. School — no RLS on schools table; insert directly
  const [school] = await database
    .insert(schema.schools)
    .values({
      slug: SCHOOL_SLUG,
      name: "Demo School",
      accessToken: DEMO_SCHOOL_ACCESS_TOKEN,
      locale: "he",
      timezone: "Asia/Jerusalem",
    })
    .onConflictDoUpdate({
      target: schema.schools.slug,
      set: { name: sql`excluded.name`, accessToken: sql`excluded.access_token` },
    })
    .returning();

  // 2. Academic year (current year, Sept 1 → next July 31)
  const now = new Date();
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

  // 3–8. All school-scoped data uses withSchool so RLS FORCE is satisfied
  const yearId = await withSchool(school.id, async (tx) => {
    // 2. Academic year
    await tx
      .insert(schema.academicYears)
      .values({
        schoolId: school.id,
        label: `${startYear}-${startYear + 1}`,
        startDate: `${startYear}-09-01`,
        endDate: `${startYear + 1}-07-31`,
      })
      .onConflictDoNothing({
        target: [schema.academicYears.schoolId, schema.academicYears.label],
      });
    const [year] = await tx
      .select({ id: schema.academicYears.id })
      .from(schema.academicYears)
      .where(sql`${schema.academicYears.label} = ${`${startYear}-${startYear + 1}`}`);

    // 3. Event types (insert before scopes so counselor scope FK-by-key works)
    for (const et of EVENT_TYPES) {
      await tx
        .insert(schema.eventTypes)
        .values({ schoolId: school.id, ...et })
        .onConflictDoUpdate({
          target: [schema.eventTypes.schoolId, schema.eventTypes.key],
          set: {
            labelHe: sql`excluded.label_he`,
            labelEn: sql`excluded.label_en`,
            colorHex: sql`excluded.color_hex`,
            glyph: sql`excluded.glyph`,
            sortOrder: sql`excluded.sort_order`,
          },
        });
    }

    // 4. Admin staff user
    const adminAuthId = await opts.ensureStaffUserId(ADMIN_EMAIL);
    const [adminRow] = await tx
      .insert(schema.staffUsers)
      .values({
        id: adminAuthId,
        schoolId: school.id,
        email: ADMIN_EMAIL,
        fullName: "Demo Admin",
        role: "admin",
        mustChangePassword: true,
      })
      .onConflictDoUpdate({
        target: schema.staffUsers.email,
        set: { schoolId: school.id, role: "admin" },
      })
      .returning({ id: schema.staffUsers.id });

    // 5. Grade editors + scopes
    // RETURNING resolves to the *existing* row's id on email-conflict, so
    // editor_scopes always references a valid staff_users.id even when the
    // caller-supplied id differs from a pre-existing row.
    for (const ge of GRADE_EDITORS) {
      const authId = await opts.ensureStaffUserId(ge.email);
      const [row] = await tx
        .insert(schema.staffUsers)
        .values({
          id: authId,
          schoolId: school.id,
          email: ge.email,
          fullName: ge.fullName,
          role: "editor",
          mustChangePassword: true,
        })
        .onConflictDoUpdate({
          target: schema.staffUsers.email,
          set: { schoolId: school.id, fullName: sql`excluded.full_name` },
        })
        .returning({ id: schema.staffUsers.id });
      await tx
        .insert(schema.editorScopes)
        .values({
          staffUserId: row.id,
          schoolId: school.id,
          scopeKind: "grade",
          scopeValue: String(ge.grade),
        })
        .onConflictDoNothing();
    }

    // 6. Counselor + event_type scope
    const counselorAuthId = await opts.ensureStaffUserId(COUNSELOR.email);
    const [counselorRow] = await tx
      .insert(schema.staffUsers)
      .values({
        id: counselorAuthId,
        schoolId: school.id,
        email: COUNSELOR.email,
        fullName: COUNSELOR.fullName,
        role: "editor",
        mustChangePassword: true,
      })
      .onConflictDoUpdate({
        target: schema.staffUsers.email,
        set: { schoolId: school.id, fullName: sql`excluded.full_name` },
      })
      .returning({ id: schema.staffUsers.id });

    await tx
      .insert(schema.editorScopes)
      .values({
        staffUserId: counselorRow.id,
        schoolId: school.id,
        scopeKind: "event_type",
        scopeValue: COUNSELOR.eventTypeKey,
      })
      .onConflictDoNothing();

    // 7. Viewer — read-only staff account; no editor_scopes
    const viewerAuthId = await opts.ensureStaffUserId(VIEWER.email);
    const [viewerRow] = await tx
      .insert(schema.staffUsers)
      .values({
        id: viewerAuthId,
        schoolId: school.id,
        email: VIEWER.email,
        fullName: VIEWER.fullName,
        role: "viewer",
      })
      .onConflictDoUpdate({
        target: schema.staffUsers.email,
        set: { schoolId: school.id, fullName: sql`excluded.full_name` },
      })
      .returning({ id: schema.staffUsers.id });

    // 8. Rooms: week, rooms, fixed use, and the admin-assigned role labels (viewer = מורה)
    await seedRooms(tx, school.id, year.id, adminRow.id, viewerRow.id);
    return year.id;
  });
  await enableDemoRooms(database, school.id, yearId);

  return { schoolId: school.id };
}

// Same project ref scripts/refresh-staging-db.sh refuses to deviate from.
const STAGING_PROJECT_REF = "wmapfuwpdyishfqtzwha";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function isLocalOrStaging(url: string): boolean {
  if (url.includes(STAGING_PROJECT_REF)) return true;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * The seed creates ChangeMe123! accounts — it must never touch prod, neither
 * its database nor its Supabase Auth (ensureAuthUser uses the Supabase URL).
 */
export function assertSeedTargetAllowed(
  databaseUrl: string | undefined,
  supabaseUrl?: string,
): void {
  if (databaseUrl === undefined || !isLocalOrStaging(databaseUrl)) {
    throw new Error("refusing to seed: DATABASE_URL is not local or staging");
  }
  if (supabaseUrl !== undefined && !isLocalOrStaging(supabaseUrl)) {
    throw new Error("refusing to seed: NEXT_PUBLIC_SUPABASE_URL is not local or staging");
  }
}

async function main() {
  assertSeedTargetAllowed(process.env.DATABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
  const { schoolId } = await seedDb({
    ensureStaffUserId: (email) => ensureAuthUser(email, SEED_TEMP_PASSWORD),
  });
  console.log(
    `Seed complete: schoolId=${schoolId} admin=${ADMIN_EMAIL} tempPassword=${SEED_TEMP_PASSWORD}`,
  );
  process.exit(0);
}

// Only auto-run when invoked as a script (`tsx db/seed.ts`), not when imported.
const invokedAsScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /[\\/]db[\\/]seed\.ts$/.test(process.argv[1]);

if (invokedAsScript) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
