// NOTE: no `import "server-only"` — this module is invoked by scripts/provision-school.ts
// via tsx outside the Next.js server runtime. It is also safe to call from server-only
// Next.js code (Server Components / route handlers); never import from a Client Component.
import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Service } from "@/lib/services";
import { ProvisionSchoolInput } from "@/lib/validations/school";
import { db, supabaseAdmin, withSchool } from "./client";
import * as schema from "./schema";

/**
 * Default per-school event types — same 11 categories used in db/seed.ts.
 * Color-blind-safe palette + distinct glyphs. Admin can edit via /admin/event-types after launch.
 */
export const DEFAULT_EVENT_TYPES = [
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
] as const;

export { ProvisionSchoolInput };

export interface ProvisionSchoolResult {
  schoolId: string;
  /** Secret school link token for `/schedule?school=` and `/auth/login?school=` links. */
  accessToken: string;
  adminAuthUserId: string;
  magicLinkUrl: string;
  /** ISO 8601. Supabase magic links default to 1 hour. */
  magicLinkExpiresAt: string;
}

type Tx = NodePgDatabase<typeof schema>;

export interface SchoolRowInput {
  slug: string;
  name: string;
  locale: string;
  timezone: string;
  /** Defaults to gantt only (demo schools, CLI). */
  services?: Service[];
  /** Only for public demo schools (lib/db/demo.ts). */
  demoExpiresAt?: Date;
}

/** Insert the tenant root row. Throws when slug already taken — never clobbers. */
export async function insertSchool(input: SchoolRowInput): Promise<{ id: string; accessToken: string }> {
  const inserted = await db
    .insert(schema.schools)
    .values({
      slug: input.slug,
      name: input.name,
      locale: input.locale,
      timezone: input.timezone,
      services: input.services ?? ["gantt"],
      demoExpiresAt: input.demoExpiresAt ?? null,
    })
    .onConflictDoNothing({ target: schema.schools.slug })
    .returning({ id: schema.schools.id, accessToken: schema.schools.accessToken });
  if (inserted.length === 0) {
    throw new Error(`school with slug "${input.slug}" already exists — refusing to clobber`);
  }
  return inserted[0];
}

export async function insertDefaultEventTypes(tx: Tx, schoolId: string): Promise<void> {
  await tx.insert(schema.eventTypes).values(DEFAULT_EVENT_TYPES.map((et) => ({ schoolId, ...et })));
}

const AUTH_USERS_PER_PAGE = 200;

/** Walk every listUsers page; the Auth admin API has no lookup-by-email. */
async function findAuthUserByEmail(
  email: string,
): Promise<{ id: string; email_confirmed_at?: string | null } | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PER_PAGE,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < AUTH_USERS_PER_PAGE) return null;
  }
}

/** Resolve a Supabase Auth user by email; create if absent. No password — magic-link only. */
async function ensureAuthUserPasswordless(email: string): Promise<string> {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    // Anyone can sign up with an email they don't own; until it is confirmed, its
    // password may be a stranger's, and our magic link would confirm it for them.
    if (!existing.email_confirmed_at) {
      throw new Error(
        `auth user ${email} exists but is unconfirmed — delete it in Supabase Auth, then retry`,
      );
    }
    return existing.id;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createUser ${email}: ${error?.message ?? "unknown"}`);
  }
  return data.user.id;
}

async function insertAdminStaffUser(
  tx: Tx,
  schoolId: string,
  input: ProvisionSchoolInput,
): Promise<string> {
  const authUserId = await ensureAuthUserPasswordless(input.adminEmail);
  await tx.insert(schema.staffUsers).values({
    id: authUserId,
    schoolId,
    email: input.adminEmail,
    fullName: input.adminName,
    role: "admin",
    status: "active",
    mustChangePassword: false,
  });
  return authUserId;
}

async function generateAdminMagicLink(
  adminEmail: string,
  appUrl: string | undefined,
): Promise<{ magicLinkUrl: string; magicLinkExpiresAt: string }> {
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is required to build the magic-link redirect");
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: adminEmail,
    options: { redirectTo: `${appUrl.replace(/\/$/, "")}/dashboard` },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    throw new Error(`generateLink: ${linkErr?.message ?? "no action_link returned"}`);
  }
  // Supabase magic-link default OTP TTL is 3600s; reflect that for the email body.
  return {
    magicLinkUrl: linkData.properties.action_link,
    magicLinkExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Provision a brand-new tenant: school row + 11 event types + admin staff user.
 * Idempotency: conflicts on slug throw — we never clobber an existing school.
 * Caller is responsible for emailing the returned magicLinkUrl to the admin.
 * `appUrl` is the magic link's redirect origin; defaults to NEXT_PUBLIC_APP_URL
 * (unset on Vercel Preview, where the route passes the request origin).
 */
export async function provisionSchool(
  rawInput: z.input<typeof ProvisionSchoolInput>,
  appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
): Promise<ProvisionSchoolResult> {
  const input = ProvisionSchoolInput.parse(rawInput);

  const { id: schoolId, accessToken } = await insertSchool(input);

  let adminAuthUserId: string;
  try {
    adminAuthUserId = await withSchool(schoolId, async (tx) => {
      await insertDefaultEventTypes(tx, schoolId);
      return insertAdminStaffUser(tx, schoolId, input);
    });
  } catch (err) {
    // The transaction rolled back, so only the bare school row is left; drop it so the
    // slug is free to retry. A just-created Auth user stays and is reused on retry.
    await db.delete(schema.schools).where(eq(schema.schools.id, schoolId));
    throw err;
  }

  let magicLink: { magicLinkUrl: string; magicLinkExpiresAt: string };
  try {
    magicLink = await generateAdminMagicLink(input.adminEmail, appUrl);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `school was created (${input.slug}) but its admin sign-in link failed: ${reason}. ` +
        `The admin can sign in with "forgot password" or Google instead.`,
    );
  }
  const { magicLinkUrl, magicLinkExpiresAt } = magicLink;

  return { schoolId, accessToken, adminAuthUserId, magicLinkUrl, magicLinkExpiresAt };
}
