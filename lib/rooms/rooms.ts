import "server-only";
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { getActiveAcademicYearId } from "@/lib/db/schools";
import { roomBookings, roomWeeklySlots, rooms } from "@/lib/db/schema-rooms";
import { jerusalemDateString } from "@/lib/datetime";
import type { Room } from "@/lib/validations/rooms";
import { RoomsError, isUniqueViolation } from "./errors";
import type { Tx } from "./week";

const ROOM_COLUMNS = { id: rooms.id, name: rooms.name, sortOrder: rooms.sortOrder };

/** The school's active rooms in display order. */
export function listRooms(schoolId: string): Promise<Room[]> {
  return withSchool(schoolId, (tx) =>
    tx.select(ROOM_COLUMNS).from(rooms).where(isNull(rooms.archivedAt)).orderBy(asc(rooms.sortOrder), asc(rooms.name)),
  );
}

/** Locks an active room for the rest of the transaction; null when unknown or archived. */
export async function lockRoom(tx: Tx, roomId: string): Promise<Room | null> {
  const [room] = await tx
    .select(ROOM_COLUMNS)
    .from(rooms)
    .where(and(eq(rooms.id, roomId), isNull(rooms.archivedAt)))
    .for("update");
  return room ?? null;
}

async function mapDuplicate<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isUniqueViolation(e)) throw new RoomsError("duplicate_name");
    throw e;
  }
}

export function createRoom(schoolId: string, name: string): Promise<Room> {
  return mapDuplicate(() =>
    withSchool(schoolId, async (tx) => {
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${rooms.sortOrder}), 0)::int + 1` })
        .from(rooms)
        .where(isNull(rooms.archivedAt));
      const [room] = await tx.insert(rooms).values({ schoolId, name, sortOrder: next }).returning(ROOM_COLUMNS);
      return room;
    }),
  );
}

export function renameRoom(schoolId: string, id: string, name: string): Promise<Room | null> {
  return mapDuplicate(() =>
    withSchool(schoolId, async (tx) => {
      const [room] = await tx
        .update(rooms)
        .set({ name })
        .where(and(eq(rooms.id, id), isNull(rooms.archivedAt)))
        .returning(ROOM_COLUMNS);
      return room ?? null;
    }),
  );
}

export function reorderRooms(schoolId: string, ids: string[]): Promise<void> {
  return withSchool(schoolId, async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.update(rooms).set({ sortOrder: index + 1 }).where(eq(rooms.id, id));
    }
  });
}

/** Archives a room; `room_in_use` while it has a weekly slot this year or a future booking. */
export async function archiveRoom(schoolId: string, id: string): Promise<boolean> {
  const yearId = await getActiveAcademicYearId(schoolId);
  const today = jerusalemDateString(new Date());
  return withSchool(schoolId, async (tx) => {
    if (!(await lockRoom(tx, id))) return false;
    const slot = yearId
      ? await tx
          .select({ id: roomWeeklySlots.id })
          .from(roomWeeklySlots)
          .where(and(eq(roomWeeklySlots.roomId, id), eq(roomWeeklySlots.academicYearId, yearId)))
          .limit(1)
      : [];
    const booking = await tx
      .select({ id: roomBookings.id })
      .from(roomBookings)
      .where(and(eq(roomBookings.roomId, id), gte(roomBookings.date, today), isNull(roomBookings.canceledAt)))
      .limit(1);
    if (slot.length > 0 || booking.length > 0) throw new RoomsError("room_in_use");
    await tx.update(rooms).set({ archivedAt: new Date() }).where(eq(rooms.id, id));
    return true;
  });
}
