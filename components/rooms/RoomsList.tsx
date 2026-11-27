"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Archive, ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";
import type { Room } from "@/lib/validations/rooms";
import { roomsFetch } from "./rooms-api";

const INPUT = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const ICON_BUTTON = "rounded p-1.5 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30";

/** Add, rename, reorder and archive the school's rooms. */
export function RoomsList({ rooms }: { rooms: Room[] }) {
  const t = useTranslations("rooms");
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    const result = await roomsFetch(url, method, body);
    setBusy(false);
    if (!result.ok) {
      setError(t(`errors.${result.error}`));
      return false;
    }
    router.refresh();
    return true;
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await run("/api/v1/rooms", "POST", { name: newName })) setNewName("");
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    if (editing && (await run(`/api/v1/rooms/${editing.id}`, "PATCH", { name: editing.name }))) setEditing(null);
  }

  function move(index: number, by: -1 | 1) {
    const ids = rooms.map((r) => r.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    void run("/api/v1/rooms/order", "PUT", { ids });
  }

  function archive(room: Room) {
    if (window.confirm(t("manage.archiveConfirm", { name: room.name }))) void run(`/api/v1/rooms/${room.id}`, "DELETE");
  }

  return (
    <div className="space-y-3">
      {rooms.length === 0 ? (
        <p className="text-sm text-neutral-500">{t("manage.noRooms")}</p>
      ) : (
        <ul aria-label={t("manage.roomsTitle")} className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
          {rooms.map((room, index) => (
            <li key={room.id} className="flex items-center gap-2 px-3 py-2">
              {editing?.id === room.id ? (
                <form onSubmit={rename} className="flex grow items-center gap-2">
                  <input aria-label={t("manage.renameRoom", { name: room.name })} value={editing.name} onChange={(e) => setEditing({ id: room.id, name: e.target.value })} required maxLength={60} autoFocus className={`${INPUT} grow`} />
                  <button type="submit" disabled={busy} className="rounded-md bg-violet-700 px-3 py-1.5 text-sm text-white">{t("manage.save")}</button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100">{t("manage.cancel")}</button>
                </form>
              ) : (
                <>
                  <span className="grow font-medium">{room.name}</span>
                  <button type="button" disabled={busy || index === 0} aria-label={t("manage.moveUp", { name: room.name })} onClick={() => move(index, -1)} className={ICON_BUTTON}>
                    <ChevronUp aria-hidden="true" className="size-4" />
                  </button>
                  <button type="button" disabled={busy || index === rooms.length - 1} aria-label={t("manage.moveDown", { name: room.name })} onClick={() => move(index, 1)} className={ICON_BUTTON}>
                    <ChevronDown aria-hidden="true" className="size-4" />
                  </button>
                  <button type="button" disabled={busy} aria-label={t("manage.renameRoom", { name: room.name })} onClick={() => setEditing({ id: room.id, name: room.name })} className={ICON_BUTTON}>
                    <Pencil aria-hidden="true" className="size-4" />
                  </button>
                  <button type="button" disabled={busy} aria-label={t("manage.archiveRoom", { name: room.name })} onClick={() => archive(room)} className={`${ICON_BUTTON} hover:bg-red-50 hover:text-red-700`}>
                    <Archive aria-hidden="true" className="size-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex items-end gap-2">
        <label className="flex grow flex-col text-xs text-neutral-600">
          {t("manage.roomName")}
          <input value={newName} onChange={(e) => setNewName(e.target.value)} required maxLength={60} className={INPUT} />
        </label>
        <button type="submit" disabled={busy} className="flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">
          <Plus aria-hidden="true" className="size-4" />
          {t("manage.addRoom")}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
