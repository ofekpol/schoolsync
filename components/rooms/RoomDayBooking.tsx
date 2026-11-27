"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Cell } from "@/lib/rooms/day";
import type { WeekPeriod } from "@/lib/rooms/week-schema";
import { cn } from "@/lib/utils";
import { roomsFetch } from "./rooms-api";

interface Props {
  roomId: string;
  date: string;
  periods: WeekPeriod[];
  cells: Cell[];
  initialPeriod?: number;
  canManage: boolean;
  readOnly: boolean;
}

type Status = { kind: "ok" | "error"; text: string } | null;

const isConsecutive = (sorted: number[]) => sorted.every((p, i) => i === 0 || p === sorted[i - 1] + 1);

/** One room's periods on one date: tick free periods in a row and book them; cancel bookings you may cancel. */
export function RoomDayBooking({ roomId, date, periods, cells, initialPeriod, canManage, readOnly }: Props) {
  const t = useTranslations("rooms");
  const router = useRouter();
  const freeAtStart = cells.some((c) => c.period === initialPeriod && c.state === "free");
  const [picked, setPicked] = useState<number[]>(freeAtStart && initialPeriod ? [initialPeriod] : []);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function send(url: string, method: string, body: unknown, okText: string): Promise<void> {
    setBusy(true);
    setStatus(null);
    const result = await roomsFetch(url, method, body);
    setBusy(false);
    if (!result.ok) return setStatus({ kind: "error", text: t(`errors.${result.error}`) });
    setPicked([]);
    setNote("");
    setStatus({ kind: "ok", text: okText });
    router.refresh();
  }

  function book(event: FormEvent) {
    event.preventDefault();
    const sorted = [...picked].sort((a, b) => a - b);
    if (!isConsecutive(sorted)) return setStatus({ kind: "error", text: t("notConsecutive") });
    void send("/api/v1/rooms/bookings", "POST", { roomId, date, periods: sorted, note }, t("bookedOk"));
  }

  const cancel = (groupId: string) =>
    void send(`/api/v1/rooms/bookings/${groupId}`, "DELETE", undefined, t("canceledOk"));
  const toggle = (period: number) =>
    setPicked((current) => (current.includes(period) ? current.filter((p) => p !== period) : [...current, period]));

  return (
    <form onSubmit={book} className="space-y-4">
      <fieldset className="space-y-2" disabled={busy}>
        <legend className="mb-1 text-sm font-medium">{t("pickPeriods")}</legend>
        {periods.map((p) => (
          <PeriodRow
            key={p.period}
            period={p}
            cell={cells.find((c) => c.period === p.period)!}
            checked={picked.includes(p.period)}
            onToggle={() => toggle(p.period)}
            onCancel={cancel}
            canManage={canManage}
            readOnly={readOnly}
          />
        ))}
      </fieldset>
      {!readOnly && (
        <>
          <label className="block text-sm">
            {t("note")}
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5" />
          </label>
          <button type="submit" disabled={busy || picked.length === 0} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
            {busy ? t("booking") : t("book")}
          </button>
        </>
      )}
      <p role={status?.kind === "error" ? "alert" : "status"} className={cn("text-sm", status?.kind === "error" ? "text-red-700" : "text-emerald-800")}>
        {status?.text}
      </p>
    </form>
  );
}

function PeriodRow({ period, cell, checked, onToggle, onCancel, canManage, readOnly }: {
  period: WeekPeriod;
  cell: Cell;
  checked: boolean;
  onToggle: () => void;
  onCancel: (groupId: string) => void;
  canManage: boolean;
  readOnly: boolean;
}) {
  const t = useTranslations("rooms");
  const heading = (
    <span className="w-24 shrink-0">
      <span className="block font-medium">{t("period", { number: period.period })}</span>
      <span className="text-xs text-neutral-500"><bdi dir="ltr">{period.start}–{period.end}</bdi></span>
    </span>
  );
  const row = "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm";
  if (cell.state === "free") {
    return (
      <label className={cn(row, "cursor-pointer border-emerald-200 bg-emerald-50 has-[:checked]:border-violet-600 has-[:checked]:bg-violet-50")}>
        {!readOnly && <input type="checkbox" checked={checked} onChange={onToggle} className="size-4 accent-violet-700" />}
        {heading}
        <span className="text-emerald-900">{t("free")}</span>
      </label>
    );
  }
  if (cell.state === "weekly") {
    return (
      <div className={cn(row, "border-neutral-200 bg-neutral-100")}>
        {heading}
        <span><span className="me-1 rounded bg-neutral-700 px-1 text-[10px] font-semibold text-white">{t("weekly")}</span>{cell.label}{cell.staffName && ` · ${cell.staffName}`}</span>
      </div>
    );
  }
  const mayCancel = !readOnly && (cell.mine || canManage);
  return (
    <div className={cn(row, cell.mine ? "border-violet-300 bg-violet-100" : "border-amber-200 bg-amber-50")}>
      {heading}
      <span className="grow">
        <span className="sr-only">{t("booked")}: </span>
        {cell.staffName}
        {cell.note && <span className="block text-xs text-neutral-600">{cell.note}</span>}
      </span>
      {mayCancel && (
        <button type="button" onClick={() => onCancel(cell.groupId)} className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
          {cell.mine ? t("cancelMine") : t("cancelBooking", { name: cell.staffName })}
        </button>
      )}
    </div>
  );
}
