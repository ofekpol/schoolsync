/**
 * Replaces every event of a demo school with a realistic 2026–2027 year
 * (db/demo-events.ts) for sales meetings.
 *
 *   pnpm seed:demo-events                     # staging/local demo-school
 *   pnpm seed:demo-events edusolutions-demo   # the prod sales demo (provision it first)
 *
 * Only the slugs in DEMO_SLUGS can be touched, so a real school's calendar
 * can never be wiped, whatever DATABASE_URL points at.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, withSchool } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { DEFAULT_EVENT_TYPES } from "@/lib/db/provision";
import { insertDemoEvents } from "@/lib/db/demo-content";

export const DEMO_SLUGS = new Set(["demo-school", "edusolutions-demo"]);

export function assertDemoSlug(slug: string): void {
  if (!DEMO_SLUGS.has(slug)) {
    throw new Error(`refusing: "${slug}" is not a demo school (${[...DEMO_SLUGS].join(", ")})`);
  }
}

async function main(slug: string): Promise<void> {
  assertDemoSlug(slug);
  const [school] = await db.select().from(schema.schools).where(eq(schema.schools.slug, slug)).limit(1);
  if (!school) throw new Error(`school "${slug}" not found — provision it first`);

  const count = await withSchool(school.id, async (tx) => {
    const [admin] = await tx.select().from(schema.staffUsers).where(eq(schema.staffUsers.role, "admin")).limit(1);
    if (!admin) throw new Error(`school "${slug}" has no admin`);

    for (const type of DEFAULT_EVENT_TYPES) {
      await tx.insert(schema.eventTypes).values({ schoolId: school.id, ...type }).onConflictDoNothing();
    }

    // event_grades, revisions and dismissals cascade.
    await tx.delete(schema.events).where(eq(schema.events.schoolId, school.id));
    return insertDemoEvents(tx, school.id, admin.id);
  });
  console.log(`Seeded ${count} demo events into ${slug}.`);
}

const invokedAsScript = /[\\/]scripts[\\/]seed-demo-events\.ts$/.test(process.argv[1] ?? "");
if (invokedAsScript) {
  main(process.argv[2] ?? "demo-school")
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
