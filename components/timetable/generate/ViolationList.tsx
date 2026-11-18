import { useTranslations } from "next-intl";
import { describeConstraint, type Names } from "@/components/timetable/constraints/describe";
import type { TtConstraint } from "@/lib/timetable/constraints/crud";
import type { SolverViolation } from "@/lib/timetable/solver-contract";

export interface CardNames {
  constraints: TtConstraint[];
  teacherNames: Record<string, string>;
  classNames: Record<string, string>;
  optionNames: Record<string, string>;
}

interface Props extends CardNames {
  violations: SolverViolation[];
}

const SHOWN_NAMES = 4;
const BUILT_IN = new Set(["teacher_clash", "class_clash", "unplaced", "pin_moved"]);

function listNames(ids: string[], names: Record<string, string>, fallback: string): string {
  const shown = ids.slice(0, SHOWN_NAMES).map((id) => names[id] ?? fallback).join(", ");
  return ids.length > SHOWN_NAMES ? `${shown} +${ids.length - SHOWN_NAMES}` : shown;
}

/** What an option still breaks, or "no violations". */
export function ViolationList({ violations, ...names }: Props) {
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

  if (violations.length === 0) return <p className="text-sm text-emerald-800">{t("noViolations")}</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {violations.map((v, index) => (
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
  );
}
