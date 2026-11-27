import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { addCalendarDays } from "@/lib/datetime";
import type { WeekPeriod } from "@/lib/rooms/week-schema";

export interface RoomsFilters {
  date: string;
  periods: number[];
  freeOnly: boolean;
  mine: boolean;
  q: string;
}

/** `/rooms` URL for these filters on another date. */
export function roomsHref(filters: RoomsFilters, date = filters.date): Route {
  const params = new URLSearchParams({ date });
  if (filters.periods.length) params.set("periods", filters.periods.join(","));
  if (filters.freeOnly) params.set("free", "1");
  if (filters.mine) params.set("mine", "1");
  if (filters.q) params.set("q", filters.q);
  return `/rooms?${params}` as Route;
}

const CHIP = "flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm has-[:checked]:border-violet-600 has-[:checked]:bg-violet-50";

/** A plain GET form: filters live in the URL and work without JavaScript. */
export async function RoomsFilterBar({ filters, dayPeriods }: { filters: RoomsFilters; dayPeriods: WeekPeriod[] }) {
  const t = await getTranslations("rooms");
  return (
    <form method="get" action="/rooms" className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <Link href={roomsHref(filters, addCalendarDays(filters.date, -1))} aria-label={t("prevDay")} className="rounded-md p-2 hover:bg-neutral-100">
            <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-0 ltr:rotate-180" />
          </Link>
          <label className="flex flex-col text-xs text-neutral-600">
            {t("date")}
            <input type="date" name="date" defaultValue={filters.date} required className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900" />
          </label>
          <Link href={roomsHref(filters, addCalendarDays(filters.date, 1))} aria-label={t("nextDay")} className="rounded-md p-2 hover:bg-neutral-100">
            <ChevronLeft aria-hidden="true" className="size-4 rtl:rotate-0 ltr:rotate-180" />
          </Link>
        </div>
        <label className="flex grow flex-col text-xs text-neutral-600">
          {t("search")}
          <input type="search" name="q" defaultValue={filters.q} maxLength={60} className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900" />
        </label>
      </div>
      {dayPeriods.length > 0 && (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-xs text-neutral-600">{t("periodsLabel")}</legend>
          {dayPeriods.map((p) => (
            <label key={p.period} className={CHIP}>
              <input type="checkbox" name="periods" value={p.period} defaultChecked={filters.periods.includes(p.period)} className="accent-violet-600" />
              {t("period", { number: p.period })}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className={CHIP}>
          <input type="checkbox" name="free" value="1" defaultChecked={filters.freeOnly} className="accent-violet-600" />
          {t("freeOnly")}
        </label>
        <label className={CHIP}>
          <input type="checkbox" name="mine" value="1" defaultChecked={filters.mine} className="accent-violet-600" />
          {t("mineOnly")}
        </label>
        <button type="submit" className="ms-auto rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">
          {t("apply")}
        </button>
        <Link href={`/rooms?date=${filters.date}` as Route} className="rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
          {t("clear")}
        </Link>
      </div>
    </form>
  );
}
