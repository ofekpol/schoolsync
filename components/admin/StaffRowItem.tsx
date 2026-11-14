"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, KeyRound, Pencil, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleBadge, ScopeChips, StaffAvatar } from "@/components/admin/staff-ui";
import { cn } from "@/lib/utils";

export interface StaffRow {
  id: string;
  email: string;
  fullName: string;
  role: "editor" | "admin" | "viewer";
  deactivatedAt: Date | string | null;
  gradeScopes: number[];
  eventTypeScopes: string[];
}

const pillClass = "rounded-full px-2 py-0.5 text-xs whitespace-nowrap ring-1 ring-inset";

/**
 * One staff member. Collapsed: identity, role and a short summary of labels and permissions.
 * Expanded: a labels section and a permissions section, each with its own edit button.
 */
export function StaffRowItem({
  row,
  eventTypes,
  busyId,
  readOnly,
  labels,
  missingLabel,
  showLabels,
  onEdit,
  onEditLabels,
  onDeactivate,
}: {
  row: StaffRow;
  eventTypes: { key: string; labelHe: string }[];
  busyId: string | null;
  readOnly: boolean;
  /** The staff member's profile labels, already named and ordered. */
  labels: string[];
  /** A required category has no label for this (active) staff member. */
  missingLabel: boolean;
  /** The school has profile categories: show the labels section. */
  showLabels: boolean;
  onEdit: (id: string) => void;
  /** Absent when labels can't be edited here: no labels button is shown. */
  onEditLabels?: (id: string) => void;
  onDeactivate: (id: string, deactivated: boolean) => void;
}) {
  const t = useTranslations("admin.staff");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const deactivated = Boolean(row.deactivatedAt);

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("details.toggle", { name: row.fullName })}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 p-4 text-start transition-colors hover:bg-neutral-50/70 focus-visible:bg-neutral-50 focus-visible:outline-none md:gap-4"
      >
        <StaffAvatar name={row.fullName} email={row.email} role={row.role} muted={deactivated} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={deactivated ? "font-medium text-neutral-500" : "font-medium text-neutral-950"}>
              {row.fullName}
            </span>
            {deactivated && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                {t("deactivated")}
              </span>
            )}
          </div>
          {/* LTR box so a long address is cut at its end; text-end keeps it on the RTL reading edge. */}
          <div dir="ltr" className="truncate text-end text-sm text-neutral-500">
            {row.email}
          </div>
          <RowSummary
            row={row}
            labelCount={labels.length}
            missingLabel={missingLabel}
            showLabels={showLabels}
          />
        </div>
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 text-neutral-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div id={panelId} className="space-y-3 border-t border-neutral-100 bg-neutral-50/60 p-4">
          <div className={cn("grid gap-3", showLabels && "md:grid-cols-2")}>
            {showLabels && (
              <DetailSection
                icon={<Tags className="size-4" aria-hidden />}
                title={t("labels.column")}
                action={
                  !readOnly && onEditLabels && !deactivated ? (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t("labels.editFor", { name: row.fullName })}
                      onClick={() => onEditLabels(row.id)}
                      disabled={busyId !== null}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      {t("edit")}
                    </Button>
                  ) : null
                }
              >
                <LabelChips labels={labels} missingLabel={missingLabel} />
              </DetailSection>
            )}
            <DetailSection
              icon={<KeyRound className="size-4" aria-hidden />}
              title={t("details.permissions")}
              action={
                readOnly ? null : (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`${t("edit")} ${row.fullName}`}
                    onClick={() => onEdit(row.id)}
                    disabled={busyId !== null}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    {t("edit")}
                  </Button>
                )
              }
            >
              <div className="space-y-2">
                <RoleBadge role={row.role} />
                <ScopeChips
                  role={row.role}
                  gradeScopes={row.gradeScopes}
                  eventTypeScopes={row.eventTypeScopes}
                  eventTypes={eventTypes}
                />
              </div>
            </DetailSection>
          </div>
          {!readOnly && (
            <StatusButton
              row={row}
              busyId={busyId}
              onDeactivate={onDeactivate}
            />
          )}
        </div>
      )}
    </li>
  );
}

/** Collapsed-row line: role, how many labels, and how much access. */
function RowSummary({
  row,
  labelCount,
  missingLabel,
  showLabels,
}: {
  row: StaffRow;
  labelCount: number;
  missingLabel: boolean;
  showLabels: boolean;
}) {
  const t = useTranslations("admin.staff");
  const scopeCount = row.gradeScopes.length + row.eventTypeScopes.length;
  let access: string;
  if (row.role === "admin") access = t("fullAccess");
  else if (row.role === "viewer") access = t("viewOnly");
  else if (scopeCount === 0) access = t("details.noScopes");
  else access = t("details.scopeCount", { count: scopeCount });

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <RoleBadge role={row.role} />
      <span className={cn(pillClass, "inline-flex items-center gap-1 bg-white text-neutral-700 ring-neutral-200")}>
        <KeyRound className="size-3" aria-hidden />
        {access}
      </span>
      {showLabels && labelCount > 0 && (
        <span className={cn(pillClass, "inline-flex items-center gap-1 bg-sky-50 text-sky-900 ring-sky-200")}>
          <Tags className="size-3" aria-hidden />
          {t("details.labelCount", { count: labelCount })}
        </span>
      )}
      {missingLabel && (
        <span className={cn(pillClass, "bg-amber-50 text-amber-900 ring-amber-300")}>
          {t("labels.missingRequired")}
        </span>
      )}
    </div>
  );
}

function DetailSection({
  icon,
  title,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-800">
          <span className="text-neutral-500">{icon}</span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function LabelChips({ labels, missingLabel }: { labels: string[]; missingLabel: boolean }) {
  const t = useTranslations("admin.staff");
  if (labels.length === 0 && !missingLabel) {
    return <p className="text-xs text-neutral-400">{t("details.noLabels")}</p>;
  }
  return (
    <ul aria-label={t("labels.column")} className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <li key={label} className={cn(pillClass, "bg-sky-50 text-sky-900 ring-sky-200")}>
          {label}
        </li>
      ))}
      {missingLabel && (
        <li className={cn(pillClass, "bg-amber-50 text-amber-900 ring-amber-300")}>
          {t("labels.missingRequired")}
        </li>
      )}
    </ul>
  );
}

function StatusButton({
  row,
  busyId,
  onDeactivate,
}: {
  row: StaffRow;
  busyId: string | null;
  onDeactivate: (id: string, deactivated: boolean) => void;
}) {
  const t = useTranslations("admin.staff");
  const tc = useTranslations("common");
  const deactivated = Boolean(row.deactivatedAt);
  const statusAction = deactivated ? t("reactivate") : t("deactivate");
  return (
    <div className="flex justify-end">
      <Button
        variant="ghost"
        size="sm"
        className={deactivated ? "text-emerald-700 hover:text-emerald-800" : "text-neutral-500 hover:text-red-700"}
        aria-label={`${statusAction} ${row.fullName}`}
        onClick={() => onDeactivate(row.id, !deactivated)}
        disabled={busyId !== null}
      >
        {busyId === row.id ? tc("loading") : statusAction}
      </Button>
    </div>
  );
}
