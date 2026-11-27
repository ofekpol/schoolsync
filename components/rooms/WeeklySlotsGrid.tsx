"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Week } from "@/lib/rooms/week-schema";
import type { Room } from "@/lib/validations/rooms";
import { cn } from "@/lib/utils";
import { roomsFetch } from "./rooms-api";
import { useDayName } from "./day-names";
import { SlotEditor, type StaffOption, type WeeklySlot } from "./SlotEditor";

interface Props {
  week: Week | null;
  rooms: Room[];
  staff: StaffOption[];
}

/** Per room: days × periods of fixed weekly use. Click a cell to set, clear or free it on a date. */
export function WeeklySlotsGrid({ week, rooms, staff }: Props) {
  const t = useTranslations("rooms");
  const dayName = useDayName(useLocale());
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [slots, setSlots] = useState<WeeklySlot[]>([]);
  const [cell, setCell] = useState<{ day: number; period: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!roomId) return;
    const result = await roomsFetch<{ slots: WeeklySlot[] }>(`/api/v1/rooms/${roomId}/slots`, "GET");
    if (result.ok) setSlots(result.data.slots);
    else setError(t(`errors.${result.error}`));
  }, [roomId, t]);

  useEffect(() => {
    setCell(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!rooms.some((r) => r.id === roomId)) setRoomId(rooms[0]?.id ?? "");
  }, [rooms, roomId]);

  if (!week) return <p className="text-sm text-neutral-500">{t("manage.needWeek")}</p>;
  if (rooms.length === 0) return <p className="text-sm text-neutral-500">{t("manage.needRoom")}</p>;

  const maxPeriods = Math.max(...week.days.map((d) => d.periods.length));
  const slotAt = (day: number, period: number) => slots.find((s) => s.day === day && s.period === period);

  return (
    <div className="space-y-3">
      <label className="flex w-fit flex-col text-xs text-neutral-600">
        {t("manage.pickRoom")}
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900">
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <td />
              {week.days.map((d) => <th key={d.day} scope="col" className="min-w-24 text-start font-semibold text-neutral-600">{dayName(d.day)}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxPeriods }, (_, i) => i + 1).map((period) => (
              <tr key={period}>
                <th scope="row" className="pe-2 text-start font-medium text-neutral-600">{t("period", { number: period })}</th>
                {week.days.map((d) => {
                  if (period > d.periods.length) return <td key={d.day} />;
                  const slot = slotAt(d.day, period);
                  const name = dayName(d.day);
                  const selected = cell?.day === d.day && cell.period === period;
                  return (
                    <td key={d.day}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        aria-label={slot ? t("manage.cellSlot", { day: name, number: period, label: slot.label }) : t("manage.cellEmpty", { day: name, number: period })}
                        onClick={() => setCell({ day: d.day, period })}
                        className={cn(
                          "block min-h-10 w-full rounded-md border px-2 py-1 text-start text-xs",
                          slot ? "border-neutral-300 bg-neutral-100 font-medium" : "border-dashed border-neutral-300 text-neutral-400",
                          selected && "ring-2 ring-violet-600",
                        )}
                      >
                        {slot ? slot.label : "+"}
                        {slot?.staffName && <span className="block font-normal text-neutral-600">{slot.staffName}</span>}
                        {slot && slot.releasedDates.length > 0 && <span className="block font-normal text-emerald-700">{t("manage.releasedOn")}: {slot.releasedDates.length}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cell && (
        <SlotEditor
          key={`${roomId}-${cell.day}-${cell.period}`}
          roomId={roomId}
          day={cell.day}
          period={cell.period}
          title={t("manage.editSlot", { day: dayName(cell.day), number: cell.period })}
          slot={slotAt(cell.day, cell.period)}
          staff={staff}
          onChanged={() => void load()}
          onClose={() => setCell(null)}
        />
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
