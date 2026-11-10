"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ALL_GRADES, ScopeFields } from "@/components/admin/ScopeFields";
import { Field, RoleHint, fieldClass } from "@/components/admin/staff-ui";

interface StaffRow {
  id: string;
  email: string;
  fullName: string;
  role: "editor" | "admin" | "viewer";
  deactivatedAt: Date | string | null;
  gradeScopes: number[];
  eventTypeScopes: string[];
}

interface EventTypeRow {
  id: string;
  key: string;
  labelHe: string;
  labelEn: string;
}

export function EditStaffForm({
  row,
  eventTypes,
  busy,
  error,
  onCancel,
  onSave,
}: {
  row: StaffRow;
  eventTypes: EventTypeRow[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (row: StaffRow, form: FormData) => void;
}) {
  const t = useTranslations("admin.staff");
  const tc = useTranslations("common");
  const [role, setRole] = useState<StaffRow["role"]>(row.role);

  useEffect(() => {
    setRole(row.role);
  }, [row.id, row.role]);

  return (
    <form action={(form) => onSave(row, form)} className="mt-5 space-y-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label={t("fullName")}>
          <input name="fullName" defaultValue={row.fullName} className={fieldClass} required />
        </Field>
        <Field label={t("role")}>
          <select
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as StaffRow["role"])}
            className={fieldClass}
          >
            <option value="viewer">{t("roleViewer")}</option>
            <option value="editor">{t("roleEditor")}</option>
            <option value="admin">{t("roleAdmin")}</option>
          </select>
        </Field>
      </div>
      <RoleHint role={role} />
      {role === "editor" && (
        <ScopeFields
          eventTypes={eventTypes}
          gradeName={(grade) => `staff-grade-${row.id}-${grade}`}
          typeName={(key) => `staff-type-${row.id}-${key}`}
          defaultGradeScopes={row.gradeScopes}
          defaultEventTypeScopes={row.eventTypeScopes}
          labels={{
            gradeScopes: t("gradeScopes"),
            eventTypeScopes: t("eventTypeScopes"),
            selectAllGrades: t("selectAllGrades"),
            clearAllGrades: t("clearAllGrades"),
            selectAllEventTypes: t("selectAllEventTypes"),
            clearAllEventTypes: t("clearAllEventTypes"),
          }}
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={busy} className="px-4">
          {busy ? tc("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}

export { ALL_GRADES };
