"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search, UserRoundX } from "lucide-react";
import { formatGradeLabel } from "@/lib/grades";
import { useRouteProgress } from "@/components/RouteProgress";
import { ALL_GRADES, EditStaffForm } from "@/components/admin/StaffEditForm";
import { StaffRowItem, type StaffRow } from "@/components/admin/StaffRowItem";
import { StaffDialog } from "@/components/admin/staff-ui";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { labelNames, matchesLabelFilter, missesRequired, type LabelFilter } from "@/lib/profile/labels";
import type { ProfileCategory } from "@/lib/validations/profile";

interface EventTypeRow {
  id: string;
  key: string;
  labelHe: string;
  labelEn: string;
}
interface Props {
  initialStaff: StaffRow[];
  eventTypes: EventTypeRow[];
  /** Demo schools: list only, no edit/deactivate controls. */
  readOnly?: boolean;
  /** The school's profile categories; empty = no label column, filter or button. */
  categories?: ProfileCategory[];
  /** staffUserId -> option ids held (active staff only). */
  labels?: Record<string, string[]>;
}

const NO_CATEGORIES: ProfileCategory[] = [];
const NO_LABELS: Record<string, string[]> = {};

const filterClass =
  "h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none transition focus:border-violet-500 focus:ring-3 focus:ring-violet-100";

export function StaffTable({
  initialStaff,
  eventTypes,
  readOnly = false,
  categories = NO_CATEGORIES,
  labels = NO_LABELS,
}: Props) {
  const t = useTranslations("admin.staff");
  const router = useRouter();
  const startRouteProgress = useRouteProgress();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<StaffRow["role"] | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "deactivated">("active");
  const [labelFilter, setLabelFilter] = useState<LabelFilter>("all");
  const [labelsEditingId, setLabelsEditingId] = useState<string | null>(null);

  const filteredStaff = initialStaff.filter((staff) => {
    const haystack =
      `${staff.email} ${staff.fullName} ${roleLabel(staff.role)} ${scopeLabel(staff)}`.toLocaleLowerCase(
        "he-IL",
      );
    const matchesQuery = haystack.includes(query.trim().toLocaleLowerCase("he-IL"));
    const matchesRole = roleFilter === "all" || staff.role === roleFilter;
    const status = staff.deactivatedAt ? "deactivated" : "active";
    // Deactivated staff hold no listed labels, so any label filter leaves them out.
    const matchesLabel =
      labelFilter === "all" ||
      (status === "active" && matchesLabelFilter(labelFilter, categories, labels[staff.id] ?? []));
    return (
      matchesQuery && matchesRole && matchesLabel && (statusFilter === "all" || statusFilter === status)
    );
  });
  const editingRow = initialStaff.find((staff) => staff.id === editingId) ?? null;
  const labelsRow = initialStaff.find((staff) => staff.id === labelsEditingId) ?? null;

  async function handleDeactivate(id: string, deactivated: boolean) {
    setBusyId(id);
    const res = await fetch(`/api/v1/admin/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deactivated }),
    });
    setBusyId(null);
    if (res.ok) {
      startRouteProgress(2500);
      router.refresh();
    }
  }

  async function handleSave(row: StaffRow, form: FormData) {
    setError(null);
    setBusyId(row.id);
    const role = String(form.get("role") ?? row.role) as StaffRow["role"];
    const gradeScopes =
      role === "editor"
        ? ALL_GRADES.filter((g) => form.get(`staff-grade-${row.id}-${g}`) === "on")
        : [];
    const eventTypeScopes =
      role === "editor"
        ? eventTypes
            .filter((et) => form.get(`staff-type-${row.id}-${et.key}`) === "on")
            .map((et) => et.key)
        : [];
    const res = await fetch(`/api/v1/admin/staff/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: String(form.get("fullName") ?? row.fullName).trim(),
        role,
        gradeScopes,
        eventTypeScopes,
      }),
    });
    setBusyId(null);
    if (res.ok) {
      setEditingId(null);
      startRouteProgress(2500);
      router.refresh();
      return;
    }
    setError(t("createError"));
  }

  function roleLabel(role: StaffRow["role"]) {
    if (role === "admin") return t("roleAdmin");
    if (role === "viewer") return t("roleViewer");
    return t("roleEditor");
  }

  /** Plain-text scopes, used only to make permissions searchable. */
  function scopeLabel(row: StaffRow) {
    if (row.role !== "editor") return "";
    const grades = row.gradeScopes.map(formatGradeLabel);
    const types = eventTypes
      .filter((et) => row.eventTypeScopes.includes(et.key))
      .map((et) => et.labelHe);
    return [...grades, ...types].join(" ");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchStaff")}
            aria-label={t("searchStaff")}
            className={`${filterClass} w-full ps-9`}
          />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as StaffRow["role"] | "all")}
            aria-label={t("filterByRole")}
            className={filterClass}
          >
            <option value="all">{t("allRoles")}</option>
            <option value="admin">{t("roleAdmin")}</option>
            <option value="editor">{t("roleEditor")}</option>
            <option value="viewer">{t("roleViewer")}</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | "active" | "deactivated")
            }
            aria-label={t("filterByStatus")}
            className={filterClass}
          >
            <option value="active">{t("activeOnly")}</option>
            <option value="deactivated">{t("deactivatedOnly")}</option>
            <option value="all">{t("allStatuses")}</option>
          </select>
          {categories.length > 0 && (
            <select
              value={labelFilter}
              onChange={(event) => setLabelFilter(event.target.value)}
              aria-label={t("labels.filter")}
              className={`${filterClass} col-span-2`}
            >
              <option value="all">{t("labels.all")}</option>
              <option value="missing">{t("labels.missingRequired")}</option>
              {categories.map((category) => (
                <optgroup key={category.id} label={category.name}>
                  {category.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      </div>

      {filteredStaff.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">
          <UserRoundX className="size-6 text-neutral-400" aria-hidden />
          {t("noStaffMatches")}
        </div>
      ) : (
        <ul
          aria-label={t("staffListLabel")}
          className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white"
        >
          {filteredStaff.map((s) => (
            <StaffRowItem
              key={s.id}
              row={s}
              eventTypes={eventTypes}
              busyId={busyId}
              readOnly={readOnly}
              labels={labelNames(categories, labels[s.id] ?? [])}
              missingLabel={!s.deactivatedAt && missesRequired(categories, labels[s.id] ?? [])}
              showLabels={categories.length > 0}
              onEditLabels={categories.length > 0 ? setLabelsEditingId : undefined}
              onEdit={(id) => {
                setError(null);
                setEditingId(id);
              }}
              onDeactivate={handleDeactivate}
            />
          ))}
        </ul>
      )}

      {editingRow && (
        <StaffDialog
          titleId="edit-staff-title"
          title={t("editUserTitle")}
          subtitle={editingRow.email}
          closeLabel={t("cancel")}
          onClose={() => setEditingId(null)}
        >
          <EditStaffForm
            row={editingRow}
            eventTypes={eventTypes}
            busy={busyId === editingRow.id}
            error={error}
            onCancel={() => setEditingId(null)}
            onSave={handleSave}
          />
        </StaffDialog>
      )}

      {labelsRow && (
        <StaffDialog
          titleId="edit-labels-title"
          title={t("labels.editTitle")}
          subtitle={labelsRow.fullName}
          closeLabel={t("cancel")}
          onClose={() => setLabelsEditingId(null)}
        >
          <ProfileForm
            categories={categories}
            selected={labels[labelsRow.id] ?? []}
            submitUrl={`/api/v1/admin/staff/${labelsRow.id}/labels`}
            onSaved={() => {
              setLabelsEditingId(null);
              startRouteProgress(2500);
              router.refresh();
            }}
          />
        </StaffDialog>
      )}
    </div>
  );
}
