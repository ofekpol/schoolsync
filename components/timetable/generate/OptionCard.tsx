import Link from "next/link";
import { useTranslations } from "next-intl";
import { describeConstraint, type Names } from "@/components/timetable/constraints/describe";
import type { TtConstraint } from "@/lib/timetable/constraints/crud";
import type { SolutionSummary } from "@/lib/timetable/runs";
import type { SolverViolation } from "@/lib/timetable/solver-contract";
import { errorKey } from "./api";

export interface CardNames {
  constraints: TtConstraint[];
  teacherNames: Record<string, string>;
  classNames: Record<string, string>;
  optionNames: Record<string, string>;
}

interface Props extends CardNames {
  boardId: string;
  runId: string;
  solution: SolutionSummary;
}

const SHOWN_NAMES = 4;
const BUILT_IN = new Set(["teacher_clash", "class_clash", "unplaced"]);

function listNames(ids: string[], names: Record<string, string>, fallback: string): string {
  const shown = ids.slice(0, SHOWN_NAMES).map((id) => names[id] ?? fallback).join(", ");
  return ids.length > SHOWN_NAMES ? `${shown} +${ids.length - SHOWN_NAMES}` : shown;
}

/** One profile's option: its score, what it still breaks, and a link to open the grid. */
export function OptionCard({ boardId, runId, solution, ...names }: Props) {
  const t = useTranslations("timetable.generate");
  const tc = useTranslations("timetable.constraints");
  const nameLookup: Names = {
    teacher: (id) => names.teacherNames[id] ?? tc("removedTeacher"),
    option: (id) => names.optionNames[id] ?? tc("removedLabel"),
    day: (day) => tc(`days.${day}`),
  };

  function violationText(v: SolverViolation): string {
    if (v.constraintId === null) {
      return BUILT_IN.has(v.type) ? t(`violation.${v.type}`, { count: v.count }) : t("violation.removedConstraint");
    }
    const constraint = names.constraints.find((c) => c.id === v.constraintId);
    if (!constraint) return t("violation.removedConstraint");
    return t("violation.constraint", { text: describeConstraint(constraint, nameLookup, tc), count: v.count });
  }

  return (
    <article aria-label={t(`profile.${solution.profile}`)} className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="text-lg font-semibold">{t(`profile.${solution.profile}`)}</h3>
      {solution.status === "failed" ? (
        <div role="status" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="font-medium">{t("profileFailed")}</p>
          <p>{t(`error.${errorKey(solution.error)}`)}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-700">{t("score", { score: Math.round(solution.score) })}</p>
          {solution.violations.length === 0 ? (
            <p className="text-sm text-emerald-800">{t("noViolations")}</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {solution.violations.map((v, index) => (
                <li key={index}>
                  <span>{violationText(v)}</span>
                  {v.teacherIds.length > 0 && (
                    <span className="block text-xs text-neutral-600">
                      {t("byTeacher", { names: listNames(v.teacherIds, names.teacherNames, tc("removedTeacher")) })}
                    </span>
                  )}
                  {v.classIds.length > 0 && (
                    <span className="block text-xs text-neutral-600">{t("byClass", { names: listNames(v.classIds, names.classNames, "") })}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/timetable/${boardId}/generate/${runId}/${solution.id}`}
            className="mt-auto rounded-lg bg-violet-700 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-violet-800">
            {t("open")}
          </Link>
        </>
      )}
    </article>
  );
}
