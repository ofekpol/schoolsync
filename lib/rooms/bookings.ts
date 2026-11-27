import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { getActiveAcademicYearId } from "@/lib/db/schools";
import { academicYears } from "@/lib/db/schema";
import { roomBookings, roomSlotReleases, roomWeeklySlots, rooms } from "@/lib/db/schema-rooms";
import { jerusalemDateString, jerusalemTimeString } from "@/lib/datetime";
import type { SchoolUser } from "./guard";
import { RoomsError, isUniqueViolation } from "./errors";
import { lockRoom } from "./rooms";
import { dayOfDate, periodOf, readWeek, type Tx, type Week } from "./week";

export interface BookingInput {
  roomId: string;
  date: string;
  periods: number[];
  note?: string | null;
}

export interface MyBooking {
  groupId: string;
  roomId: string;
  roomName: string;
  date: string;
  periods: number[];
  note: string | null;
}

async function yearRange(tx: Tx, yearId: string): Promise<{ start: string; end: string }> {
  const [year] = await tx
    .select({ start: academicYears.startDate, end: academicYears.endDate })
    .from(academicYears)
    .where(eq(academicYears.id, yearId));
  if (!year) throw new RoomsError("no_active_year");
  return year;
}

/** Every period exists that day; none of today's is over (Asia/Jerusalem wall clock). */
function assertPeriods(week: Week, date: string, periods: number[], now: Date): void {
  const today = jerusalemDateString(now);
  const time = jerusalemTimeString(now);
  for (const period of periods) {
    const times = periodOf(week, date, period);
    if (!times) throw new RoomsError("not_in_week");
    if (date === today && time >= times.end) throw new RoomsError("period_over");
  }
}

/** A weekly slot occupies the period unless it was released for this date. */
async function assertNoWeeklySlot(tx: Tx, input: BookingInput, yearId: string): Promise<void> {
  const slots = await tx
    .select({ id: roomWeeklySlots.id, released: roomSlotReleases.date })
    .from(roomWeeklySlots)
    .leftJoin(
      roomSlotReleases,
      and(eq(roomSlotReleases.slotId, roomWeeklySlots.id), eq(roomSlotReleases.date, input.date)),
    )
    .where(
      and(
        eq(roomWeeklySlots.roomId, input.roomId),
        eq(roomWeeklySlots.academicYearId, yearId),
        eq(roomWeeklySlots.day, dayOfDate(input.date)),
        inArray(roomWeeklySlots.period, input.periods),
      ),
    );
  if (slots.some((slot) => slot.released === null)) throw new RoomsError("slot_taken");
}

async function assertNotBooked(tx: Tx, input: BookingInput): Promise<void> {
  const [taken] = await tx
    .select({ id: roomBookings.id })
    .from(roomBookings)
    .where(
      and(
        eq(roomBookings.roomId, input.roomId),
        eq(roomBookings.date, input.date),
        inArray(roomBookings.period, input.periods),
        isNull(roomBookings.canceledAt),
      ),
    )
    .limit(1);
  if (taken) throw new RoomsError("slot_taken");
}

/** Books consecutive periods of one room on one date, all or nothing. Null when the room is unknown. */
export async function bookRoom(user: SchoolUser, input: BookingInput): Promise<{ groupId: string } | null> {
  const now = new Date();
  const yearId = await getActiveAcademicYearId(user.schoolId);
  if (!yearId) throw new RoomsError("no_active_year");
  try {
    return await withSchool(user.schoolId, async (tx) => {
      if (!(await lockRoom(tx, input.roomId))) return null;
      const year = await yearRange(tx, yearId);
      if (input.date < jerusalemDateString(now) || input.date < year.start || input.date > year.end) {
        throw new RoomsError("out_of_range");
      }
      const week = await readWeek(tx, user.schoolId, true);
      if (!week) throw new RoomsError("no_week");
      assertPeriods(week, input.date, input.periods, now);
      await assertNoWeeklySlot(tx, input, yearId);
      await assertNotBooked(tx, input);
      const groupId = randomUUID();
      const note = input.note?.trim() || null;
      await tx.insert(roomBookings).values(
        input.periods.map((period) => ({
          schoolId: user.schoolId, roomId: input.roomId, groupId, date: input.date, period, staffUserId: user.id, note,
        })),
      );
      return { groupId };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new RoomsError("slot_taken");
    throw e;
  }
}

/** Cancels a booking group. Only its owner, or a room manager, may; false when unknown or already canceled. */
export function cancelBooking(user: SchoolUser, groupId: string, canManage: boolean): Promise<boolean> {
  return withSchool(user.schoolId, async (tx) => {
    const rows = await tx
      .select({ staffUserId: roomBookings.staffUserId, roomId: roomBookings.roomId })
      .from(roomBookings)
      .where(and(eq(roomBookings.groupId, groupId), isNull(roomBookings.canceledAt)));
    if (rows.length === 0) return false;
    if (!canManage && rows.some((row) => row.staffUserId !== user.id)) throw new RoomsError("not_yours");
    await tx
      .update(roomBookings)
      .set({ canceledAt: new Date(), canceledBy: user.id })
      .where(and(eq(roomBookings.groupId, groupId), isNull(roomBookings.canceledAt)));
    return true;
  });
}

/** The caller's active booking groups from `fromDate` on, by date then first period. */
export async function listMyBookings(user: SchoolUser, fromDate: string): Promise<MyBooking[]> {
  const rows = await withSchool(user.schoolId, (tx) =>
    tx
      .select({
        groupId: roomBookings.groupId,
        roomId: roomBookings.roomId,
        roomName: rooms.name,
        date: roomBookings.date,
        period: roomBookings.period,
        note: roomBookings.note,
      })
      .from(roomBookings)
      .innerJoin(rooms, eq(rooms.id, roomBookings.roomId))
      .where(
        and(eq(roomBookings.staffUserId, user.id), gte(roomBookings.date, fromDate), isNull(roomBookings.canceledAt)),
      )
      .orderBy(asc(roomBookings.date), asc(roomBookings.period)),
  );
  const groups = new Map<string, MyBooking>();
  for (const { period, ...row } of rows) {
    const group = groups.get(row.groupId);
    if (group) group.periods.push(period);
    else groups.set(row.groupId, { ...row, periods: [period] });
  }
  return [...groups.values()];
}
