"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { jerusalemDateString, jerusalemTimeString } from "@/lib/datetime";
import type { Run } from "@/lib/timetable/runs";
import { errorKey, fetchRun, PROFILE_ORDER, startRun, type GenerateErrorKey } from "./api";
import { OptionCard, type CardNames } from "./OptionCard";

export const POLL_MS = 3000;
const TICK_MS = 1000;

interface Props extends CardNames {
  boardId: string;
  problemCount: number;
  runs: Run[];
}

const inProgress = (run: Run | undefined) => run?.status === "queued" || run?.status === "running";
const upsert = (runs: Run[], run: Run) =>
  [run, ...runs.filter((r) => r.id !== run.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** Generate button, the polled latest run, its three option cards and earlier runs. */
export function GeneratePanel({ boardId, problemCount, runs: initialRuns, ...names }: Props) {
  const t = useTranslations("timetable.generate");
  const [runs, setRuns] = useState(initialRuns);
  const [selectedId, setSelectedId] = useState(initialRuns[0]?.id ?? null);
  const [error, setError] = useState<GenerateErrorKey | null>(null);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const selected = runs.find((r) => r.id === selectedId);
  const latest = runs[0];
  const pollId = latest && inProgress(latest) ? latest.id : null;
  const pollStart = latest ? Date.parse(latest.createdAt) : 0;

  useEffect(() => {
    if (!pollId) return;
    let active = true;
    const poll = setInterval(async () => {
      const run = await fetchRun(boardId, pollId);
      if (active && run) setRuns((prev) => upsert(prev, run));
    }, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [boardId, pollId]);

  async function generate() {
    setStarting(true);
    setError(null);
    const res = await startRun(boardId);
    setStarting(false);
    if (!res.ok) return setError(res.error);
    const placeholder: Run = { id: res.runId, status: "queued", error: null, createdAt: new Date().toISOString(), finishedAt: null, solutions: [] };
    setNow(Date.now());
    setRuns((prev) => upsert(prev, placeholder));
    setSelectedId(res.runId);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={generate} disabled={problemCount > 0 || starting || pollId !== null}
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50">
          {t("generate")}
        </button>
        {problemCount > 0 && (
          <p className="text-sm text-amber-900">
            {t("problems", { count: problemCount })}{" "}
            <Link href={`/timetable/${boardId}/setup`} className="font-medium underline underline-offset-2">{t("fixProblems")}</Link>
          </p>
        )}
        {pollId && (
          <p role="status" className="flex items-center gap-2 text-sm text-neutral-700">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            <span>{t("running")}</span>
            <span>{t("elapsed", { seconds: Math.max(0, Math.floor((now - pollStart) / 1000)) })}</span>
          </p>
        )}
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{t(`error.${error}`)}</p>}
      {selected?.status === "failed" && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {t("failed")} {t(`error.${errorKey(selected.error)}`)}
        </p>
      )}
      {selected?.status === "done" && (
        <div className="grid gap-4 md:grid-cols-3">
          {PROFILE_ORDER.flatMap((profile) => selected.solutions.filter((s) => s.profile === profile)).map((solution) => (
            <OptionCard key={solution.id} boardId={boardId} runId={selected.id} solution={solution} {...names} />
          ))}
        </div>
      )}
      {runs.length > 1 && (
        <section aria-label={t("history")} className="space-y-2">
          <h2 className="text-sm font-semibold">{t("history")}</h2>
          <ul className="flex flex-wrap gap-2">
            {runs.map((run) => {
              const when = new Date(run.createdAt);
              return (
                <li key={run.id}>
                  <button type="button" onClick={() => setSelectedId(run.id)} aria-pressed={run.id === selectedId}
                    className="rounded-lg border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50 aria-pressed:border-violet-700 aria-pressed:bg-violet-50">
                    {jerusalemDateString(when)} {jerusalemTimeString(when)} · {t(`status.${run.status}`)}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
