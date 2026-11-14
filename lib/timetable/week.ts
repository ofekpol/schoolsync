import { z } from "zod";

/** A board's teaching week. Day 0 = Sunday; periods are numbered 1..n per day. */
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

const MAX_PERIODS_PER_DAY = 12;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

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

const FIRST_PERIOD_START_MINUTES = 8 * 60;
const PERIOD_MINUTES = 45;

function hhmm(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function dayOf(day: number, count: number): WeekDay {
  const periods = Array.from({ length: count }, (_, index) => {
    const start = FIRST_PERIOD_START_MINUTES + index * PERIOD_MINUTES;
    return { period: index + 1, start: hhmm(start), end: hhmm(start + PERIOD_MINUTES) };
  });
  return { day, periods };
}

/** Sunday to Thursday 8 periods, Friday 5; from 08:00, 45 minutes each, back to back. */
export const DEFAULT_WEEK: Week = {
  days: [...[0, 1, 2, 3, 4].map((day) => dayOf(day, 8)), dayOf(5, 5)],
};

/** Teaching slots in the week (DEFAULT_WEEK -> 45). */
export function slotCount(week: Week): number {
  return week.days.reduce((sum, day) => sum + day.periods.length, 0);
}
