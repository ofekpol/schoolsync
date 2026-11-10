"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatGradeLabel } from "@/lib/grades";

interface InviteRow {
  id: string;
  token: string;
  role: "editor" | "admin" | "viewer";
  gradeScopes: number[];
  eventTypeScopes: string[];
  multiUse: boolean;
  revokedAt: Date | string | null;
  usedAt: Date | string | null;
}

/** Open = still redeemable; used and revoked invites are history. */
function isOpen(invite: InviteRow): boolean {
  return !invite.usedAt && !invite.revokedAt;
}

export function InviteTable({ invites }: { invites: InviteRow[] }) {
  const t = useTranslations("admin.staff");
  const router = useRouter();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const closedCount = invites.filter((invite) => !isOpen(invite)).length;
  const visible = showHistory ? invites : invites.filter(isOpen);

  async function handleRevoke(id: string) {
    if (!confirm(t("revokeConfirm"))) return;
    setRevoking(id);
    try {
      const res = await fetch(`/api/v1/admin/staff/invites/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
      else alert(t("revokeError"));
    } finally {
      setRevoking(null);
    }
  }

  function statusLabel(invite: InviteRow) {
    if (invite.usedAt) return t("used");
    if (invite.revokedAt) return t("revoked");
    return t("active");
  }

  function actions(invite: InviteRow, role: string, size: "mobile" | "desktop") {
    if (!isOpen(invite)) return null;
    return (
      <>
        <Button
          size="sm"
          variant={size === "mobile" ? "outline" : "ghost"}
          aria-label={`${t("copyInvite")} ${role}`}
          onClick={() => copyInviteUrl(invite.token)}
        >
          {t("copyInvite")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          aria-label={`${t("revokeInvite")} ${role}`}
          disabled={revoking === invite.id}
          onClick={() => handleRevoke(invite.id)}
        >
          {t("revokeInvite")}
        </Button>
      </>
    );
  }

  return (
    <div className="space-y-2">
      {visible.length === 0 ? (
        <p className="text-sm text-neutral-500">{t("noInvites")}</p>
      ) : (
        <div className="rounded-lg border border-neutral-200">
          <div aria-label={t("mobileInviteListLabel")} className="space-y-3 p-3 md:hidden">
            {visible.map((invite) => {
              const role = t(`role${capitalize(invite.role)}`);
              return (
                <article key={invite.id} className="rounded-lg border border-neutral-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium text-neutral-950">{role}</h3>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                      {statusLabel(invite)}
                    </span>
                  </div>
                  {invite.multiUse && (
                    <span className="mt-3 inline-flex rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                      {t("multiUseBadge")}
                    </span>
                  )}
                  <dl className="mt-4 text-sm">
                    <dt className="text-xs font-medium text-neutral-500">{t("scopes")}</dt>
                    <dd className="mt-1 text-neutral-700">{formatInviteScopes(invite) || "—"}</dd>
                  </dl>
                  {isOpen(invite) && (
                    <div className="mt-4 grid grid-cols-2 gap-2">{actions(invite, role, "mobile")}</div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="hidden max-h-[420px] overflow-auto md:block">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="sticky top-0 z-10 bg-white text-xs font-semibold text-neutral-500 uppercase shadow-[0_1px_0_var(--color-border)]">
                <tr>
                  <th className="py-3 ps-4 pe-4 text-start">{t("role")}</th>
                  <th className="py-3 pe-4 text-start">{t("scopes")}</th>
                  <th className="py-3 pe-4 text-start">{t("status")}</th>
                  <th className="py-3 pe-4 text-start">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((invite) => {
                  const role = t(`role${capitalize(invite.role)}`);
                  return (
                    <tr key={invite.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                      <td className="py-3 ps-4 pe-4">
                        <span>{role}</span>
                        {invite.multiUse && (
                          <span className="ms-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                            {t("multiUseBadge")}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[340px] py-3 pe-4 text-neutral-700">
                        {formatInviteScopes(invite) || "—"}
                      </td>
                      <td className="py-3 pe-4">{statusLabel(invite)}</td>
                      <td className="py-3 pe-4">
                        <div className="flex gap-2">{actions(invite, role, "desktop")}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {closedCount > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setShowHistory((value) => !value)}>
          {showHistory ? t("hideInviteHistory") : t("showInviteHistory", { count: closedCount })}
        </Button>
      )}
    </div>
  );
}

function copyInviteUrl(token: string) {
  const url = `${window.location.origin}/invite/${token}`;
  void navigator.clipboard.writeText(url);
}

function formatInviteScopes(invite: Pick<InviteRow, "gradeScopes" | "eventTypeScopes">) {
  return [
    ...invite.gradeScopes.map((g) => formatGradeLabel(g)),
    ...invite.eventTypeScopes,
  ].join(", ");
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
