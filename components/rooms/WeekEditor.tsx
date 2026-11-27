"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { MAX_PERIODS_PER_DAY, hhmm, minutesOf, type Week, type WeekPeriod } from "@/lib/rooms/week-schema";
import { roomsFetch } from "./rooms-api";
import { useDayName } from "./day-names";

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const NEW_PERIOD_MINUTES = 45;
const BREAK_MINUTES = 5;
const TIME = "w-24 rounded-md border border-neutral-300 px-1.5 py-1 text-sm";

type Draft = Record<number, WeekPeriod[]>;

const toDraft = (week: Week): Draft => Object.fromEntries(week.days.map((d) => [d.day, d.periods]));

function toWeek(draft: Draft): Week {
  return {
    days: DAYS.filter((day) => draft[day]?.length).map((day) => ({
      day,
      periods: draft[day].map((p, index) => ({ ...p, period: index + 1 })),
    })),
  };
}

function nextPeriod(periods: WeekPeriod[]): WeekPeriod {
  const last = periods.at(-1);
  const start = last ? minutesOf(last.end) + BREAK_MINUTES : 8 * 60;
  return { period: periods.length + 1, start: hhmm(start), end: hhmm(Math.min(start + NEW_PERIOD_MINUTES, 23 * 60 + 59)) };
}

/** The school's days and period times. `initial` is the saved week, or a suggested default. */
export function WeekEditor({ initial }: { initial: Week }) {
  const t = useTranslations("rooms");
  const locale = useLocale();
  const dayName = useDayName(locale);
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);

  const setDay = (day: number, periods: WeekPeriod[]) => setDraft((d) => ({ ...d, [day]: periods }));
  const setTime = (day: number, index: number, field: "start" | "end", value: string) =>
    setDay(day, draft[day].map((p, i) => (i === index ? { ...p, [field]: value } : p)));

  async function save(event: FormEvent) {
    event.preventDefault();
    const week = toWeek(draft);
    if (week.days.some((d) => d.periods.some((p) => !p.start || !p.end || p.start >= p.end))) {
      return setStatus({ error: true, text: t("manage.weekInvalid") });
    }
    setBusy(true);
    const result = await roomsFetch("/api/v1/rooms/week", "PUT", { week });
    setBusy(false);
    if (!result.ok) return setStatus({ error: true, text: t(`errors.${result.error}`) });
    setStatus({ error: false, text: t("manage.saved") });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DAYS.map((day) => {
          const periods = draft[day] ?? [];
          const name = dayName(day);
          return (
            <fieldset key={day} className="rounded-xl border border-neutral-200 bg-white p-3">
              <legend className="sr-only">{name}</legend>
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={periods.length > 0}
                  onChange={(e) => setDay(day, e.target.checked ? [nextPeriod([])] : [])}
                  className="size-4 accent-violet-700"
                />
                {name} · {t("manage.schoolDay")}
              </label>
              <ol className="mt-2 space-y-1.5">
                {periods.map((p, index) => (
                  <li key={index} className="flex items-center gap-1.5 text-sm">
                    <span className="w-14 text-neutral-600">{t("period", { number: index + 1 })}</span>
                    <input type="time" value={p.start} required aria-label={`${t("manage.periodTimes", { number: index + 1, day: name })} · ${t("manage.start")}`} onChange={(e) => setTime(day, index, "start", e.target.value)} className={TIME} />
                    <span aria-hidden="true">–</span>
                    <input type="time" value={p.end} required aria-label={`${t("manage.periodTimes", { number: index + 1, day: name })} · ${t("manage.end")}`} onChange={(e) => setTime(day, index, "end", e.target.value)} className={TIME} />
                    {/* Only the last period can go: removing a middle one would renumber the rest under their weekly use and bookings. */}
                    {index === periods.length - 1 ? (
                      <button type="button" aria-label={t("manage.removePeriod", { number: index + 1, day: name })} onClick={() => setDay(day, periods.slice(0, -1))} className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-700">
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    ) : (
                      <span aria-hidden="true" className="w-6" />
                    )}
                  </li>
                ))}
              </ol>
              {periods.length > 0 && periods.length < MAX_PERIODS_PER_DAY && (
                <button type="button" onClick={() => setDay(day, [...periods, nextPeriod(periods)])} className="mt-2 flex items-center gap-1 text-sm text-violet-700 hover:underline">
                  <Plus aria-hidden="true" className="size-4" />
                  {t("manage.addPeriod")}
                </button>
              )}
            </fieldset>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
          {t("manage.saveWeek")}
        </button>
        <p role={status?.error ? "alert" : "status"} className={status?.error ? "text-sm text-red-700" : "text-sm text-emerald-800"}>
          {status?.text}
        </p>
      </div>
    </form>
  );
}
