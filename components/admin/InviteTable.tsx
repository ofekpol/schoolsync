"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, History, Link2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleBadge, ScopeChips } from "@/components/admin/staff-ui";

interface InviteRow {
  id: string;
  token: string;
  role: "editor" | "admin" | "viewer";
  gradeScopes: number[];
  eventTypeScopes: string[];
  multiUse: boolean;
  revokedAt: Date | string | null;
  usedAt: Date | string | null;
  createdAt?: Date | string;
}

// Pinned locale + timezone so SSR and the client render the same date.
const CREATED_FMT = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  dateStyle: "short",
});

function createdTime(invite: InviteRow): number {
  return invite.createdAt ? new Date(invite.createdAt).getTime() : 0;
}

/** Open = still redeemable; used and revoked invites are history. */
function isOpen(invite: InviteRow): boolean {
  return !invite.usedAt && !invite.revokedAt;
}

export function InviteTable({
  invites,
  eventTypes = [],
}: {
  invites: InviteRow[];
  eventTypes?: { key: string; labelHe: string }[];
}) {
  const t = useTranslations("admin.staff");
  const router = useRouter();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const closedCount = invites.filter((invite) => !isOpen(invite)).length;
  const visible = (showHistory ? invites : invites.filter(isOpen))
    .slice()
    .sort((a, b) => createdTime(b) - createdTime(a));

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

  function copy(invite: InviteRow) {
    const url = `${window.location.origin}/invite/${invite.token}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId((current) => (current === invite.id ? null : current)), 2000);
    });
  }

  function statusLabel(invite: InviteRow) {
    if (invite.usedAt) return t("used");
    if (invite.revokedAt) return t("revoked");
    return t("active");
  }

  return (
    <div className="space-y-3">
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center">
          <Link2 className="size-7 text-neutral-400" aria-hidden />
          <p className="text-sm font-medium text-neutral-700">{t("noInvites")}</p>
        </div>
      ) : (
        <ul
          aria-label={t("inviteListLabel")}
          className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white"
        >
          {visible.map((invite) => {
            const role = t(`role${capitalize(invite.role)}`);
            const open = isOpen(invite);
            return (
              <li
                key={invite.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 p-4 ${open ? "" : "bg-neutral-50/60"}`}
              >
                <div className="flex shrink-0 items-center gap-2 sm:w-44">
                  <RoleBadge role={invite.role} />
                  {invite.multiUse && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
                      <Repeat className="size-3" aria-hidden />
                      {t("multiUseBadge")}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 basis-48 space-y-1">
                  <ScopeChips
                    role={invite.role}
                    gradeScopes={invite.gradeScopes}
                    eventTypeScopes={invite.eventTypeScopes}
                    eventTypes={eventTypes}
                  />
                  {invite.createdAt && (
                    <p className="text-xs text-neutral-500">
                      {t("createdOn", { date: CREATED_FMT.format(new Date(invite.createdAt)) })}
                    </p>
                  )}
                </div>
                {open ? (
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      aria-label={`${t("copyInvite")} ${role}`}
                      onClick={() => copy(invite)}
                    >
                      {copiedId === invite.id ? (
                        <Check className="size-3.5" aria-hidden />
                      ) : (
                        <Copy className="size-3.5" aria-hidden />
                      )}
                      {copiedId === invite.id ? t("inviteCopied") : t("copyInvite")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 text-neutral-500 hover:text-red-700 sm:flex-none"
                      aria-label={`${t("revokeInvite")} ${role}`}
                      disabled={revoking === invite.id}
                      onClick={() => handleRevoke(invite.id)}
                    >
                      {t("revokeInvite")}
                    </Button>
                  </div>
                ) : (
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-600">
                    {statusLabel(invite)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {closedCount > 0 && (
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-neutral-600"
          onClick={() => setShowHistory((value) => !value)}
        >
          <History className="size-3.5" aria-hidden />
          {showHistory ? t("hideInviteHistory") : t("showInviteHistory", { count: closedCount })}
        </Button>
      )}
    </div>
  );
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
