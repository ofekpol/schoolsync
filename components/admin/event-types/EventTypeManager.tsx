"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { COLOR_PRESETS } from "@/components/admin/ColorPicker";
import * as api from "./api";
import { EventTypeEditor } from "./EventTypeEditor";
import { EventTypeListItem } from "./EventTypeListItem";
import type { EventTypeDraft, EventTypeErrorKey, EventTypeRow } from "./types";

interface Props {
  initial: EventTypeRow[];
  /** Admins edit, delete and reorder; editors can only add. */
  canManage: boolean;
}

type Editing = { kind: "new" } | { kind: "row"; id: string } | null;

function newDraft(rows: EventTypeRow[]): EventTypeDraft {
  const used = new Set(rows.map((r) => r.colorHex.toLowerCase()));
  return { labelHe: "", labelEn: "", glyph: "", colorHex: COLOR_PRESETS.find((c) => !used.has(c)) ?? COLOR_PRESETS[0] };
}

function moved(rows: EventTypeRow[], index: number, direction: -1 | 1): EventTypeRow[] {
  const next = rows.slice();
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return next;
}

/** Compact, display-ordered list of event types with inline add/edit/delete/reorder. */
export function EventTypeManager({ initial, canManage }: Props) {
  const t = useTranslations("admin.eventTypes");
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<{ id: string; key: EventTypeErrorKey } | null>(null);

  useEffect(() => setRows(initial), [initial]);

  async function saveNew(draft: EventTypeDraft) {
    const res = await api.createEventType(draft);
    if (!res.ok) return res.error;
    setRows((r) => [...r, { ...draft, ...res.data }]);
    setEditing(null);
    router.refresh();
    return null;
  }

  async function saveEdit(id: string, draft: EventTypeDraft) {
    const res = await api.updateEventType(id, draft);
    if (!res.ok) return res.error;
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...draft } : row)));
    setEditing(null);
    router.refresh();
    return null;
  }

  async function remove(id: string) {
    setRowError(null);
    const res = await api.deleteEventType(id);
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
    const res = await api.reorderEventTypes(next.map((r) => r.id));
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
            <EventTypeEditor initial={row} isNew={false}
              onSave={(draft) => saveEdit(row.id, draft)} onCancel={() => setEditing(null)} />
          ) : (
            <EventTypeListItem row={row} canManage={canManage} isFirst={index === 0}
              isLast={index === rows.length - 1} disabled={busy}
              error={rowError?.id === row.id ? rowError.key : null}
              onEdit={() => setEditing({ kind: "row", id: row.id })}
              onMove={(direction) => move(index, direction)} onDelete={() => remove(row.id)} />
          )}
        </li>
      ))}
      <li>
        {editing?.kind === "new" ? (
          <EventTypeEditor initial={newDraft(rows)} isNew onSave={saveNew} onCancel={() => setEditing(null)} />
        ) : (
          <button type="button" onClick={() => setEditing({ kind: "new" })}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <Plus aria-hidden="true" className="size-4" />
            {t("create")}
          </button>
        )}
      </li>
    </ul>
  );
}
