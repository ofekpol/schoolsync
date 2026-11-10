import "server-only";
import { eq, asc } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { eventTypes } from "@/lib/db/schema";
import type { z } from "zod";
import type { EventTypeSchema, EventTypeUpdateSchema } from "@/lib/validations/admin";
import { slugifyEventTypeKey, uniqueEventTypeKey } from "@/lib/admin/event-type-key";

type EventTypeInput = z.infer<typeof EventTypeSchema>;
type EventTypeUpdate = z.infer<typeof EventTypeUpdateSchema>;

/**
 * Creates an event type at the end of the school's display order.
 * Without an explicit key, one is derived from labelEn and made unique.
 */
export async function createEventType(
  schoolId: string,
  input: EventTypeInput,
): Promise<{ id: string; key: string }> {
  return withSchool(schoolId, async (tx) => {
    const existing = await tx
      .select({ key: eventTypes.key, sortOrder: eventTypes.sortOrder })
      .from(eventTypes);
    const taken = new Set(existing.map((row) => row.key));
    const key = input.key ?? uniqueEventTypeKey(slugifyEventTypeKey(input.labelEn), taken);
    const sortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1;
    const [row] = await tx
      .insert(eventTypes)
      .values({
        schoolId,
        key,
        labelHe: input.labelHe,
        labelEn: input.labelEn,
        colorHex: input.colorHex,
        glyph: input.glyph,
        sortOrder,
      })
      .returning({ id: eventTypes.id, key: eventTypes.key });
    return row;
  });
}

export async function updateEventType(
  schoolId: string,
  id: string,
  input: Partial<EventTypeUpdate>,
): Promise<{ updated: boolean }> {
  const rows = await withSchool(schoolId, (tx) =>
    tx
      .update(eventTypes)
      .set({
        ...(input.labelHe !== undefined && { labelHe: input.labelHe }),
        ...(input.labelEn !== undefined && { labelEn: input.labelEn }),
        ...(input.colorHex !== undefined && { colorHex: input.colorHex }),
        ...(input.glyph !== undefined && { glyph: input.glyph }),
      })
      .where(eq(eventTypes.id, id))
      .returning({ id: eventTypes.id }),
  );
  return { updated: rows.length > 0 };
}

/**
 * Sets the display order to `ids` (first = 1). `ids` must be exactly the
 * school's event types; otherwise nothing changes and `reordered` is false.
 */
export async function reorderEventTypes(
  schoolId: string,
  ids: string[],
): Promise<{ reordered: boolean }> {
  return withSchool(schoolId, async (tx) => {
    const existing = await tx.select({ id: eventTypes.id }).from(eventTypes);
    const known = new Set(existing.map((row) => row.id));
    const unique = new Set(ids);
    if (unique.size !== ids.length || unique.size !== known.size) return { reordered: false };
    if (ids.some((id) => !known.has(id))) return { reordered: false };
    for (const [index, id] of ids.entries()) {
      await tx.update(eventTypes).set({ sortOrder: index + 1 }).where(eq(eventTypes.id, id));
    }
    return { reordered: true };
  });
}

export async function deleteEventType(
  schoolId: string,
  id: string,
): Promise<{ deleted: boolean }> {
  const rows = await withSchool(schoolId, (tx) =>
    tx.delete(eventTypes).where(eq(eventTypes.id, id)).returning({ id: eventTypes.id }),
  );
  return { deleted: rows.length > 0 };
}

/** The school's event types in display order (sort_order, then Hebrew label). */
export async function listEventTypes(schoolId: string) {
  return withSchool(schoolId, (tx) =>
    tx
      .select({
        id: eventTypes.id,
        key: eventTypes.key,
        labelHe: eventTypes.labelHe,
        labelEn: eventTypes.labelEn,
        colorHex: eventTypes.colorHex,
        glyph: eventTypes.glyph,
      })
      .from(eventTypes)
      .orderBy(asc(eventTypes.sortOrder), asc(eventTypes.labelHe)),
  );
}
