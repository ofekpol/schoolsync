import { describe, expect, it } from "vitest";
import { DEFAULT_WEEK, WeekSchema, slotCount } from "@/lib/timetable/week";

describe("week", () => {
  it("default week is Sunday-Thursday 8 periods and Friday 5", () => {
    expect(DEFAULT_WEEK.days.map((d) => [d.day, d.periods.length])).toEqual(
      [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 5]]);
    expect(slotCount(DEFAULT_WEEK)).toBe(45);
    expect(DEFAULT_WEEK.days[0].periods[0]).toEqual({ period: 1, start: "08:00", end: "08:45" });
    expect(WeekSchema.safeParse(DEFAULT_WEEK).success).toBe(true);
  });
  it("rejects a repeated day, a gap in period numbers and end before start", () => {
    const p = { period: 1, start: "08:00", end: "08:45" };
    expect(WeekSchema.safeParse({ days: [{ day: 0, periods: [p] }, { day: 0, periods: [p] }] }).success).toBe(false);
    expect(WeekSchema.safeParse({ days: [{ day: 0, periods: [{ ...p, period: 2 }] }] }).success).toBe(false);
    expect(WeekSchema.safeParse({ days: [{ day: 0, periods: [{ ...p, end: "07:00" }] }] }).success).toBe(false);
  });
});
