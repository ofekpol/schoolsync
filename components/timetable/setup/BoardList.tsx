"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_NAME_LENGTH } from "@/lib/validations/timetable";
import * as api from "./api";
import type { SetupErrorKey } from "./api";

export interface BoardRow {
  id: string;
  name: string;
  status: "setup" | "collecting" | "review" | "published";
}

/** The school's boards, each linking to its setup, and a form for a new one. */
export function BoardList({ boards }: { boards: BoardRow[] }) {
  const t = useTranslations("timetable.boards");
  const tErrors = useTranslations("timetable.setup.errors");
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SetupErrorKey | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api.createBoard(name.trim());
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push(`/timetable/${res.data.board.id}/setup`);
  }

  return (
    <div className="space-y-6">
      <ul aria-label={t("listLabel")} className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {boards.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-500">{t("empty")}</li>}
        {boards.map((board) => (
          <li key={board.id}>
            <Link href={`/timetable/${board.id}/setup`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500">
              <span className="font-medium">{board.name}</span>
              <span className="flex items-center gap-2 text-sm text-neutral-500">
                {t(`status.${board.status}`)}
                <ChevronLeft aria-hidden className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <form onSubmit={create} aria-label={t("newBoard")} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME_LENGTH} required
            className="h-9 w-64 rounded-lg border border-neutral-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" />
        </label>
        <Button type="submit" disabled={busy || name.trim().length === 0}>
          <Plus aria-hidden className="size-4" />
          {t("newBoard")}
        </Button>
        {error && <p role="alert" className="w-full text-sm text-red-700">{tErrors(error)}</p>}
      </form>
    </div>
  );
}
