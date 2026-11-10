"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Clock, Inbox, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALL_GRADES, ScopeFields } from "@/components/admin/ScopeFields";
import {
  Field,
  RoleHint,
  StaffAvatar,
  StaffDialog,
  fieldClass,
} from "@/components/admin/staff-ui";

// Pinned locale + timezone so SSR (Node) and the client agree — a bare
// toLocaleString() uses each runtime's default locale and triggers a
// hydration mismatch.
const REQUESTED_AT_FMT = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  dateStyle: "short",
  timeStyle: "short",
});

interface PendingRow {
  id: string;
  email: string;
  fullName: string;
  requestedAt: Date | string;
}

interface EventTypeRow {
  key: string;
  labelHe: string;
}

export function PendingRequestsTable({
  pending,
  eventTypes,
}: {
  pending: PendingRow[];
  eventTypes: EventTypeRow[];
}) {
  const t = useTranslations("admin.staff");
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [approvalRole, setApprovalRole] = useState<"editor" | "admin" | "viewer">("viewer");

  async function approve(row: PendingRow, form: FormData) {
    if (busyId) return;
    setError(null);
    setBusyId(row.id);
    const role = String(form.get("role") ?? "viewer") as "editor" | "admin" | "viewer";
    const gradeScopes =
      role === "editor" ? ALL_GRADES.filter((g) => form.get(`grade-${g}`) === "on") : [];
    const eventTypeScopes =
      role === "editor"
        ? eventTypes.filter((et) => form.get(`type-${et.key}`) === "on").map((et) => et.key)
        : [];
    try {
      const res = await fetch("/api/v1/admin/staff/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          pendingId: row.id,
          fullName: String(form.get("fullName") ?? row.fullName),
          role,
          gradeScopes,
          eventTypeScopes,
        }),
      });
      if (res.ok) {
        setActiveId(null);
        setResolvedIds((prev) => new Set(prev).add(row.id));
        startTransition(() => router.refresh());
      } else {
        setError(t("createError"));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    if (busyId) return;
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch("/api/v1/admin/staff/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", pendingId: id }),
      });
      if (res.ok) {
        setResolvedIds((prev) => new Set(prev).add(id));
        startTransition(() => router.refresh());
      } else {
        setError(t("createError"));
      }
    } finally {
      setBusyId(null);
    }
  }

  const visible = pending
    .filter((p) => !resolvedIds.has(p.id))
    .filter((p) =>
      `${p.email} ${p.fullName}`
        .toLocaleLowerCase("he-IL")
        .includes(query.trim().toLocaleLowerCase("he-IL")),
    );
  const activeRow = pending.find((p) => p.id === activeId) ?? null;

  if (pending.filter((p) => !resolvedIds.has(p.id)).length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center">
        <Inbox className="size-7 text-neutral-400" aria-hidden />
        <p className="text-sm font-medium text-neutral-700">{t("noPendingRequests")}</p>
        <p className="max-w-sm text-xs text-neutral-500">{t("noPendingHint")}</p>
      </div>
    );
  }

  const busy = busyId !== null || isPending;
  return (
    <div className="space-y-3">
      <label className="relative block sm:max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPending")}
          aria-label={t("searchPending")}
          className={`${fieldClass} ps-9`}
        />
      </label>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-10 text-center text-sm text-neutral-500">
          {t("noPendingMatches")}
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {visible.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-4">
              <StaffAvatar name={row.fullName} email={row.email} role="viewer" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-neutral-950">{row.fullName}</div>
                <div className="truncate text-sm text-neutral-500">
                  <bdi>{row.email}</bdi>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                  <Clock className="size-3.5" aria-hidden />
                  {t("requestedAt")} {REQUESTED_AT_FMT.format(new Date(row.requestedAt))}
                </div>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  className="h-9 flex-1 gap-1.5 px-4 sm:flex-none"
                  onClick={() => {
                    setApprovalRole("viewer");
                    setActiveId(row.id);
                  }}
                  disabled={busy}
                >
                  <Check className="size-4" aria-hidden />
                  {t("approve")}
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 flex-1 text-neutral-600 hover:text-red-700 sm:flex-none"
                  onClick={() => reject(row.id)}
                  disabled={busy}
                >
                  {busyId === row.id ? `${t("reject")}…` : t("reject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && !activeRow && <p className="text-sm text-red-600">{error}</p>}

      {activeRow && (
        <StaffDialog
          titleId="approve-pending-title"
          title={t("approveUserTitle")}
          subtitle={activeRow.email}
          closeLabel={t("cancel")}
          onClose={() => setActiveId(null)}
        >
          <form
            action={(form) => {
              void approve(activeRow, form);
            }}
            className="mt-5 space-y-5"
          >
            <input type="hidden" name="pendingId" value={activeRow.id} />
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <Field label={t("fullName")}>
                <input
                  name="fullName"
                  defaultValue={activeRow.fullName}
                  className={fieldClass}
                  required
                />
              </Field>
              <Field label={t("role")}>
                <select
                  name="role"
                  value={approvalRole}
                  onChange={(event) =>
                    setApprovalRole(event.target.value as "editor" | "admin" | "viewer")
                  }
                  className={fieldClass}
                >
                  <option value="viewer">{t("roleViewer")}</option>
                  <option value="editor">{t("roleEditor")}</option>
                  <option value="admin">{t("roleAdmin")}</option>
                </select>
              </Field>
            </div>
            <RoleHint role={approvalRole} />

            {approvalRole === "editor" && (
              <ScopeFields
                eventTypes={eventTypes}
                gradeName={(grade) => `grade-${grade}`}
                typeName={(key) => `type-${key}`}
                labels={{
                  gradeScopes: t("gradeScopes"),
                  eventTypeScopes: t("eventTypeScopes"),
                  selectAllGrades: t("selectAllGrades"),
                  clearAllGrades: t("clearAllGrades"),
                  selectAllEventTypes: t("selectAllEventTypes"),
                  clearAllEventTypes: t("clearAllEventTypes"),
                }}
              />
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 pt-4">
              <Button type="button" variant="ghost" onClick={() => setActiveId(null)} disabled={busy}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={busy} className="px-4">
                {busyId === activeId ? `${t("approve")}…` : t("approve")}
              </Button>
            </div>
          </form>
        </StaffDialog>
      )}
    </div>
  );
}
