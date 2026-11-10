"use client";

import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleBadge, ScopeChips, StaffAvatar } from "@/components/admin/staff-ui";

export interface StaffRow {
  id: string;
  email: string;
  fullName: string;
  role: "editor" | "admin" | "viewer";
  deactivatedAt: Date | string | null;
  gradeScopes: number[];
  eventTypeScopes: string[];
}

/** One staff member: identity, role, permissions, and (for admins) edit / deactivate. */
export function StaffRowItem({
  row,
  eventTypes,
  busyId,
  readOnly,
  onEdit,
  onDeactivate,
}: {
  row: StaffRow;
  eventTypes: { key: string; labelHe: string }[];
  busyId: string | null;
  readOnly: boolean;
  onEdit: (id: string) => void;
  onDeactivate: (id: string, deactivated: boolean) => void;
}) {
  const t = useTranslations("admin.staff");
  const tc = useTranslations("common");
  const deactivated = Boolean(row.deactivatedAt);
  const statusAction = deactivated ? t("reactivate") : t("deactivate");

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 p-4 transition-colors hover:bg-neutral-50/70 md:grid-cols-[auto_minmax(0,1fr)_6.5rem_minmax(0,1fr)_auto] md:gap-x-4">
      <StaffAvatar name={row.fullName} email={row.email} role={row.role} muted={deactivated} />
      <div className="min-w-0">
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
      </div>

      {/* One wrapped line on phones; md:contents lets each child take its own desktop column. */}
      <div className="col-start-2 flex flex-wrap items-center gap-2 md:contents">
        <div>
          <RoleBadge role={row.role} />
        </div>
        <div>
          <ScopeChips
            role={row.role}
            gradeScopes={row.gradeScopes}
            eventTypeScopes={row.eventTypeScopes}
            eventTypes={eventTypes}
          />
        </div>
      </div>

      {!readOnly && (
        <div className="col-start-2 flex gap-2 md:col-start-auto md:justify-end">
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
      )}
    </li>
  );
}
