"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { StaffDialog } from "@/components/admin/staff-ui";
import type { ConstraintErrorKey } from "./api";

interface Props {
  teacherName: string;
  entitled: boolean;
  freeDay: number | null;
  days: number[];
  onSave: (freeDay: number | null) => Promise<ConstraintErrorKey | null>;
  onClose: () => void;
}

/** Management answers for one teacher: their free day, or no request. */
export function FillInDialog({ teacherName, entitled, freeDay, days, onSave, onClose }: Props) {
  const t = useTranslations("timetable.collect");
  const tc = useTranslations("timetable.constraints");
  const titleId = useId();
  const [day, setDay] = useState(freeDay === null ? "" : String(freeDay));
  const [error, setError] = useState<ConstraintErrorKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const failure = await onSave(day === "" ? null : Number(day));
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <StaffDialog titleId={titleId} title={t("fillInTitle", { name: teacherName })} closeLabel={t("close")} onClose={onClose} size="md">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("freeDay")}</span>
        <select aria-label={t("day")} value={day} onChange={(e) => setDay(e.target.value)} disabled={!entitled}
          className="h-9 w-48 rounded-lg border border-neutral-300 bg-white px-2">
          <option value="">{t("noRequest")}</option>
          {days.map((d) => <option key={d} value={d}>{tc(`days.${d}`)}</option>)}
        </select>
      </label>
      {!entitled && <p className="mt-2 text-sm text-neutral-600">{t("notEntitled")}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{tc(`errors.${error}`)}</p>}
      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={save} disabled={busy}>{t("save")}</Button>
      </div>
    </StaffDialog>
  );
}
