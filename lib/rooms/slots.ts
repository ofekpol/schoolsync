import "server-only";
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { getActiveAcademicYearId } from "@/lib/db/schools";
import { staffUsers } from "@/lib/db/schema";
import { roomBookings, roomSlotReleases, roomWeeklySlots } from "@/lib/db/schema-rooms";
import { jerusalemDateString } from "@/lib/datetime";
import { RoomsError } from "./errors";
import { lockRoom } from "./rooms";
import { dayOfDate, periodOf, readWeek, type Tx } from "./week";

export interface WeeklySlot {
  id: string;
  day: number;
  period: number;
  label: string;
  staffUserId: string | null;
  staffName: string | null;
  /** Upcoming dates on which this slot is released for booking. */
  releasedDates: string[];
}

export interface SlotInput {
  day: number;
  period: number;
  label: string;
  staffUserId?: string | null;
}

/** The room's weekly slots in the active academic year, by day then period. */
export async function listSlots(schoolId: string, roomId: string): Promise<WeeklySlot[]> {
  const yearId = await getActiveAcademicYearId(schoolId);
  if (!yearId) return [];
  const today = jerusalemDateString(new Date());
  return withSchool(schoolId, async (tx) => {
    const rows = await tx
      .select({
        id: roomWeeklySlots.id,
        day: roomWeeklySlots.day,
        period: roomWeeklySlots.period,
        label: roomWeeklySlots.label,
        staffUserId: roomWeeklySlots.staffUserId,
        staffName: staffUsers.fullName,
      })
      .from(roomWeeklySlots)
      .leftJoin(staffUsers, eq(staffUsers.id, roomWeeklySlots.staffUserId))
      .where(and(eq(roomWeeklySlots.roomId, roomId), eq(roomWeeklySlots.academicYearId, yearId)))
      .orderBy(asc(roomWeeklySlots.day), asc(roomWeeklySlots.period));
    const releases = rows.length
      ? await tx
          .select({ slotId: roomSlotReleases.slotId, date: roomSlotReleases.date })
          .from(roomSlotReleases)
          .where(and(inArray(roomSlotReleases.slotId, rows.map((r) => r.id)), gte(roomSlotReleases.date, today)))
          .orderBy(asc(roomSlotReleases.date))
      : [];
    return rows.map((row) => ({
      ...row,
      staffName: row.staffName ?? null,
      releasedDates: releases.filter((r) => r.slotId === row.id).map((r) => r.date),
    }));
  });
}

async function assertStaffInSchool(tx: Tx, staffUserId: string): Promise<void> {
  const [row] = await tx.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.id, staffUserId));
  if (!row) throw new RoomsError("invalid_staff");
}

/** Sets (upserts) the room's use at a day and period of the active year. Null when the room is unknown. */
export async function setSlot(
  schoolId: string,
  roomId: string,
  input: SlotInput,
  actorId: string,
): Promise<{ id: string } | null> {
  const yearId = await getActiveAcademicYearId(schoolId);
  if (!yearId) throw new RoomsError("no_active_year");
  return withSchool(schoolId, async (tx) => {
    if (!(await lockRoom(tx, roomId))) return null;
    const week = await readWeek(tx, schoolId, true);
    if (!week) throw new RoomsError("no_week");
    const inWeek = week.days.some((d) => d.day === input.day && d.periods.some((p) => p.period === input.period));
    if (!inWeek) throw new RoomsError("not_in_week");
    if (input.staffUserId) await assertStaffInSchool(tx, input.staffUserId);
    const values = { label: input.label, staffUserId: input.staffUserId ?? null };
    const [row] = await tx
      .insert(roomWeeklySlots)
      .values({ schoolId, roomId, academicYearId: yearId, day: input.day, period: input.period, createdBy: actorId, ...values })
      .onConflictDoUpdate({
        target: [roomWeeklySlots.roomId, roomWeeklySlots.academicYearId, roomWeeklySlots.day, roomWeeklySlots.period],
        set: values,
      })
      .returning({ id: roomWeeklySlots.id });
    return row;
  });
}

/** Locks the slot's room and returns the slot; null when unknown (or another school's). */
async function lockSlot(tx: Tx, slotId: string) {
  const [slot] = await tx.select().from(roomWeeklySlots).where(eq(roomWeeklySlots.id, slotId));
  if (!slot || !(await lockRoom(tx, slot.roomId))) return null;
  return slot;
}

export function deleteSlot(schoolId: string, slotId: string): Promise<boolean> {
  return withSchool(schoolId, async (tx) => {
    if (!(await lockSlot(tx, slotId))) return false;
    await tx.delete(roomWeeklySlots).where(eq(roomWeeklySlots.id, slotId));
    return true;
  });
}

/** Frees a weekly slot on one date so it can be booked: the date must be today or later, on the slot's day. */
export function releaseSlot(schoolId: string, slotId: string, date: string, actorId: string): Promise<boolean> {
  const today = jerusalemDateString(new Date());
  return withSchool(schoolId, async (tx) => {
    const slot = await lockSlot(tx, slotId);
    if (!slot) return false;
    if (dayOfDate(date) !== slot.day) throw new RoomsError("not_in_week");
    if (date < today) throw new RoomsError("out_of_range");
    const week = await readWeek(tx, schoolId, true);
    if (!week || !periodOf(week, date, slot.period)) throw new RoomsError("not_in_week");
    await tx
      .insert(roomSlotReleases)
      .values({ slotId, date, schoolId, releasedBy: actorId })
      .onConflictDoNothing();
    return true;
  });
}

/** Takes a release back; `slot_taken` when someone already booked that date and period. */
export function unreleaseSlot(schoolId: string, slotId: string, date: string): Promise<boolean> {
  return withSchool(schoolId, async (tx) => {
    const slot = await lockSlot(tx, slotId);
    if (!slot) return false;
    const [booked] = await tx
      .select({ id: roomBookings.id })
      .from(roomBookings)
      .where(
        and(
          eq(roomBookings.roomId, slot.roomId),
          eq(roomBookings.date, date),
          eq(roomBookings.period, slot.period),
          isNull(roomBookings.canceledAt),
        ),
      )
      .limit(1);
    if (booked) throw new RoomsError("slot_taken");
    await tx.delete(roomSlotReleases).where(and(eq(roomSlotReleases.slotId, slotId), eq(roomSlotReleases.date, date)));
    return true;
  });
}
