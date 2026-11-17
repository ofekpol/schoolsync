"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { jerusalemDateString, jerusalemTimeString } from "@/lib/datetime";
import type { MyBoard } from "@/lib/timetable/constraints/me";
import { sendJson } from "@/components/timetable/setup/api";

const when = (iso: string) => `${jerusalemDateString(new Date(iso))} ${jerusalemTimeString(new Date(iso))}`;

/** The teacher's collecting boards, each with their own free-day answer. */
export function MyBoards({ boards }: { boards: MyBoard[] }) {
  const t = useTranslations("timetable.me");
  if (boards.length === 0) return <p className="text-sm text-neutral-600">{t("empty")}</p>;
  return (
    <ul className="space-y-4">
      {boards.map((board) => <BoardCard key={board.boardId} board={board} />)}
    </ul>
  );
}

function BoardCard({ board }: { board: MyBoard }) {
  const t = useTranslations("timetable.me");
  const tc = useTranslations("timetable.constraints");
  const router = useRouter();
  const [day, setDay] = useState(board.freeDay === null ? "" : String(board.freeDay));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await sendJson(`/api/v1/timetable/me/${board.boardId}`, "PUT", { freeDay: day === "" ? null : Number(day) });
    setBusy(false);
    if (!res.ok) return setError(res.code === "deadline_past" ? "closed" : "saveFailed");
    setError(null);
    router.refresh();
  }

  return (
    <li className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{board.boardName}</h2>
        {board.deadline && <span className="text-sm text-neutral-600">{t("deadline", { when: when(board.deadline) })}</span>}
      </div>
      {!board.open && <p className="text-sm font-medium text-neutral-700">{t("closed")}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("freeDay")}</span>
          <select aria-label={t("freeDay")} value={day} onChange={(e) => setDay(e.target.value)}
            disabled={!board.open || !board.freeDayEntitled}
            className="h-9 w-48 rounded-lg border border-neutral-300 bg-white px-2 disabled:bg-neutral-50">
            <option value="">{t("noRequest")}</option>
            {board.days.map((d) => <option key={d} value={d}>{tc(`days.${d}`)}</option>)}
          </select>
        </label>
        {board.open && <Button type="button" onClick={save} disabled={busy}>{t("save")}</Button>}
      </div>
      {!board.freeDayEntitled && <p className="text-sm text-neutral-600">{t("notEntitled")}</p>}
      {board.answeredAt && (
        <p className="text-xs text-neutral-500">
          {board.byManagement ? t("filledByManagement", { when: when(board.answeredAt) }) : t("answered", { when: when(board.answeredAt) })}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{t(error)}</p>}
    </li>
  );
}
