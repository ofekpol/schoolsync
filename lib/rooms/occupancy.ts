import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { getActiveAcademicYearId } from "@/lib/db/schools";
import { staffUsers } from "@/lib/db/schema";
import { roomBookings, roomSlotReleases, roomWeeklySlots, rooms } from "@/lib/db/schema-rooms";
import { buildDay, type DayFilter, type DayInput, type DayView } from "./day";
import { dayOfDate, readWeek, type Tx } from "./week";

export type { Cell, DayFilter, DayView } from "./day";

async function readSlots(tx: Tx, yearId: string | null, date: string): Promise<DayInput["slots"]> {
  if (!yearId) return [];
  const rows = await tx
    .select({
      id: roomWeeklySlots.id,
      roomId: roomWeeklySlots.roomId,
      period: roomWeeklySlots.period,
      label: roomWeeklySlots.label,
      staffName: staffUsers.fullName,
    })
    .from(roomWeeklySlots)
    .leftJoin(staffUsers, eq(staffUsers.id, roomWeeklySlots.staffUserId))
    .where(and(eq(roomWeeklySlots.academicYearId, yearId), eq(roomWeeklySlots.day, dayOfDate(date))));
  return rows.map((row) => ({ ...row, staffName: row.staffName ?? null }));
}

async function readReleases(tx: Tx, slotIds: string[], date: string): Promise<string[]> {
  if (slotIds.length === 0) return [];
  const rows = await tx
    .select({ slotId: roomSlotReleases.slotId })
    .from(roomSlotReleases)
    .where(and(inArray(roomSlotReleases.slotId, slotIds), eq(roomSlotReleases.date, date)));
  return rows.map((row) => row.slotId);
}

async function readBookings(tx: Tx, date: string): Promise<DayInput["bookings"]> {
  const rows = await tx
    .select({
      roomId: roomBookings.roomId,
      groupId: roomBookings.groupId,
      period: roomBookings.period,
      staffUserId: roomBookings.staffUserId,
      staffName: staffUsers.fullName,
      note: roomBookings.note,
    })
    .from(roomBookings)
    .innerJoin(staffUsers, eq(staffUsers.id, roomBookings.staffUserId))
    .where(and(eq(roomBookings.date, date), isNull(roomBookings.canceledAt)));
  return rows.map((row) => ({ ...row, canceled: false }));
}

/** Every active room's state in each period of `date`, filtered; `me` marks the caller's bookings. */
export async function getDay(schoolId: string, date: string, filter: DayFilter, me: string): Promise<DayView> {
  const yearId = await getActiveAcademicYearId(schoolId);
  const input = await withSchool(schoolId, async (tx): Promise<DayInput> => {
    const week = await readWeek(tx, schoolId);
    const roomRows = await tx
      .select({ id: rooms.id, name: rooms.name, sortOrder: rooms.sortOrder })
      .from(rooms)
      .where(isNull(rooms.archivedAt));
    const slots = await readSlots(tx, yearId, date);
    const releasedSlotIds = await readReleases(tx, slots.map((s) => s.id), date);
    const bookings = await readBookings(tx, date);
    return { date, week, rooms: roomRows, slots, releasedSlotIds, bookings };
  });
  return buildDay(input, filter, me);
}
