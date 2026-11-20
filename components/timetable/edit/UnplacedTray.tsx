import { useTranslations } from "next-intl";
import type { GridLesson } from "@/lib/timetable/grid";
import type { LessonText } from "./LessonEditor";

export type TrayLesson = GridLesson & { missing: number };

interface Props {
  lessons: TrayLesson[];
  selectedBlockId: string | null;
  disabled: boolean;
  text: LessonText;
  onSelect: (lesson: TrayLesson) => void;
}

/** The current class's or teacher's lessons the timetable still lacks; pick one, then a cell. */
export function UnplacedTray({ lessons, selectedBlockId, disabled, text, onSelect }: Props) {
  const t = useTranslations("timetable.edit");
  return (
    <section aria-label={t("tray")} className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 print:hidden">
      <h2 className="text-sm font-semibold">{t("tray")}</h2>
      {lessons.length === 0 ? (
        <p className="text-sm text-neutral-600">{t("trayEmpty")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {lessons.map((l) => (
            <li key={l.blockId}>
              <button type="button" aria-pressed={l.blockId === selectedBlockId} disabled={disabled} onClick={() => onSelect(l)}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-start text-sm hover:bg-neutral-50 disabled:opacity-50 aria-pressed:border-violet-700 aria-pressed:bg-violet-50">
                <span className="block font-medium">{text.subjectOf(l)}</span>
                <span className="block text-xs text-neutral-600">{text.otherOf(l)}</span>
                <span className="block text-xs text-amber-900">{t("missing", { count: l.missing })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
