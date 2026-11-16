"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TtTeacher } from "@/lib/timetable/teachers";
import { MAX_NAME_LENGTH } from "@/lib/validations/timetable";
import * as api from "./api";
import type { SetupErrorKey } from "./api";
import { AddFromStaffDialog, type StaffChoice } from "./AddFromStaffDialog";
import { PasteNamesDialog } from "./PasteNamesDialog";
import type { ProfileCategory } from "@/lib/validations/profile";

interface Props {
  boardId: string;
  teachers: TtTeacher[];
  /** Active staff of the school (for names of linked teachers and "add from staff"). */
  staff: StaffChoice[];
  categories: ProfileCategory[];
  labels: Record<string, string[]>;
}

/** The board's teachers: name, linked staff user, free-day entitlement; paste or add from staff. */
export function TeachersTab({ boardId, teachers, staff, categories, labels }: Props) {
  const t = useTranslations("timetable.setup");
  const router = useRouter();
  const [error, setError] = useState<SetupErrorKey | null>(null);
  const linked = new Set(teachers.flatMap((teacher) => (teacher.staffUserId ? [teacher.staffUserId] : [])));
  const staffNames = new Map(staff.map((member) => [member.id, member.fullName]));

  async function run(call: Promise<api.ApiResult<unknown>>) {
    setError(null);
    const res = await call;
    if (!res.ok) {
      setError(res.error);
      throw new Error(res.error);
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">{t("teachers.count", { count: teachers.length })}</p>
        <div className="flex flex-wrap gap-2">
          <PasteNamesDialog title={t("paste.open")} onSubmit={(names) => run(api.addTeachers(boardId, names))} />
          <AddFromStaffDialog staff={staff.filter((member) => !linked.has(member.id))}
            categories={categories} labels={labels}
            onSubmit={(ids) => run(api.addTeachersFromStaff(boardId, ids))} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{t(`errors.${error}`)}</p>}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t("teachers.name")}</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t("teachers.staffUser")}</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t("teachers.freeDay")}</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">{t("delete")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {teachers.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-500">{t("teachers.empty")}</td></tr>
            )}
            {teachers.map((teacher) => (
              <TeacherRow key={teacher.id} boardId={boardId} teacher={teacher}
                staffName={teacher.staffUserId ? staffNames.get(teacher.staffUserId) : undefined} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeacherRow({ boardId, teacher, staffName }: { boardId: string; teacher: TtTeacher; staffName?: string }) {
  const t = useTranslations("timetable.setup");
  const router = useRouter();
  const [name, setName] = useState(teacher.fullName);
  const [error, setError] = useState<SetupErrorKey | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function patch(change: { fullName?: string; freeDayEntitled?: boolean }) {
    const res = await api.updateTeacher(boardId, teacher.id, change);
    if (!res.ok) {
      setName(teacher.fullName);
      return setError(res.error);
    }
    setError(null);
    router.refresh();
  }

  async function remove() {
    const res = await api.deleteTeacher(boardId, teacher.id);
    setConfirming(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  function rename() {
    const next = name.trim();
    if (next.length === 0 || next === teacher.fullName) return setName(teacher.fullName);
    void patch({ fullName: next });
  }

  return (
    <tr>
      <td className="px-3 py-1">
        <input value={name} maxLength={MAX_NAME_LENGTH} aria-label={t("teachers.rename", { name: teacher.fullName })}
          onChange={(e) => setName(e.target.value)} onBlur={rename}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className="h-8 w-full min-w-40 rounded-md border border-transparent px-2 hover:border-neutral-200 focus-visible:border-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" />
        {error && <p role="alert" className="ps-2 text-xs text-red-700">{t(`errors.${error}`)}</p>}
      </td>
      <td className="px-3 py-1 text-neutral-600">{staffName ?? (teacher.staffUserId ? t("teachers.linked") : "—")}</td>
      <td className="px-3 py-1">
        <input type="checkbox" checked={teacher.freeDayEntitled}
          aria-label={t("teachers.freeDayFor", { name: teacher.fullName })}
          onChange={(e) => void patch({ freeDayEntitled: e.target.checked })}
          className="size-4 accent-violet-600" />
      </td>
      <td className="px-3 py-1 text-end">
        {confirming ? (
          <span className="inline-flex items-center gap-1">
            <Button type="button" size="sm" variant="destructive" onClick={remove}>{t("delete")}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t("cancel")}</Button>
          </span>
        ) : (
          <Button type="button" size="icon" variant="ghost" onClick={() => setConfirming(true)}
            aria-label={t("deleteNamed", { name: teacher.fullName })}>
            <Trash2 aria-hidden className="size-4" />
          </Button>
        )}
      </td>
    </tr>
  );
}
