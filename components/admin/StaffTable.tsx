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
}

const filterClass =
  "h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none transition focus:border-violet-500 focus:ring-3 focus:ring-violet-100";

export function StaffTable({ initialStaff, eventTypes, readOnly = false }: Props) {
  const t = useTranslations("admin.staff");
  const router = useRouter();
  const startRouteProgress = useRouteProgress();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<StaffRow["role"] | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "deactivated">("active");

  const filteredStaff = initialStaff.filter((staff) => {
    const haystack =
      `${staff.email} ${staff.fullName} ${roleLabel(staff.role)} ${scopeLabel(staff)}`.toLocaleLowerCase(
        "he-IL",
      );
    const matchesQuery = haystack.includes(query.trim().toLocaleLowerCase("he-IL"));
    const matchesRole = roleFilter === "all" || staff.role === roleFilter;
    const status = staff.deactivatedAt ? "deactivated" : "active";
    return matchesQuery && matchesRole && (statusFilter === "all" || statusFilter === status);
  });
  const editingRow = initialStaff.find((staff) => staff.id === editingId) ?? null;

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
    </div>
  );
}
