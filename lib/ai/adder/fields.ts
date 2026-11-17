/** Pure field helpers shared by normalize.ts and complete.ts. */
import { SCHOOL_GRADES } from "@/lib/grades";

export const ALL_GRADES: number[] = [...SCHOOL_GRADES];

/** "YYYY-MM-DD" when d/m/y is a real calendar date, else null. Never swaps day and month. */
export function toIsoDate(day: number, month: number, year: number): string | null {
  const full = year < 100 ? 2000 + year : year;
  const date = new Date(Date.UTC(full, month - 1, day));
  if (date.getUTCFullYear() !== full || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** Day/month that exist in at least one year (29/2 counts; 31/4 does not). */
export function isPlausibleDayMonth(day: number, month: number): boolean {
  return toIsoDate(day, month, 2028) !== null;
}

/** "HH:MM" from "H:MM"/"HH:MM", or null when it isn't a clock time. */
export function normalizeTime(raw: string | null): string | null {
  const match = raw?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${match[2]}`;
}

/** Valid school grades, deduplicated and sorted. */
export function cleanGrades(grades: number[]): number[] {
  return [...new Set(grades.filter((g) => ALL_GRADES.includes(g)))].sort((a, b) => a - b);
}

/** True when the time fields describe a usable range for the given dates. */
export function hasValidTimes(
  allDay: boolean | null,
  startTime: string | null,
  endTime: string | null,
  multiDay: boolean,
): boolean {
  if (allDay === true) return true;
  if (!startTime || !endTime) return false;
  return multiDay || endTime > startTime;
}
