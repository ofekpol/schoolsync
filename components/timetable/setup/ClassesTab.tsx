"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { TtClass } from "@/lib/timetable/classes";
import { MAX_CLASS_KIND_LENGTH, MAX_CLASSES_PER_GRADE, MAX_GRADE, MAX_NAME_LENGTH, MIN_GRADE } from "@/lib/validations/timetable";
import * as api from "./api";
import type { SetupErrorKey } from "./api";
import { className } from "./className";

const GRADES = Array.from({ length: MAX_GRADE - MIN_GRADE + 1 }, (_, i) => MIN_GRADE + i);

/** One row per grade: how many classes it has, then each class's name and type. */
export function ClassesTab({ boardId, classes }: { boardId: string; classes: TtClass[] }) {
  const t = useTranslations("timetable.setup");
  const kindsId = useId();
  return (
    <div className="space-y-3">
      <p className="max-w-xl text-sm text-neutral-600">{t("classes.hint")}</p>
      <datalist id={kindsId}>
        {(t.raw("classes.kinds") as string[]).map((kind) => <option key={kind} value={kind} />)}
      </datalist>
      <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
        {GRADES.map((grade) => (
          <GradeRow key={grade} boardId={boardId} grade={grade} kindsId={kindsId}
            classes={classes.filter((c) => c.grade === grade)} />
        ))}
      </ul>
    </div>
  );
}

interface GradeRowProps {
  boardId: string;
  grade: number;
  classes: TtClass[];
  kindsId: string;
}

function GradeRow({ boardId, grade, classes, kindsId }: GradeRowProps) {
  const count = classes.length;
  const t = useTranslations("timetable.setup");
  const tGrades = useTranslations("grades");
  const router = useRouter();
  const [value, setValue] = useState(String(count));
  const [error, setError] = useState<SetupErrorKey | null>(null);
  const label = (g: number) => tGrades(`label_${g}`);

  async function save() {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0 || next > MAX_CLASSES_PER_GRADE) return setValue(String(count));
    if (next === count) return;
    setError(null);
    const res = await api.setClassCount(boardId, grade, next);
    if (!res.ok) {
      setValue(String(count));
      return setError(res.error === "inUse" ? "inUse" : res.error);
    }
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
      <label className="flex items-center gap-3 text-sm">
        <span className="w-14 font-semibold">{t("classes.grade", { grade: label(grade) })}</span>
        <input type="number" min={0} max={MAX_CLASSES_PER_GRADE} value={value} inputMode="numeric"
          aria-label={t("classes.count", { grade: label(grade) })}
          onChange={(e) => setValue(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          className="h-8 w-16 rounded-md border border-neutral-300 px-2 text-center tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" />
      </label>
      {count === 0 && <span className="text-sm text-neutral-600">{t("classes.none")}</span>}
      {error && (
        <p role="alert" className="w-full text-sm text-red-700">
          {error === "inUse" ? t("classes.inUse") : t(`errors.${error}`)}
        </p>
      )}
      {count > 0 && (
        <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2">
          {classes.map((klass) => (
            <ClassFields key={`${klass.id}:${klass.name}:${klass.kind}`} boardId={boardId} klass={klass}
              defaultName={className({ grade: klass.grade, number: klass.number }, label)} kindsId={kindsId} />
          ))}
        </div>
      )}
    </li>
  );
}

const FIELD = "h-8 min-w-0 rounded-md border border-neutral-200 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500";

/** A class's name (placeholder = the default "ז1") and type, each saved on blur. */
function ClassFields({ boardId, klass, defaultName, kindsId }: { boardId: string; klass: TtClass; defaultName: string; kindsId: string }) {
  const t = useTranslations("timetable.setup");
  const router = useRouter();
  const [name, setName] = useState(klass.name ?? "");
  const [kind, setKind] = useState(klass.kind ?? "");
  const [error, setError] = useState<SetupErrorKey | null>(null);
  const shown = klass.name || defaultName;

  async function save(patch: { name?: string; kind?: string }) {
    const field = "name" in patch ? "name" : "kind";
    const next = (patch[field] ?? "").trim();
    if (next === (klass[field] ?? "")) return;
    const res = await api.updateClass(boardId, klass.id, { [field]: next || null });
    if (!res.ok) {
      setName(klass.name ?? "");
      setKind(klass.kind ?? "");
      return setError(res.error);
    }
    setError(null);
    router.refresh();
  }

  const enterBlurs = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") e.currentTarget.blur(); };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <input value={name} placeholder={defaultName} maxLength={MAX_NAME_LENGTH} aria-label={t("classes.name", { class: shown })}
          onChange={(e) => setName(e.target.value)} onBlur={() => save({ name })} onKeyDown={enterBlurs}
          className={`${FIELD} w-20 font-medium`} />
        <input value={kind} list={kindsId} placeholder={t("classes.kindPlaceholder")} maxLength={MAX_CLASS_KIND_LENGTH}
          aria-label={t("classes.kind", { class: shown })}
          onChange={(e) => setKind(e.target.value)} onBlur={() => save({ kind })} onKeyDown={enterBlurs}
          className={`${FIELD} flex-1`} />
      </div>
      {error && <p role="alert" className="text-xs text-red-700">{t(`errors.${error}`)}</p>}
    </div>
  );
}
