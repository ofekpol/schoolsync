import type { TtConstraint } from "@/lib/timetable/constraints/crud";
import type { Target } from "@/lib/timetable/constraints/target";

type T = (key: string, values?: Record<string, string | number>) => string;
export interface Names {
  teacher(id: string): string;
  option(id: string): string;
  day(day: number): string;
}

const SHOWN_NAMES = 3;

function who(target: Target, names: Names, t: T): string {
  if (target.kind === "label") return t("describe.whoLabel", { label: names.option(target.optionId) });
  const listed = target.teacherIds.slice(0, SHOWN_NAMES).map(names.teacher).join(", ");
  const more = target.teacherIds.length - SHOWN_NAMES;
  return more > 0 ? `${listed} ${t("describe.more", { count: more })}` : listed;
}

/** One sentence for a constraint, e.g. "פגישה: מורים עם התיוג מתמטיקה, 2 שעות ברצף". */
export function describeConstraint(c: TtConstraint, names: Names, t: T): string {
  const p = c.params as Record<string, unknown>;
  switch (c.type) {
    case "teacher_free_day":
      return t("describe.teacher_free_day", { who: names.teacher(c.teacherId ?? ""), day: names.day(p.day as number) });
    case "teacher_unavailable": {
      const periods = p.periods as number[] | undefined;
      const when = periods ? t("describe.periods", { list: periods.join(", ") }) : t("describe.allDay");
      return t("describe.teacher_unavailable", { who: who(p.target as Target, names, t), day: names.day(p.day as number), when });
    }
    case "meeting": {
      const text = t("describe.meeting", { who: who(p.target as Target, names, t), count: p.weeklyPeriods as number });
      return p.consecutive ? `${text} ${t("describe.consecutive")}` : text;
    }
    case "subject_max_per_day":
      return t("describe.subject_max_per_day", { max: p.max as number });
    default:
      return t(`describe.${c.type}`);
  }
}
