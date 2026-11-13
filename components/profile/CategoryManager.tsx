"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CategoryInput, ProfileCategory } from "@/lib/validations/profile";
import * as api from "./categories-api";
import type { CategoryErrorKey } from "./categories-api";
import { CategoryEditor } from "./CategoryEditor";

interface Props {
  initial: ProfileCategory[];
  /** Demo schools can look but not change anything. */
  readOnly: boolean;
}

type Editing = { kind: "new" } | { kind: "row"; id: string } | null;

const NEW_CATEGORY: CategoryInput = { name: "", multiSelect: true, required: false, options: [] };

function moved(rows: ProfileCategory[], index: number, direction: -1 | 1): ProfileCategory[] {
  const next = rows.slice();
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return next;
}

/** The school's profile categories in display order, with inline add/edit/archive/reorder. */
export function CategoryManager({ initial, readOnly }: Props) {
  const t = useTranslations("admin.categories");
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<{ id: string; key: CategoryErrorKey } | null>(null);

  useEffect(() => setRows(initial), [initial]);

  async function saveNew(input: CategoryInput) {
    const res = await api.createCategory(input);
    if (!res.ok) return res.error;
    setRows((r) => [...r, res.data]);
    setEditing(null);
    router.refresh();
    return null;
  }

  async function saveEdit(id: string, input: CategoryInput) {
    const res = await api.replaceCategory(id, input);
    if (!res.ok) return res.error;
    setRows((r) => r.map((row) => (row.id === id ? res.data : row)));
    setEditing(null);
    router.refresh();
    return null;
  }

  async function archive(id: string) {
    setRowError(null);
    const res = await api.archiveCategory(id);
    if (!res.ok) return setRowError({ id, key: res.error });
    setRows((r) => r.filter((row) => row.id !== id));
    router.refresh();
  }

  async function move(index: number, direction: -1 | 1) {
    const previous = rows;
    const next = moved(rows, index, direction);
    setRows(next);
    setRowError(null);
    setBusy(true);
    const res = await api.reorderCategories(next.map((r) => r.id));
    setBusy(false);
    if (!res.ok) {
      setRows(previous);
      setRowError({ id: rows[index].id, key: res.error });
    }
  }

  return (
    <ul aria-label={t("listLabel")} className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
      {rows.length === 0 && editing?.kind !== "new" && (
        <li className="px-3 py-4 text-center text-sm text-neutral-500">{t("empty")}</li>
      )}
      {rows.map((row, index) => (
        <li key={row.id}>
          {editing?.kind === "row" && editing.id === row.id ? (
            <CategoryEditor initial={row} isNew={false}
              onSave={(input) => saveEdit(row.id, input)} onCancel={() => setEditing(null)} />
          ) : (
            <CategoryRow row={row} readOnly={readOnly} isFirst={index === 0}
              isLast={index === rows.length - 1} disabled={busy}
              error={rowError?.id === row.id ? rowError.key : null}
              onEdit={() => setEditing({ kind: "row", id: row.id })}
              onMove={(direction) => move(index, direction)} onArchive={() => archive(row.id)} />
          )}
        </li>
      ))}
      {!readOnly && (
        <li>
          {editing?.kind === "new" ? (
            <CategoryEditor initial={NEW_CATEGORY} isNew onSave={saveNew} onCancel={() => setEditing(null)} />
          ) : (
            <button type="button" onClick={() => setEditing({ kind: "new" })}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <Plus aria-hidden="true" className="size-4" />
              {t("create")}
            </button>
          )}
        </li>
      )}
    </ul>
  );
}

interface RowProps {
  row: ProfileCategory;
  readOnly: boolean;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  error: CategoryErrorKey | null;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onArchive: () => Promise<void>;
}

/** One category: name, flags and options; archiving asks for confirmation in place. */
function CategoryRow(props: RowProps) {
  const { row, readOnly, error } = props;
  const t = useTranslations("admin.categories");
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="group px-3 py-2">
      <div className="flex min-h-9 items-center gap-2.5">
        {!readOnly && <MoveButtons {...props} />}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
            {row.name}
            <span className="text-xs font-normal text-neutral-500">
              {row.multiSelect ? t("multiSelect") : t("singleSelect")}
              {row.required && ` · ${t("required")}`}
            </span>
          </p>
          <p className="truncate text-xs text-neutral-600">
            {row.options.length > 0 ? row.options.map((o) => o.label).join(" · ") : t("noOptions")}
          </p>
        </div>
        {!readOnly && (confirming ? (
          <span className="flex items-center gap-1 text-xs">
            {t("confirmArchive", { name: row.name })}
            <Button size="xs" variant="destructive"
              onClick={async () => { await props.onArchive(); setConfirming(false); }}>
              {t("archive")}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>{t("cancel")}</Button>
          </span>
        ) : (
          <span className="flex gap-0.5 opacity-60 transition group-hover:opacity-100 group-focus-within:opacity-100">
            <Button size="icon-sm" variant="ghost" aria-label={t("editNamed", { name: row.name })}
              title={t("edit")} onClick={props.onEdit} disabled={props.disabled}>
              <Pencil />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={t("archiveNamed", { name: row.name })}
              title={t("archive")} onClick={() => setConfirming(true)} disabled={props.disabled}
              className="hover:bg-destructive/10 hover:text-destructive">
              <Trash2 />
            </Button>
          </span>
        ))}
      </div>
      {error && <p role="alert" className="pb-1 ps-9 text-xs text-destructive">{t(error)}</p>}
    </div>
  );
}

function MoveButtons({ row, isFirst, isLast, disabled, onMove }: RowProps) {
  const t = useTranslations("admin.categories");
  return (
    <span className="flex flex-col">
      <button type="button" disabled={disabled || isFirst} onClick={() => onMove(-1)}
        aria-label={t("moveUp", { name: row.name })}
        className="rounded text-neutral-400 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30">
        <ChevronUp aria-hidden="true" className="size-4" />
      </button>
      <button type="button" disabled={disabled || isLast} onClick={() => onMove(1)}
        aria-label={t("moveDown", { name: row.name })}
        className="rounded text-neutral-400 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30">
        <ChevronDown aria-hidden="true" className="size-4" />
      </button>
    </span>
  );
}
