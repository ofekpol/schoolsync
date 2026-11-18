"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowDownToLine, Pin, PinOff } from "lucide-react";
import { cellsFor, conflictsAt, type GridLesson, type GridView, type PlacedLesson, type Slot, type SolutionGrid } from "@/lib/timetable/grid";
import type { PlacementEdit } from "@/lib/validations/timetable-runs";
import type { CardNames } from "@/components/timetable/generate/ViolationList";
import { editPlacement, type EditErrorKey } from "./api";
import { EditToolbar } from "./EditToolbar";
import { UnplacedTray, type TrayLesson } from "./UnplacedTray";
import { WeekTable, type CellLessons } from "./WeekTable";

export interface LessonText {
  subjectOf: (lesson: GridLesson) => string;
  otherOf: (lesson: GridLesson) => string;
  classLabel: (id: string) => string;
  teacherName: (id: string) => string;
}

interface Props {
  boardId: string;
  runId: string;
  grid: SolutionGrid;
  view: GridView;
  text: LessonText;
  cardNames: CardNames;
  error: EditErrorKey | null; // owned by the parent: a refresh after moved_elsewhere remounts this editor
  onError: (error: EditErrorKey | null) => void;
}

interface Selection {
  lesson: GridLesson;
  from: Slot | null; // null = picked from the tray
}
interface Placement {
  lessons: PlacedLesson[];
  unplaced: TrayLesson[];
}

const sameSlot = (a: Slot | null, b: Slot | null) => !!a && !!b && a.day === b.day && a.period === b.period;
const bare = ({ blockId, subjectId, classIds, teacherIds }: GridLesson): GridLesson => ({ blockId, subjectId, classIds, teacherIds });

/** The placements after moving `lesson` from `from` to `to` (either may be the tray). A hand move pins. */
function moved({ lessons, unplaced }: Placement, lesson: GridLesson, from: Slot | null, to: Slot | null): Placement {
  const kept = from ? lessons.filter((l) => !(l.blockId === lesson.blockId && sameSlot(l, from))) : lessons;
  const placed = to ? [...kept, { ...bare(lesson), ...to, pinned: true }] : kept;
  const missing = (unplaced.find((u) => u.blockId === lesson.blockId)?.missing ?? 0) + (to ? 0 : 1) - (from ? 0 : 1);
  const others = unplaced.filter((u) => u.blockId !== lesson.blockId);
  return { lessons: placed, unplaced: missing > 0 ? [...others, { ...bare(lesson), missing }] : others };
}

/** The option's week grid with click-to-move, the unplaced tray, pins and the toolbar. */
export function LessonEditor({ boardId, runId, grid, view, text, cardNames, error, onError }: Props) {
  const t = useTranslations("timetable.edit");
  const router = useRouter();
  const [placement, setPlacement] = useState<Placement>({ lessons: grid.lessons, unplaced: grid.unplaced });
  const [report, setReport] = useState(grid.solution);
  const [selected, setSelected] = useState<Selection | null>(null);
  // One edit at a time: a rollback restores a snapshot that must not hide another edit's result.
  const [pending, setPending] = useState(false);
  const selecting = selected !== null;

  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selecting]);

  async function send(edit: PlacementEdit, next: Placement) {
    const previous = placement;
    setPlacement(next);
    setSelected(null);
    onError(null);
    setPending(true);
    const res = await editPlacement(boardId, runId, grid.solution.id, edit);
    setPending(false);
    if (res.ok) {
      if (edit.action === "move") setReport((r) => ({ ...r, reportStale: true }));
      return;
    }
    setPlacement(previous);
    onError(res.error);
    if (res.error === "moved_elsewhere") router.refresh();
  }

  const move = (lesson: GridLesson, from: Slot | null, to: Slot | null) =>
    send({ action: "move", blockId: lesson.blockId, from, to }, moved(placement, lesson, from, to));
  const togglePin = (lesson: GridLesson, slot: Slot, pinned: boolean) =>
    send({ action: "pin", blockId: lesson.blockId, ...slot, pinned }, {
      ...placement,
      lessons: placement.lessons.map((l) => (l.blockId === lesson.blockId && sameSlot(l, slot) ? { ...l, pinned } : l)),
    });

  const inView = (l: GridLesson) => (view.kind === "class" ? l.classIds : l.teacherIds).includes(view.id);
  const pick = (lesson: GridLesson, from: Slot | null) =>
    setSelected(selected?.lesson.blockId === lesson.blockId && (sameSlot(selected.from, from) || selected.from === from) ? null : { lesson, from });

  function target(slot: Slot, lessons: CellLessons) {
    if (!selected || lessons.some((l) => l.blockId === selected.lesson.blockId)) return null;
    const busy = conflictsAt(placement.lessons, selected.lesson, slot, selected.from ?? undefined);
    const names = [...busy.teacherIds.map(text.teacherName), ...busy.classIds.map(text.classLabel)];
    return (
      <button type="button" disabled={pending} onClick={() => move(selected.lesson, selected.from, slot)}
        className={`mt-1 flex w-full items-center justify-center gap-1 rounded border border-dashed px-2 py-1 text-xs ${
          names.length > 0 ? "border-red-400 bg-red-50 text-red-900" : "border-violet-400 bg-violet-50 text-violet-900"}`}>
        {names.length > 0 && <AlertTriangle aria-hidden className="size-3.5 shrink-0" />}
        {names.length > 0 ? t("target.clash", { names: names.join(", ") }) : t("target.free")}
      </button>
    );
  }

  function renderCell(slot: Slot, lessons: CellLessons, exists: boolean) {
    return (
      <>
        {lessons.map((l) => (
          <div key={l.blockId} className="mb-1 flex items-start gap-1">
            <button type="button" aria-pressed={selected?.lesson.blockId === l.blockId && sameSlot(selected.from, slot)}
              disabled={pending} onClick={() => pick(l, slot)}
              className="flex-1 rounded px-1 py-0.5 text-start hover:bg-violet-50 aria-pressed:bg-violet-100 aria-pressed:ring-2 aria-pressed:ring-violet-700">
              <span className="block font-medium">{text.subjectOf(l)}</span>
              <span className="block text-xs text-neutral-600">{text.otherOf(l)}</span>
              {l.pinned && <span className="inline-flex items-center gap-1 text-xs text-violet-900"><Pin aria-hidden className="size-3" />{t("pinned")}</span>}
            </button>
            <button type="button" aria-label={t(l.pinned ? "unpin" : "pin")} title={t(l.pinned ? "unpin" : "pin")}
              disabled={pending} onClick={() => togglePin(l, slot, !l.pinned)} className="rounded p-1 text-neutral-600 hover:bg-neutral-100 print:hidden">
              {l.pinned ? <PinOff aria-hidden className="size-3.5" /> : <Pin aria-hidden className="size-3.5" />}
            </button>
            <button type="button" aria-label={t("toTray")} title={t("toTray")} disabled={pending} onClick={() => move(l, slot, null)}
              className="rounded p-1 text-neutral-600 hover:bg-neutral-100 print:hidden">
              <ArrowDownToLine aria-hidden className="size-3.5" />
            </button>
          </div>
        ))}
        {exists && target(slot, lessons)}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <EditToolbar boardId={boardId} runId={runId} report={report} published={grid.published} cardNames={cardNames} onChecked={setReport} />
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{t(`error.${error}`)}</p>}
      {selected && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-violet-900 print:hidden">
          {t("select")}
          <button type="button" onClick={() => setSelected(null)} className="rounded border border-neutral-300 px-2 py-0.5 text-neutral-800">{t("cancel")}</button>
        </p>
      )}
      <div aria-busy={pending}>
        <WeekTable week={grid.week} cells={cellsFor(placement, view)} renderCell={renderCell} />
      </div>
      <UnplacedTray disabled={pending} lessons={placement.unplaced.filter(inView)} selectedBlockId={selected?.from === null ? selected.lesson.blockId : null}
        text={text} onSelect={(l) => pick(l, null)} />
    </div>
  );
}
