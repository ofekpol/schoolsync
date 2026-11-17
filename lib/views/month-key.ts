/** "YYYY-MM" key for a calendar month; `monthIndex` is 1-based. */
export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex).padStart(2, "0")}`;
}

/** Index of the month whose key is `key`, or 0 when absent or not found. */
export function monthIndexForKey(
  months: ReadonlyArray<{ year: number; monthIndex: number }>,
  key: string | null,
): number {
  if (!key) return 0;
  const index = months.findIndex((month) => monthKey(month.year, month.monthIndex) === key);
  return index >= 0 ? index : 0;
}
