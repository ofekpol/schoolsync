"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StaffDialog } from "@/components/admin/staff-ui";
import type { ProfileCategory } from "@/lib/validations/profile";

export interface StaffChoice {
  id: string;
  fullName: string;
  email: string;
}

interface Props {
  /** Active staff not yet on the board. */
  staff: StaffChoice[];
  categories: ProfileCategory[];
  /** staff user id -> chosen profile option ids */
  labels: Record<string, string[]>;
  /** Rejecting keeps the dialog open. */
  onSubmit: (staffUserIds: string[]) => Promise<void>;
}

/** Picks staff users to add as teachers, filterable by one profile label. All filtering is local. */
export function AddFromStaffDialog({ staff, categories, labels, onSubmit }: Props) {
  const t = useTranslations("timetable.setup.fromStaff");
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [option, setOption] = useState("all");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const shown = useMemo(
    () => (option === "all" ? staff : staff.filter((member) => labels[member.id]?.includes(option))),
    [staff, labels, option],
  );
  const allShownChosen = shown.length > 0 && shown.every((member) => chosen.has(member.id));

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function toggleShown() {
    setChosen((current) => {
      const next = new Set(current);
      for (const member of shown) {
        if (allShownChosen) next.delete(member.id);
        else next.add(member.id);
      }
      return next;
    });
  }

  function close() {
    setOpen(false);
    setChosen(new Set());
    setOption("all");
  }

  async function submit() {
    setBusy(true);
    try {
      await onSubmit([...chosen]);
      close();
    } catch {
      // The caller shows why.
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden className="size-4" />
        {t("open")}
      </Button>
      {open && (
        <StaffDialog titleId={titleId} title={t("title")} subtitle={t("hint")} closeLabel={t("close")} onClose={close}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {categories.length > 0 && (
              <select value={option} onChange={(e) => setOption(e.target.value)} aria-label={t("filter")}
                className="h-9 rounded-lg border border-neutral-300 px-2 text-sm">
                <option value="all">{t("all")}</option>
                {categories.map((category) => (
                  <optgroup key={category.id} label={category.name}>
                    {category.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allShownChosen} onChange={toggleShown} disabled={shown.length === 0}
                className="size-4 accent-violet-600" />
              {t("selectShown", { count: shown.length })}
            </label>
          </div>
          <ul aria-label={t("title")} className="mt-3 max-h-[50vh] divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200">
            {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-neutral-500">{t("empty")}</li>}
            {shown.map((member) => (
              <li key={member.id}>
                <label className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-neutral-50">
                  <input type="checkbox" checked={chosen.has(member.id)} onChange={() => toggle(member.id)}
                    className="size-4 accent-violet-600" />
                  <span className="font-medium">{member.fullName}</span>
                  <span dir="ltr" className="truncate text-xs text-neutral-500">{member.email}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={submit} disabled={chosen.size === 0 || busy}>
              {t("add", { count: chosen.size })}
            </Button>
          </div>
        </StaffDialog>
      )}
    </>
  );
}
