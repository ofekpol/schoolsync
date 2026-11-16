"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { TtConstraint } from "@/lib/timetable/constraints/crud";
import { MAX_MEETING_PERIODS, MAX_SUBJECT_PER_DAY, MAX_WEIGHT } from "@/lib/timetable/constraints/limits";
import { CONSTRAINT_TYPES, ConstraintInputSchema, type ConstraintInput, type ConstraintType } from "@/lib/timetable/constraints/registry";
import type { Target } from "@/lib/timetable/constraints/target";
import type { Week } from "@/lib/timetable/week";
import type { ProfileCategory } from "@/lib/validations/profile";
import type { ConstraintErrorKey } from "./api";
import { TargetPicker, type PickerTeacher } from "./TargetPicker";

export interface FormTeacher extends PickerTeacher {
  freeDayEntitled: boolean;
}

interface Props {
  type: ConstraintType;
  initial: TtConstraint | null;
  teachers: FormTeacher[];
  categories: ProfileCategory[];
  labels: Record<string, string[]>;
  week: Week;
  onSave: (input: ConstraintInput) => Promise<ConstraintErrorKey | null>;
  onCancel: () => void;
}

type Params = Record<string, unknown>;

function defaults(type: ConstraintType, week: Week): Params {
  const day = week.days[0]?.day ?? 0;
  const target: Target = { kind: "teachers", teacherIds: [] };
  if (type === "teacher_free_day") return { day };
  if (type === "teacher_unavailable") return { target, day };
  if (type === "meeting") return { target, weeklyPeriods: 2, consecutive: true };
  if (type === "subject_max_per_day") return { max: 2 };
  return {};
}

/** The form for one constraint type: its fields, hard or soft (when the type allows both), and weight. */
export function ConstraintForm({ type, initial, teachers, categories, labels, week, onSave, onCancel }: Props) {
  const t = useTranslations("timetable.constraints");
  const def = CONSTRAINT_TYPES[type];
  const [params, setParams] = useState<Params>((initial?.params as Params) ?? defaults(type, week));
  const [hard, setHard] = useState(initial?.hard ?? def.hardness !== "soft");
  const [weight, setWeight] = useState(initial?.weight ?? def.defaultWeight);
  const [teacherId, setTeacherId] = useState(initial?.teacherId ?? teachers.find((x) => x.freeDayEntitled)?.id ?? "");
  const [error, setError] = useState<ConstraintErrorKey | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Params) => setParams((p) => ({ ...p, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = ConstraintInputSchema.safeParse({
      type, hard, weight: hard ? def.defaultWeight : weight, params,
      ...(def.perTeacher ? { teacherId } : {}),
    });
    if (!parsed.success) return setError("invalid");
    setBusy(true);
    setError(await onSave(parsed.data));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} aria-label={t(`types.${type}`)} className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <h3 className="font-semibold">{t(`types.${type}`)}</h3>
      {type === "teacher_free_day" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("fields.teacher")}</span>
          <select value={teacherId} disabled={initial !== null} onChange={(e) => setTeacherId(e.target.value)}
            className="h-9 w-64 rounded-lg border border-neutral-300 bg-white px-2">
            {teachers.filter((x) => x.freeDayEntitled).map((x) => <option key={x.id} value={x.id}>{x.fullName}</option>)}
          </select>
        </label>
      )}
      {"target" in params && (
        <TargetPicker teachers={teachers} categories={categories} labels={labels}
          value={params.target as Target} onChange={(target) => set({ target })} />
      )}
      <TypeFields type={type} params={params} week={week} set={set} />
      <Hardness hardness={def.hardness} hard={hard} weight={weight} setHard={setHard} setWeight={setWeight} />
      {error && <p role="alert" className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{t("save")}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("cancel")}</Button>
      </div>
    </form>
  );
}

function TypeFields({ type, params, week, set }: { type: ConstraintType; params: Params; week: Week; set: (p: Params) => void }) {
  const t = useTranslations("timetable.constraints");
  const field = "flex flex-col gap-1 text-sm";
  const input = "h-9 w-20 rounded-lg border border-neutral-300 px-2 text-center tabular-nums";
  const day = typeof params.day === "number" ? params.day : null;
  const periodCount = week.days.find((d) => d.day === day)?.periods.length ?? 0;
  const periods = params.periods as number[] | undefined;
  return (
    <div className="flex flex-wrap items-start gap-4">
      {day !== null && (
        <label className={field}>
          <span className="font-medium">{t("fields.day")}</span>
          <select value={day} onChange={(e) => set({ day: Number(e.target.value), periods: undefined })}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-2">
            {week.days.map((d) => <option key={d.day} value={d.day}>{t(`days.${d.day}`)}</option>)}
          </select>
        </label>
      )}
      {type === "teacher_unavailable" && (
        <fieldset className="text-sm">
          <legend className="mb-1 font-medium">{t("fields.periods")}</legend>
          <label className="me-3 inline-flex items-center gap-1.5">
            <input type="checkbox" checked={!periods} className="accent-violet-600"
              onChange={(e) => set({ periods: e.target.checked ? undefined : [1] })} />
            {t("fields.allDay")}
          </label>
          {periods && Array.from({ length: periodCount }, (_, i) => i + 1).map((p) => (
            <label key={p} className="me-2 inline-flex items-center gap-1">
              <input type="checkbox" checked={periods.includes(p)} className="accent-violet-600"
                onChange={() => set({ periods: periods.includes(p) ? periods.filter((x) => x !== p) : [...periods, p].sort((a, b) => a - b) })} />
              {p}
            </label>
          ))}
        </fieldset>
      )}
      {type === "meeting" && (
        <>
          <label className={field}>
            <span className="font-medium">{t("fields.weeklyPeriods")}</span>
            <input type="number" min={1} max={MAX_MEETING_PERIODS} value={params.weeklyPeriods as number} className={input}
              onChange={(e) => set({ weeklyPeriods: Number(e.target.value) })} />
          </label>
          <label className="mt-6 flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={params.consecutive as boolean} className="accent-violet-600"
              onChange={(e) => set({ consecutive: e.target.checked })} />
            {t("fields.consecutive")}
          </label>
        </>
      )}
      {type === "subject_max_per_day" && (
        <label className={field}>
          <span className="font-medium">{t("fields.max")}</span>
          <input type="number" min={1} max={MAX_SUBJECT_PER_DAY} value={params.max as number} className={input}
            onChange={(e) => set({ max: Number(e.target.value) })} />
        </label>
      )}
    </div>
  );
}

function Hardness({ hardness, hard, weight, setHard, setWeight }: {
  hardness: "hard" | "soft" | "either";
  hard: boolean;
  weight: number;
  setHard: (hard: boolean) => void;
  setWeight: (weight: number) => void;
}) {
  const t = useTranslations("timetable.constraints");
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      {hardness === "either" ? (
        <>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={hard} onChange={() => setHard(true)} className="accent-violet-600" />
            {t("hard")}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={!hard} onChange={() => setHard(false)} className="accent-violet-600" />
            {t("soft")}
          </label>
        </>
      ) : (
        <span className="text-neutral-600">{t(hardness === "hard" ? "hard" : "soft")}</span>
      )}
      {!hard && (
        <label className="flex items-center gap-2">
          {t("fields.weight")}
          <input type="number" min={1} max={MAX_WEIGHT} value={weight} onChange={(e) => setWeight(Number(e.target.value))}
            className="h-8 w-16 rounded-lg border border-neutral-300 px-2 text-center tabular-nums" />
        </label>
      )}
    </div>
  );
}
