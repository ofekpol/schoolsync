"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, BadgeCheck, CheckCircle2, Loader2, Printer } from "lucide-react";
import type { SolutionSummary } from "@/lib/timetable/runs";
import { ViolationList, type CardNames } from "@/components/timetable/generate/ViolationList";
import { evaluate, publish, regenerate, type EditErrorKey, type EditResult } from "./api";

interface Props {
  boardId: string;
  runId: string;
  report: SolutionSummary;
  published: boolean;
  cardNames: CardNames;
  onChecked: (report: SolutionSummary) => void;
}

const BUTTON = "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50";

/** Report status and Check, Regenerate, Publish and Print for the option being edited. */
export function EditToolbar({ boardId, runId, report, published: initiallyPublished, cardNames, onChecked }: Props) {
  const t = useTranslations("timetable.edit");
  const router = useRouter();
  const [busy, setBusy] = useState<"check" | "regenerate" | "publish" | null>(null);
  const [error, setError] = useState<EditErrorKey | null>(null);
  const [published, setPublished] = useState(initiallyPublished);
  const printBase = `/timetable/${boardId}/generate/${runId}/${report.id}/print`;

  async function run<T>(kind: NonNullable<typeof busy>, call: () => Promise<EditResult<T>>): Promise<T | null> {
    setBusy(kind);
    setError(null);
    const res = await call();
    setBusy(null);
    if (!res.ok) setError(res.error);
    return res.ok ? res : null;
  }

  async function check() {
    const res = await run("check", () => evaluate(boardId, runId, report.id));
    if (res) onChecked(res.solution);
  }
  async function startRegenerate() {
    if (await run("regenerate", () => regenerate(boardId, report.id))) router.push(`/timetable/${boardId}/generate`);
  }
  async function startPublish() {
    if (!window.confirm(t("publishConfirm"))) return;
    if (await run("publish", () => publish(boardId, runId, report.id))) setPublished(true);
  }

  return (
    <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 print:hidden">
      {published && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">
          <BadgeCheck aria-hidden className="size-4 shrink-0" />{t("publishedBanner")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {report.reportStale ? (
          <>
            <p className="inline-flex items-center gap-1 text-sm text-amber-900"><AlertTriangle aria-hidden className="size-4" />{t("reportStale")}</p>
            <button type="button" onClick={check} disabled={busy !== null} className={BUTTON}>{t("check")}</button>
          </>
        ) : (
          <p className="inline-flex items-center gap-1 text-sm text-emerald-800"><CheckCircle2 aria-hidden className="size-4" />{t("reportFresh")}</p>
        )}
        {busy === "check" && (
          <p role="status" className="inline-flex items-center gap-1 text-sm text-neutral-700"><Loader2 aria-hidden className="size-4 animate-spin" />{t("checking")}</p>
        )}
      </div>
      <ViolationList violations={report.violations} {...cardNames} />
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{t(`error.${error}`)}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={startRegenerate} disabled={busy !== null} className={BUTTON}>{t("regenerate")}</button>
        {!published && (
          <button type="button" onClick={startPublish} disabled={busy !== null}
            className="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50">
            {t("publish")}
          </button>
        )}
        <button type="button" onClick={() => window.print()} className={`${BUTTON} inline-flex items-center gap-1`}>
          <Printer aria-hidden className="size-4" />{t("print")}
        </button>
        <Link href={`${printBase}?view=class` as Route} className="text-sm text-violet-700 hover:underline">{t("printAllClasses")}</Link>
        <Link href={`${printBase}?view=teacher` as Route} className="text-sm text-violet-700 hover:underline">{t("printAllTeachers")}</Link>
      </div>
      <p className="text-xs text-neutral-600">{t("regenerateHint")}</p>
    </section>
  );
}
