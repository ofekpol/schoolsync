"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { z } from "zod";
import type { WeeklySlotSchema } from "@/lib/validations/rooms";
import { roomsFetch } from "./rooms-api";

export type WeeklySlot = z.infer<typeof WeeklySlotSchema>;
export interface StaffOption {
  id: string;
  name: string;
}

interface Props {
  roomId: string;
  day: number;
  period: number;
  title: string;
  slot: WeeklySlot | undefined;
  staff: StaffOption[];
  onChanged: () => void;
  onClose: () => void;
}

const INPUT = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";

/** Set or clear one weekly cell of a room, and free it on single dates. */
export function SlotEditor({ roomId, day, period, title, slot, staff, onChanged, onClose }: Props) {
  const t = useTranslations("rooms");
  const [label, setLabel] = useState(slot?.label ?? "");
  const [staffUserId, setStaffUserId] = useState(slot?.staffUserId ?? "");
  const [releaseDate, setReleaseDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(url: string, method: string, body?: unknown, close = false): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await roomsFetch(url, method, body);
    setBusy(false);
    if (!result.ok) return setError(t(`errors.${result.error}`));
    onChanged();
    if (close) onClose();
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void run(`/api/v1/rooms/${roomId}/slots`, "PUT", { day, period, label, staffUserId: staffUserId || null }, true);
  }

  function release(event: FormEvent) {
    event.preventDefault();
    if (slot) void run(`/api/v1/rooms/slots/${slot.id}/releases`, "POST", { date: releaseDate });
  }

  return (
    <section aria-label={title} className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm hover:bg-neutral-100">{t("manage.close")}</button>
      </div>
      <form onSubmit={save} className="flex flex-wrap items-end gap-2">
        <label className="flex grow flex-col text-xs text-neutral-600">
          {t("manage.slotLabel")}
          <input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} autoFocus className={INPUT} />
        </label>
        <label className="flex flex-col text-xs text-neutral-600">
          {t("manage.slotStaff")}
          <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} className={INPUT}>
            <option value="">{t("manage.noStaff")}</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy} className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("manage.saveSlot")}</button>
        {slot && (
          <button type="button" disabled={busy} onClick={() => void run(`/api/v1/rooms/slots/${slot.id}`, "DELETE", undefined, true)} className="rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50">
            {t("manage.clearSlot")}
          </button>
        )}
      </form>
      {slot && (
        <form onSubmit={release} className="flex flex-wrap items-end gap-2 border-t border-violet-100 pt-3">
          <label className="flex flex-col text-xs text-neutral-600">
            {t("manage.releaseDate")}
            <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} required className={INPUT} />
          </label>
          <button type="submit" disabled={busy} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-white">{t("manage.release")}</button>
          {slot.releasedDates.length > 0 && (
            <div className="w-full text-sm">
              <span className="text-neutral-600">{t("manage.releasedOn")}: </span>
              {slot.releasedDates.map((date) => (
                <button key={date} type="button" disabled={busy} aria-label={t("manage.undoRelease", { date })} onClick={() => void run(`/api/v1/rooms/slots/${slot.id}/releases?date=${date}`, "DELETE")} className="me-1 rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-xs hover:border-red-300 hover:text-red-700" dir="ltr">
                  {date} ×
                </button>
              ))}
            </div>
          )}
        </form>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
