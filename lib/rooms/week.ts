import "server-only";
import { and, eq, gte, isNull } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { getActiveAcademicYearId } from "@/lib/db/schools";
import { roomBookings, roomWeeklySlots, roomsWeek } from "@/lib/db/schema-rooms";
import { jerusalemDateString } from "@/lib/datetime";
import { RoomsError } from "./errors";
import { dayOfDate, type Week } from "./week-schema";

export { WeekSchema, dayOfDate, periodOf, type Week } from "./week-schema";

export type Tx = Parameters<Parameters<typeof withSchool>[1]>[0];

export async function getWeek(schoolId: string): Promise<Week | null> {
  return withSchool(schoolId, (tx) => readWeek(tx, schoolId));
}

/**
 * The school's week inside an open transaction. `lock` takes a share lock so a concurrent
 * `saveWeek` cannot drop a period while a slot or booking is being written against it.
 */
export async function readWeek(tx: Tx, schoolId: string, lock = false): Promise<Week | null> {
  const query = tx.select({ week: roomsWeek.week }).from(roomsWeek).where(eq(roomsWeek.schoolId, schoolId));
  const [row] = lock ? await query.for("share") : await query;
  return row?.week ?? null;
}

/** Replaces the week; refuses (`period_in_use`) to drop a period a weekly slot or a future booking uses. */
export async function saveWeek(schoolId: string, week: Week): Promise<void> {
  const yearId = await getActiveAcademicYearId(schoolId);
  const today = jerusalemDateString(new Date());
  await withSchool(schoolId, async (tx) => {
    await tx.select({ id: roomsWeek.schoolId }).from(roomsWeek).where(eq(roomsWeek.schoolId, schoolId)).for("update");
    const used = await usedCells(tx, yearId, today);
    const has = (day: number, period: number) =>
      week.days.some((d) => d.day === day && d.periods.some((p) => p.period === period));
    if (used.some((cell) => !has(cell.day, cell.period))) throw new RoomsError("period_in_use");
    await tx
      .insert(roomsWeek)
      .values({ schoolId, week })
      .onConflictDoUpdate({ target: roomsWeek.schoolId, set: { week, updatedAt: new Date() } });
  });
}

async function usedCells(tx: Tx, yearId: string | null, today: string): Promise<{ day: number; period: number }[]> {
  const slots = yearId
    ? await tx
        .selectDistinct({ day: roomWeeklySlots.day, period: roomWeeklySlots.period })
        .from(roomWeeklySlots)
        .where(eq(roomWeeklySlots.academicYearId, yearId))
    : [];
  const bookings = await tx
    .selectDistinct({ date: roomBookings.date, period: roomBookings.period })
    .from(roomBookings)
    .where(and(gte(roomBookings.date, today), isNull(roomBookings.canceledAt)));
  return [...slots, ...bookings.map((b) => ({ day: dayOfDate(b.date), period: b.period }))];
}
