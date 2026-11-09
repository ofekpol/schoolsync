// No `import "server-only"`: scripts/seed-demo-events.ts runs this through tsx.
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DEMO_EVENTS_YEAR, demoEventRange, demoEvents } from "@/db/demo-events";
import * as schema from "./schema";

type Tx = NodePgDatabase<typeof schema>;

/**
 * Inserts the realistic demo year (db/demo-events.ts) as published events.
 * Must run inside `withSchool(schoolId, …)`; the school's event types must exist.
 * Two statements total (events, then their grades) so a new demo starts fast.
 */
export async function insertDemoEvents(tx: Tx, schoolId: string, adminId: string): Promise<number> {
  const types = await tx.select({ id: schema.eventTypes.id, key: schema.eventTypes.key }).from(schema.eventTypes);
  const typeIdByKey = new Map(types.map((type) => [type.key, type.id]));
  const items = demoEvents();
  const rows = items.map((event) => {
    const eventTypeId = typeIdByKey.get(event.typeKey);
    if (!eventTypeId) throw new Error(`missing event type "${event.typeKey}"`);
    return {
      schoolId,
      eventTypeId,
      title: event.title,
      description: event.description ?? null,
      location: event.location ?? null,
      ...demoEventRange(event),
      allDay: event.time === undefined,
      status: "approved" as const,
      createdBy: adminId,
    };
  });
  const inserted = await tx.insert(schema.events).values(rows).returning({ id: schema.events.id });
  // Postgres returns multi-row INSERT … RETURNING rows in VALUES order.
  const grades = inserted.flatMap((row, index) =>
    items[index].grades.map((grade) => ({ eventId: row.id, grade, schoolId })),
  );
  if (grades.length > 0) await tx.insert(schema.eventGrades).values(grades);
  return inserted.length;
}

/** The academic year the demo events belong to. Must run inside `withSchool`. */
export async function insertDemoAcademicYear(tx: Tx, schoolId: string): Promise<string> {
  const [year] = await tx
    .insert(schema.academicYears)
    .values({ schoolId, ...DEMO_EVENTS_YEAR })
    .returning({ id: schema.academicYears.id });
  return year.id;
}
