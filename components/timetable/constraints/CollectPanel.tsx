"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { jerusalemDateString, jerusalemTimeString, jerusalemWallClockToIso } from "@/lib/datetime";
import type { CollectState, TeacherResponse } from "@/lib/timetable/constraints/collect";
import * as api from "./api";
import { FillInDialog } from "./FillInDialog";

interface Props {
  boardId: string;
  state: CollectState;
  responses: TeacherResponse[];
  teachers: Array<{ id: string; fullName: string; freeDayEntitled: boolean }>;
  /** The board's teaching days. */
  days: number[];
}

type Filter = "all" | "answered" | "missing";

const when = (iso: string) => `${jerusalemDateString(new Date(iso))} ${jerusalemTimeString(new Date(iso))}`;

/** The collection round: its deadline, who answered, and filling in for a teacher. */
export function CollectPanel({ boardId, state, responses, teachers, days }: Props) {
  const t = useTranslations("timetable.collect");
  const tc = useTranslations("timetable.constraints");
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [filling, setFilling] = useState<string | null>(null);
  const teacher = new Map(teachers.map((x) => [x.id, x]));
  const answered = responses.filter((r) => r.answeredAt !== null).length;
  const shown = responses.filter((r) => filter === "all" || (filter === "answered") === (r.answeredAt !== null));
  const target = responses.find((r) => r.teacherId === filling);
  const past = state.teacherDeadline !== null && new Date(state.teacherDeadline).getTime() < Date.now();

  return (
    <div className="space-y-5">
      <DeadlineForm boardId={boardId} state={state} />
      {past && <p role="status" className="rounded-xl bg-neutral-100 px-4 py-3 text-sm">{t("afterDeadline")}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">{t("count", { answered, total: responses.length })}</p>
        <select aria-label={t("filter")} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}
          className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-sm">
          <option value="all">{t("filterAll")}</option>
          <option value="answered">{t("filterAnswered")}</option>
          <option value="missing">{t("filterMissing")}</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t("teacher")}</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t("answered")}</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t("freeDay")}</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">{t("fillIn")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {shown.map((r) => {
              const x = teacher.get(r.teacherId);
              return (
                <tr key={r.teacherId}>
                  <td className="px-3 py-2 font-medium">{x?.fullName}</td>
                  <td className="px-3 py-2 text-neutral-600">
                    {r.answeredAt ? `${when(r.answeredAt)}${r.byManagement ? ` · ${t("byManagement")}` : ""}` : t("notAnswered")}
                  </td>
                  <td className="px-3 py-2">
                    {r.freeDay !== null ? tc(`days.${r.freeDay}`) : x?.freeDayEntitled ? "—" : t("notEntitledShort")}
                  </td>
                  <td className="px-3 py-2 text-end">
                    <Button type="button" size="sm" variant="outline" onClick={() => setFilling(r.teacherId)}
                      aria-label={t("fillInFor", { name: x?.fullName ?? "" })}>
                      {t("fillIn")}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {target && (
        <FillInDialog teacherName={teacher.get(target.teacherId)?.fullName ?? ""} freeDay={target.freeDay} days={days}
          entitled={teacher.get(target.teacherId)?.freeDayEntitled ?? false} onClose={() => setFilling(null)}
          onSave={async (freeDay) => {
            const res = await api.fillIn(boardId, target.teacherId, freeDay);
            if (!res.ok) return res.error;
            router.refresh();
            return null;
          }} />
      )}
    </div>
  );
}

function DeadlineForm({ boardId, state }: { boardId: string; state: CollectState }) {
  const t = useTranslations("timetable.collect");
  const tc = useTranslations("timetable.constraints");
  const router = useRouter();
  const current = state.teacherDeadline ? new Date(state.teacherDeadline) : null;
  const [date, setDate] = useState(current ? jerusalemDateString(current) : "");
  const [time, setTime] = useState(current ? jerusalemTimeString(current) : "16:00");
  const [error, setError] = useState<api.ConstraintErrorKey | null>(null);
  const collecting = state.status === "collecting";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!date || !time) return setError("invalid");
    const iso = jerusalemWallClockToIso(date, time);
    if (new Date(iso).getTime() <= Date.now()) return setError("deadlinePast");
    const res = await api.setDeadline(boardId, iso);
    if (!res.ok) return setError(res.error);
    setError(null);
    router.refresh();
  }

  return (
    <form onSubmit={submit} aria-label={t("deadlineTitle")} className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <p className="w-full text-sm">
        <span className="font-semibold">{t(`status.${state.status}`)}</span>
        {current && <span className="text-neutral-600"> · {t("deadlineIs", { when: when(current.toISOString()) })}</span>}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("deadlineDate")}</span>
        <input type="date" aria-label={t("deadlineDate")} value={date} onChange={(e) => setDate(e.target.value)}
          className="h-9 rounded-lg border border-neutral-300 px-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("deadlineTime")}</span>
        <input type="time" aria-label={t("deadlineTime")} value={time} onChange={(e) => setTime(e.target.value)}
          className="h-9 rounded-lg border border-neutral-300 px-2" />
      </label>
      <Button type="submit">{collecting ? t("update") : t("open")}</Button>
      {error && <p role="alert" className="w-full text-sm text-red-700">{tc(`errors.${error}`)}</p>}
    </form>
  );
}
