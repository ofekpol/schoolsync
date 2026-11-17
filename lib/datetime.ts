/**
 * Asia/Jerusalem wall-clock helpers.
 *
 * Israel switches between +02:00 (IST) and +03:00 (IDT), so a local date/time
 * must be converted with the offset that applies on that day — a fixed
 * +02:00 shifts every summer-time value by an hour (and all-day events off
 * local midnight).
 */

/** "HH:MM" on a 24-hour clock, 00:00–23:59. */
export const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const SCHOOL_TIMEZONE = "Asia/Jerusalem";

const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHOOL_TIMEZONE,
  timeZoneName: "longOffset",
});

/** Jerusalem UTC offset at `instant`, e.g. "+03:00". */
export function jerusalemOffset(instant: Date): string {
  const name = offsetFormatter
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return match ? match[1] : "+00:00";
}

/**
 * ISO-8601 string for a Jerusalem wall-clock date ("YYYY-MM-DD") and time
 * ("HH:MM" or "HH:MM:SS"), carrying the offset in effect at that moment.
 */
export function jerusalemWallClockToIso(date: string, time: string): string {
  const hms = time.length === 5 ? `${time}:00` : time;
  const naive = `${date}T${hms}`;
  // Two passes: the offset at "naive as UTC" can sit on the other side of a
  // DST switch; re-reading at the corrected instant settles it.
  let offset = jerusalemOffset(new Date(`${naive}Z`));
  offset = jerusalemOffset(new Date(`${naive}${offset}`));
  return `${naive}${offset}`;
}

/** "YYYY-MM-DD" plus `days` calendar days (pure date arithmetic, no timezone). */
export function addCalendarDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * `instant` shifted so its UTC fields read as Jerusalem wall-clock time.
 * Use it to place instants on an axis whose days start at UTC midnight
 * (e.g. Date.UTC(y, m, d)): local midnight then lands exactly on a day
 * boundary instead of 2–3 hours into the previous day.
 */
export function jerusalemWallClockMs(instant: Date): number {
  const [, sign, hh, mm] = jerusalemOffset(instant).match(/([+-])(\d{2}):(\d{2})/) ?? [];
  const offsetMin = (Number(hh) * 60 + Number(mm)) * (sign === "-" ? -1 : 1);
  return instant.getTime() + (offsetMin || 0) * 60 * 1000;
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHOOL_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" of `instant` on the Jerusalem calendar. */
export function jerusalemDateString(instant: Date): string {
  return dateFormatter.format(instant);
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: SCHOOL_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "HH:MM" of `instant` on the Jerusalem clock. */
export function jerusalemTimeString(instant: Date): string {
  return timeFormatter.format(instant);
}
