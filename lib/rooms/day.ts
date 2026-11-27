import { dayOfDate, type Week, type WeekPeriod } from "./week-schema";

/** One room in one period of the day. Client-safe (shared by the API and the pages). */
export type Cell =
  | { period: number; state: "free" }
  | { period: number; state: "weekly"; slotId: string; label: string; staffName: string | null }
  | { period: number; state: "booked"; groupId: string; staffName: string; note: string | null; mine: boolean };

export interface DayView {
  date: string;
  periods: WeekPeriod[];
  rooms: { id: string; name: string; cells: Cell[] }[];
}

export interface DayFilter {
  periods?: number[];
  freeOnly?: boolean;
  q?: string;
  mine?: boolean;
}

/** Everything one date needs; `slots` are the active year's slots on the date's weekday. */
export interface DayInput {
  date: string;
  week: Week | null;
  rooms: { id: string; name: string; sortOrder: number }[];
  slots: { id: string; roomId: string; period: number; label: string; staffName: string | null }[];
  releasedSlotIds: string[];
  bookings: {
    roomId: string;
    groupId: string;
    period: number;
    staffUserId: string;
    staffName: string;
    note: string | null;
    canceled: boolean;
  }[];
}

function cellFor(input: DayInput, roomId: string, period: number, me: string): Cell {
  const slot = input.slots.find((s) => s.roomId === roomId && s.period === period);
  if (slot && !input.releasedSlotIds.includes(slot.id)) {
    return { period, state: "weekly", slotId: slot.id, label: slot.label, staffName: slot.staffName };
  }
  const booking = input.bookings.find((b) => !b.canceled && b.roomId === roomId && b.period === period);
  if (booking) {
    const { groupId, staffName, note } = booking;
    return { period, state: "booked", groupId, staffName, note, mine: booking.staffUserId === me };
  }
  return { period, state: "free" };
}

/**
 * The day grid: every active room × the school's periods that date, narrowed by the filter.
 * `freeOnly` keeps rooms free in every shown period (with no periods chosen: free in at least one).
 */
export function buildDay(input: DayInput, filter: DayFilter, me: string): DayView {
  const allPeriods = input.week?.days.find((d) => d.day === dayOfDate(input.date))?.periods ?? [];
  const periods = filter.periods?.length ? allPeriods.filter((p) => filter.periods!.includes(p.period)) : allPeriods;
  const q = filter.q?.trim().toLocaleLowerCase();
  const rooms = [...input.rooms]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he"))
    .filter((room) => !q || room.name.toLocaleLowerCase().includes(q))
    .map((room) => ({ id: room.id, name: room.name, cells: periods.map((p) => cellFor(input, room.id, p.period, me)) }))
    .filter((room) => !filter.mine || room.cells.some((c) => c.state === "booked" && c.mine))
    .filter((room) => {
      if (!filter.freeOnly) return true;
      const free = room.cells.filter((c) => c.state === "free").length;
      return filter.periods?.length ? free === room.cells.length && free > 0 : free > 0;
    });
  return { date: input.date, periods, rooms };
}
