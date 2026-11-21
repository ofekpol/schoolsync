import { useTranslations } from "next-intl";
import { Pin } from "lucide-react";
import { cellsFor, type GridView, type SolutionGrid } from "@/lib/timetable/grid";
import { className } from "@/components/timetable/setup/className";
import { WeekTable } from "./WeekTable";

interface Props {
  grid: SolutionGrid;
  kind: GridView["kind"];
}

/** Every class (grade/number order) or teacher (by name) as a read-only week, one A4 landscape page each. */
export function PrintSheets({ grid, kind }: Props) {
  const t = useTranslations("timetable.generate");
  const te = useTranslations("timetable.edit");
  const tGrades = useTranslations("grades");
  const { names } = grid;
  const classLabel = (id: string) => {
    const c = names.classes[id];
    return c ? className(c, (g) => tGrades(`label_${g}`)) : t("removedClass");
  };
  const teacherName = (id: string) => names.teachers[id] ?? t("removedTeacher");
  const ids = kind === "class"
    ? Object.keys(names.classes).sort((a, b) => names.classes[a].grade - names.classes[b].grade || names.classes[a].number - names.classes[b].number)
    : Object.keys(names.teachers).sort((a, b) => names.teachers[a].localeCompare(names.teachers[b]));

  return (
    <>
      {ids.map((id) => (
        <section key={id} className="print-timetable space-y-3">
          <h2 className="text-lg font-bold">{kind === "class" ? classLabel(id) : teacherName(id)}</h2>
          <WeekTable week={grid.week} cells={cellsFor(grid, { kind, id })} renderCell={(_slot, lessons) => lessons.map((l) => (
            <div key={l.blockId} className="mb-1">
              <p className="font-medium">{l.subjectId === null ? t("meeting") : names.subjects[l.subjectId] ?? t("removedSubject")}</p>
              <p className="text-xs">{(kind === "class" ? l.teacherIds.map(teacherName) : l.classIds.map(classLabel)).join(", ")}</p>
              {l.pinned && <p className="inline-flex items-center gap-1 text-xs"><Pin aria-hidden className="size-3" />{te("pinned")}</p>}
            </div>
          ))} />
        </section>
      ))}
    </>
  );
}
