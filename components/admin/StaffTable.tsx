"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Filter, Search, ShieldCheck, UserCheck, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatGradeLabel } from "@/lib/grades";
import { useRouteProgress } from "@/components/RouteProgress";
import { cn } from "@/lib/utils";
import { ALL_GRADES, EditStaffForm } from "@/components/admin/StaffEditForm";
import { StaffMobileList } from "@/components/admin/StaffMobileList";

interface StaffRow {
  id: string;
  email: string;
  fullName: string;
  role: "editor" | "admin" | "viewer";
  deactivatedAt: Date | string | null;
  gradeScopes: number[];
  eventTypeScopes: string[];
}

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

export function StaffTable({ initialStaff, eventTypes, readOnly = false }: Props) {
  const t = useTranslations("admin.staff");
  const tc = useTranslations("common");
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

  useEffect(() => {
    if (!editingId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setEditingId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId]);

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

  function scopeLabel(row: StaffRow) {
    if (row.role === "admin") return t("roleAdmin");
    if (row.role === "viewer") return t("roleViewer");
    const grades = row.gradeScopes.map(formatGradeLabel);
    const types = eventTypes
      .filter((et) => row.eventTypeScopes.includes(et.key))
      .map((et) => et.labelHe);
    return [...grades, ...types].join(", ") || "—";
  }

  return (
    <div className="sg-staff-card overflow-hidden rounded-xl border bg-white">
      <div className="grid gap-3 border-b border-violet-100 bg-[var(--sg-studio-violet-soft)] p-4 lg:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchStaff")}
            aria-label={t("searchStaff")}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white ps-10 pe-3 text-sm transition outline-none focus:border-neutral-900 focus:ring-3 focus:ring-neutral-200"
          />
        </label>
        <label className="flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3">
          <Users className="size-4 text-neutral-500" />
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as StaffRow["role"] | "all")}
            aria-label={t("filterByRole")}
            className="h-10 bg-transparent text-sm outline-none"
          >
            <option value="all">{t("allRoles")}</option>
            <option value="admin">{t("roleAdmin")}</option>
            <option value="editor">{t("roleEditor")}</option>
            <option value="viewer">{t("roleViewer")}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3">
          <Filter className="size-4 text-neutral-500" />
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | "active" | "deactivated")
            }
            aria-label={t("filterByStatus")}
            className="h-10 bg-transparent text-sm outline-none"
          >
            <option value="all">{t("allStatuses")}</option>
            <option value="active">{t("active")}</option>
            <option value="deactivated">{t("deactivated")}</option>
          </select>
        </label>
      </div>

      <StaffMobileList
        staff={filteredStaff}
        labels={{
          list: t("mobileListLabel"),
          scopes: t("scopes"),
          edit: t("edit"),
          active: t("active"),
          deactivated: t("deactivated"),
          reactivate: t("reactivate"),
          deactivate: t("deactivate"),
          loading: tc("loading"),
        }}
        roleLabel={roleLabel}
        scopeLabel={scopeLabel}
        busyId={busyId}
        onEdit={(id) => {
          setError(null);
          setEditingId(id);
        }}
        onDeactivate={handleDeactivate}
        readOnly={readOnly}
      />

      <div className="hidden max-h-[620px] overflow-auto md:block">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="sticky top-0 z-10 bg-white text-xs font-semibold text-neutral-500 uppercase shadow-[0_1px_0_var(--color-border)]">
            <tr className="border-b border-neutral-200">
              <th className="py-3 ps-4 pe-4 text-start">{t("staffMember")}</th>
              <th className="py-3 pe-4 text-start">{t("role")}</th>
              <th className="py-3 pe-4 text-start">{t("status")}</th>
              <th className="py-3 pe-4 text-start">{t("scopes")}</th>
              {!readOnly && <th className="py-3 pe-4 text-start">{t("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {filteredStaff.map((s) => (
              <tr
                key={s.id}
                className="border-b border-neutral-100 align-top transition hover:bg-neutral-50"
              >
                <td className="py-4 ps-4 pe-4">
                  <div className="font-medium text-neutral-950">{s.fullName}</div>
                  <div className="mt-1 text-xs text-neutral-500">{s.email}</div>
                </td>
                <td className="py-4 pe-4">
                  <RoleBadge role={s.role} label={roleLabel(s.role)} />
                </td>
                <td className="py-4 pe-4">
                  <StatusBadge
                    active={!s.deactivatedAt}
                    activeLabel={t("active")}
                    deactivatedLabel={t("deactivated")}
                  />
                </td>
                <td className="max-w-[320px] py-4 pe-4 text-neutral-700">{scopeLabel(s)}</td>
                {!readOnly && (
                <td className="py-4 pe-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setError(null);
                        setEditingId(s.id);
                      }}
                      disabled={busyId !== null}
                    >
                      {t("edit")}
                    </Button>
                    {s.deactivatedAt ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeactivate(s.id, false)}
                        disabled={busyId !== null}
                      >
                        {busyId === s.id ? tc("loading") : t("reactivate")}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeactivate(s.id, true)}
                        disabled={busyId !== null}
                      >
                        {busyId === s.id ? tc("loading") : t("deactivate")}
                      </Button>
                    )}
                  </div>
                </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredStaff.length === 0 && (
        <div className="px-4 py-10 text-center text-sm text-neutral-500">{t("noStaffMatches")}</div>
      )}
      {editingRow && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-staff-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditingId(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-neutral-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="edit-staff-title" className="text-lg font-semibold text-neutral-950">
                  {t("editUserTitle")}
                </h3>
                <p className="mt-1 text-sm break-all text-neutral-600">{editingRow.email}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setEditingId(null)}
                aria-label={t("cancel")}
              >
                <X className="size-4" />
              </Button>
            </div>

            <EditStaffForm
              row={editingRow}
              eventTypes={eventTypes}
              busy={busyId === editingRow.id}
              error={error}
              onCancel={() => setEditingId(null)}
              onSave={handleSave}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role, label }: { role: StaffRow["role"]; label: string }) {
  const Icon = role === "admin" ? ShieldCheck : role === "editor" ? UserCheck : Users;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700">
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

function StatusBadge(props: { active: boolean; activeLabel: string; deactivatedLabel: string }) {
  const { active, activeLabel, deactivatedLabel } = props;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
        active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600",
      )}
    >
      {active ? activeLabel : deactivatedLabel}
    </span>
  );
}
