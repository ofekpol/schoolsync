import { z } from "zod";
import { TIME_OF_DAY_RE } from "@/lib/datetime";

/** A school's week for rooms. Day 0 = Sunday; periods are numbered 1..n per day. Client-safe. */
export interface WeekPeriod {
  period: number;
  start: string; // "HH:MM"
  end: string;
}
export interface WeekDay {
  day: number;
  periods: WeekPeriod[];
}
export interface Week {
  days: WeekDay[];
}

export const MAX_PERIODS_PER_DAY = 12;
const time = z.string().regex(TIME_OF_DAY_RE);

const WeekPeriodSchema = z
  .object({ period: z.number().int().min(1), start: time, end: time })
  .refine((p) => p.start < p.end, { message: "end_before_start" });

const WeekDaySchema = z
  .object({
    day: z.number().int().min(0).max(6),
    periods: z.array(WeekPeriodSchema).min(1).max(MAX_PERIODS_PER_DAY),
  })
  .refine((d) => d.periods.every((p, index) => p.period === index + 1), {
    message: "periods_not_numbered",
  });

export const WeekSchema: z.ZodType<Week> = z.object({
  days: z
    .array(WeekDaySchema)
    .min(1)
    .max(7)
    .refine((days) => new Set(days.map((d) => d.day)).size === days.length, {
      message: "repeated_day",
    }),
});


/** Weekday (0 = Sunday) of a `YYYY-MM-DD` calendar date; no timezone shift. */
export function dayOfDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Start and end of `period` on `date`, or null when the school has no such period that day. */
export function periodOf(week: Week, date: string, period: number): { start: string; end: string } | null {
  const day = week.days.find((d) => d.day === dayOfDate(date));
  const found = day?.periods.find((p) => p.period === period);
  return found ? { start: found.start, end: found.end } : null;
}
