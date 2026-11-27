import { describe, expect, it } from "vitest";
import { buildDay, type DayInput } from "@/lib/rooms/day";

const ME = "me";
const p = (period: number, start: string, end: string) => ({ period, start, end });

function input(overrides: Partial<DayInput> = {}): DayInput {
  return {
    date: "2026-12-01",
    week: { days: [{ day: 2, periods: [p(1, "08:00", "08:45"), p(2, "08:50", "09:35"), p(3, "09:40", "10:25"), p(4, "10:30", "11:15")] }] },
    rooms: [
      { id: "lab", name: "מעבדה 1", sortOrder: 2 },
      { id: "gym", name: "אולם", sortOrder: 1 },
      { id: "art", name: "אמנות", sortOrder: 2 },
    ],
    slots: [],
    releasedSlotIds: [],
    bookings: [],
    ...overrides,
  };
}

const states = (day: ReturnType<typeof buildDay>, roomId: string) =>
  day.rooms.find((r) => r.id === roomId)!.cells.map((c) => c.state);

describe("buildDay", () => {
  it("orders rooms by sort order, then name", () => {
    expect(buildDay(input(), {}, ME).rooms.map((r) => r.id)).toEqual(["gym", "art", "lab"]);
  });

  it("shows weekly slots, released slots as free, and bookings", () => {
    const day = buildDay(
      input({
        slots: [
          { id: "s1", roomId: "lab", period: 1, label: "ז1", staffName: "דנה" },
          { id: "s2", roomId: "lab", period: 2, label: "ח2", staffName: null },
        ],
        releasedSlotIds: ["s2"],
        bookings: [{ roomId: "lab", groupId: "g1", period: 3, staffUserId: ME, staffName: "אני", note: "מבחן", canceled: false }],
      }),
      {},
      ME,
    );
    const lab = day.rooms.find((r) => r.id === "lab")!;
    expect(lab.cells).toEqual([
      { period: 1, state: "weekly", slotId: "s1", label: "ז1", staffName: "דנה" },
      { period: 2, state: "free" },
      { period: 3, state: "booked", groupId: "g1", staffName: "אני", note: "מבחן", mine: true },
      { period: 4, state: "free" },
    ]);
    expect(day.periods.map((x) => x.period)).toEqual([1, 2, 3, 4]);
  });

  it("treats a canceled booking as free", () => {
    const day = buildDay(
      input({ bookings: [{ roomId: "gym", groupId: "g", period: 1, staffUserId: "x", staffName: "x", note: null, canceled: true }] }),
      {},
      ME,
    );
    expect(states(day, "gym")[0]).toBe("free");
  });

  it("freeOnly with periods keeps rooms free in every one of them", () => {
    const day = buildDay(
      input({
        bookings: [{ roomId: "gym", groupId: "g", period: 4, staffUserId: "x", staffName: "x", note: null, canceled: false }],
        slots: [{ id: "s", roomId: "art", period: 3, label: "ט", staffName: null }],
      }),
      { periods: [3, 4], freeOnly: true },
      ME,
    );
    expect(day.rooms.map((r) => r.id)).toEqual(["lab"]);
    expect(day.periods.map((x) => x.period)).toEqual([3, 4]);
  });

  it("matches q as a case-insensitive substring", () => {
    expect(buildDay(input(), { q: "מעב" }, ME).rooms.map((r) => r.id)).toEqual(["lab"]);
    expect(buildDay(input({ rooms: [{ id: "x", name: "Lab A", sortOrder: 0 }] }), { q: "lab" }, ME).rooms).toHaveLength(1);
  });

  it("mine keeps rooms where the caller holds a booking that day", () => {
    const day = buildDay(
      input({ bookings: [{ roomId: "art", groupId: "g", period: 2, staffUserId: ME, staffName: "אני", note: null, canceled: false }] }),
      { mine: true },
      ME,
    );
    expect(day.rooms.map((r) => r.id)).toEqual(["art"]);
  });

  it("has no periods on a day the school does not meet", () => {
    const day = buildDay(input({ date: "2026-12-05" }), {}, ME);
    expect(day.periods).toEqual([]);
    expect(day.rooms.every((r) => r.cells.length === 0)).toBe(true);
  });
});
