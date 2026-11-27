import { describe, expect, it } from "vitest";
import { WeekSchema, dayOfDate, periodOf, type Week } from "@/lib/rooms/week-schema";

const p = (period: number, start: string, end: string) => ({ period, start, end });
const week: Week = {
  days: [
    { day: 0, periods: [p(1, "08:00", "08:45"), p(2, "08:50", "09:35")] },
    { day: 2, periods: [p(1, "08:00", "08:45"), p(2, "08:50", "09:35"), p(3, "09:40", "10:25")] },
  ],
};

describe("WeekSchema", () => {
  it("accepts a valid week", () => {
    expect(WeekSchema.safeParse(week).success).toBe(true);
  });
  it("rejects period numbers that are not 1..n", () => {
    expect(WeekSchema.safeParse({ days: [{ day: 0, periods: [p(2, "08:00", "08:45")] }] }).success).toBe(false);
  });
  it("rejects an end that is not after the start", () => {
    expect(WeekSchema.safeParse({ days: [{ day: 0, periods: [p(1, "08:45", "08:45")] }] }).success).toBe(false);
  });
  it("rejects a repeated day", () => {
    const day = { day: 1, periods: [p(1, "08:00", "08:45")] };
    expect(WeekSchema.safeParse({ days: [day, day] }).success).toBe(false);
  });
  it("rejects 13 periods", () => {
    const periods = Array.from({ length: 13 }, (_, i) => p(i + 1, "08:00", "08:45"));
    expect(WeekSchema.safeParse({ days: [{ day: 0, periods }] }).success).toBe(false);
  });
});

describe("periodOf", () => {
  it("uses the weekday of the date string itself (2026-12-01 is a Tuesday)", () => {
    expect(dayOfDate("2026-12-01")).toBe(2);
    expect(periodOf(week, "2026-12-01", 3)).toEqual({ start: "09:40", end: "10:25" });
  });
  it("returns null for a period or day not in the week", () => {
    expect(periodOf(week, "2026-11-29", 3)).toBeNull();
    expect(periodOf(week, "2026-12-05", 1)).toBeNull();
  });
});
