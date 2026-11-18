import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, BadgeCheck } from "lucide-react";
import type { SolutionSummary } from "@/lib/timetable/runs";
import { errorKey } from "./api";
import { ViolationList, type CardNames } from "./ViolationList";

export type { CardNames };

interface Props extends CardNames {
  boardId: string;
  runId: string;
  solution: SolutionSummary;
  publishedSolutionId: string | null;
}

/** One profile's option: its score, what it still breaks, and a link to open the editor. */
export function OptionCard({ boardId, runId, solution, publishedSolutionId, ...names }: Props) {
  const t = useTranslations("timetable.generate");
  const te = useTranslations("timetable.edit");

  return (
    <article aria-label={t(`profile.${solution.profile}`)} className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{t(`profile.${solution.profile}`)}</h3>
        {solution.id === publishedSolutionId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">
            <BadgeCheck aria-hidden className="size-3.5" />{te("published")}
          </span>
        )}
      </div>
      {solution.status === "failed" ? (
        <div role="status" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="font-medium">{t("profileFailed")}</p>
          <p>{t(`error.${errorKey(solution.error)}`)}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-700">{t("score", { score: Math.round(solution.score) })}</p>
          {solution.reportStale && (
            <p className="inline-flex items-center gap-1 text-sm text-amber-900">
              <AlertTriangle aria-hidden className="size-4" />{te("reportStale")}
            </p>
          )}
          <ViolationList violations={solution.violations} {...names} />
          <Link href={`/timetable/${boardId}/generate/${runId}/${solution.id}`}
            className="mt-auto rounded-lg bg-violet-700 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-violet-800">
            {te("open")}
          </Link>
        </>
      )}
    </article>
  );
}
