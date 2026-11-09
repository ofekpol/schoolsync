"use client";

import { ShieldCheck, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StaffRow {
  id: string;
  email: string;
  fullName: string;
  role: "editor" | "admin" | "viewer";
  deactivatedAt: Date | string | null;
  gradeScopes: number[];
  eventTypeScopes: string[];
}

interface Labels {
  list: string;
  scopes: string;
  edit: string;
  active: string;
  deactivated: string;
  reactivate: string;
  deactivate: string;
  loading: string;
}

export function StaffMobileList({
  staff,
  labels,
  roleLabel,
  scopeLabel,
  busyId,
  onEdit,
  onDeactivate,
  readOnly = false,
}: {
  staff: StaffRow[];
  labels: Labels;
  roleLabel: (role: StaffRow["role"]) => string;
  scopeLabel: (row: StaffRow) => string;
  busyId: string | null;
  onEdit: (id: string) => void;
  onDeactivate: (id: string, deactivated: boolean) => void;
  readOnly?: boolean;
}) {
  return (
    <div aria-label={labels.list} className="divide-y divide-neutral-100 p-3 md:hidden">
      {staff.map((s) => (
        <article key={s.id} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-medium break-words text-neutral-950">{s.fullName}</h3>
              <p className="mt-1 text-xs break-all text-neutral-500">{s.email}</p>
            </div>
            <StatusBadge
              active={!s.deactivatedAt}
              activeLabel={labels.active}
              deactivatedLabel={labels.deactivated}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <RoleBadge role={s.role} label={roleLabel(s.role)} />
          </div>
          <dl className="mt-4 grid gap-1.5 text-sm">
            <div>
              <dt className="text-xs font-medium text-neutral-500">{labels.scopes}</dt>
              <dd className="mt-1 text-neutral-700">{scopeLabel(s)}</dd>
            </div>
          </dl>
          {!readOnly && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label={`${labels.edit} ${s.fullName}`}
              onClick={() => onEdit(s.id)}
              disabled={busyId !== null}
            >
              {labels.edit}
            </Button>
            <StaffStatusButton
              row={s}
              labels={labels}
              busyId={busyId}
              onDeactivate={onDeactivate}
            />
          </div>
          )}
        </article>
      ))}
    </div>
  );
}

function StaffStatusButton({
  row,
  labels,
  busyId,
  onDeactivate,
}: {
  row: StaffRow;
  labels: Labels;
  busyId: string | null;
  onDeactivate: (id: string, deactivated: boolean) => void;
}) {
  const deactivated = Boolean(row.deactivatedAt);
  const label = deactivated ? labels.reactivate : labels.deactivate;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`${label} ${row.fullName}`}
      onClick={() => onDeactivate(row.id, !deactivated)}
      disabled={busyId !== null}
    >
      {busyId === row.id ? labels.loading : label}
    </Button>
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
