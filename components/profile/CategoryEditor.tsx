"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PERMISSIONS, type Permission } from "@/lib/permissions/catalog";
import {
  MAX_LABEL_LENGTH,
  MAX_OPTIONS_PER_CATEGORY,
  type CategoryInput,
} from "@/lib/validations/profile";
import type { CategoryErrorKey } from "./categories-api";

interface Props {
  initial: CategoryInput;
  isNew: boolean;
  onSave: (input: CategoryInput) => Promise<CategoryErrorKey | null>;
  onCancel: () => void;
}

/** An option row keeps a client key so inputs hold focus while rows move. */
type OptionRow = { key: number; id?: string; label: string; permissions: Permission[] };

const INPUT =
  "h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Fields {
  name: string;
  multiSelect: boolean;
  required: boolean;
  adminAssigned: boolean;
}

/** Permissions are kept per row but only sent when the category is admin-assigned. */
function toInput(fields: Fields, rows: OptionRow[]): CategoryInput {
  const options = rows
    .map((row) => ({
      id: row.id,
      label: row.label.trim(),
      permissions: fields.adminAssigned ? row.permissions : [],
    }))
    .filter((option) => option.label !== "");
  return { ...fields, name: fields.name.trim(), options };
}

/** Inline add/edit form for one category and its options. Escape cancels. */
export function CategoryEditor({ initial, isNew, onSave, onCancel }: Props) {
  const t = useTranslations("admin.categories");
  const tc = useTranslations("common");
  const id = useId();
  const nextKey = useRef(initial.options.length);
  const [name, setName] = useState(initial.name);
  const [multiSelect, setMultiSelect] = useState(initial.multiSelect);
  const [required, setRequired] = useState(initial.required);
  const [adminAssigned, setAdminAssigned] = useState(initial.adminAssigned ?? false);
  const [rows, setRows] = useState<OptionRow[]>(() =>
    initial.options.map((option, key) => ({ key, ...option, permissions: option.permissions ?? [] })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CategoryErrorKey | "errorDuplicateOption" | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = toInput({ name, multiSelect, required, adminAssigned }, rows);
    if (new Set(input.options.map((o) => o.label)).size !== input.options.length) {
      return setError("errorDuplicateOption");
    }
    setSaving(true);
    setError(null);
    const failure = await onSave(input);
    setSaving(false);
    if (failure) setError(failure);
  }

  return (
    <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onCancel()}
      aria-label={isNew ? t("create") : t("editNamed", { name: initial.name })}
      className="space-y-3 bg-neutral-50 px-3 py-3">
      <div>
        <label htmlFor={`${id}-name`} className="mb-0.5 block text-xs text-neutral-600">{t("name")}</label>
        <input id={`${id}-name`} required autoFocus maxLength={MAX_LABEL_LENGTH} value={name}
          onChange={(e) => setName(e.target.value)} className={INPUT} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={multiSelect} className="accent-primary"
            onChange={(e) => setMultiSelect(e.target.checked)} />
          {t("multiSelect")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={required} className="accent-primary"
            onChange={(e) => setRequired(e.target.checked)} />
          {t("required")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={adminAssigned} className="accent-primary"
            onChange={(e) => setAdminAssigned(e.target.checked)} />
          {t("adminAssigned")}
        </label>
      </div>
      {adminAssigned && <p className="text-xs text-neutral-600">{t("adminAssignedHint")}</p>}
      <OptionList rows={rows} onChange={setRows} newKey={() => nextKey.current++}
        withPermissions={adminAssigned} />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? tc("saving") : t("save")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          {t("cancel")}
        </Button>
        {error && <span role="alert" className="text-xs text-destructive">{t(error)}</span>}
      </div>
    </form>
  );
}

function OptionList({ rows, onChange, newKey, withPermissions }: {
  rows: OptionRow[];
  onChange: (rows: OptionRow[]) => void;
  newKey: () => number;
  withPermissions: boolean;
}) {
  const t = useTranslations("admin.categories");

  function move(index: number, direction: -1 | 1) {
    const next = rows.slice();
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next);
  }

  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-0.5 text-xs text-neutral-600">{t("options")}</legend>
      {rows.map((row, index) => {
        const label = row.label || t("optionNumber", { number: index + 1 });
        const update = (patch: Partial<OptionRow>) =>
          onChange(rows.map((r) => (r.key === row.key ? { ...r, ...patch } : r)));
        return (
          <div key={row.key}>
          <div className="flex items-center gap-1">
            <input aria-label={t("optionNumber", { number: index + 1 })} value={row.label}
              maxLength={MAX_LABEL_LENGTH} className={INPUT}
              onChange={(e) => update({ label: e.target.value })} />
            <Button type="button" size="icon-sm" variant="ghost" disabled={index === 0}
              aria-label={t("moveUp", { name: label })} onClick={() => move(index, -1)}>
              <ChevronUp />
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" disabled={index === rows.length - 1}
              aria-label={t("moveDown", { name: label })} onClick={() => move(index, 1)}>
              <ChevronDown />
            </Button>
            <Button type="button" size="icon-sm" variant="ghost"
              aria-label={t("removeOption", { name: label })}
              className="hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onChange(rows.filter((r) => r.key !== row.key))}>
              <X />
            </Button>
          </div>
          {withPermissions && (
            <PermissionPicker label={label} value={row.permissions}
              onChange={(permissions) => update({ permissions })} />
          )}
          </div>
        );
      })}
      {rows.length < MAX_OPTIONS_PER_CATEGORY && (
        <Button type="button" size="sm" variant="outline"
          onClick={() => onChange([...rows, { key: newKey(), label: "", permissions: [] }])}>
          <Plus aria-hidden="true" />
          {t("addOption")}
        </Button>
      )}
    </fieldset>
  );
}

/** What holding this option lets a staff member do (admin-assigned categories only). */
function PermissionPicker({ label, value, onChange }: {
  label: string;
  value: Permission[];
  onChange: (permissions: Permission[]) => void;
}) {
  const t = useTranslations("admin.categories.permissions");
  return (
    <div role="group" aria-label={t("groupLabel", { name: label })}
      className="flex flex-wrap gap-x-4 gap-y-1 ps-2 pt-1 text-xs text-neutral-700">
      {PERMISSIONS.map((permission) => (
        <label key={permission} className="flex items-center gap-1.5">
          <input type="checkbox" className="accent-primary" checked={value.includes(permission)}
            onChange={(e) => onChange(e.target.checked
              ? [...value, permission]
              : value.filter((p) => p !== permission))} />
          {t(permission)}
        </label>
      ))}
    </div>
  );
}
