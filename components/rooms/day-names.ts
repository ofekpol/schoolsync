import { useMemo } from "react";

/** 2026-11-29 is a Sunday: UTC midnight of that date + `day` names weekday `day` (0 = Sunday). */
const SUNDAY_UTC = Date.UTC(2026, 10, 29);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Full weekday name for day 0–6 in `locale` ("יום ראשון", "Sunday"). */
export function useDayName(locale: string): (day: number) => string {
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
    return (day: number) => format.format(new Date(SUNDAY_UTC + day * DAY_MS));
  }, [locale]);
}
