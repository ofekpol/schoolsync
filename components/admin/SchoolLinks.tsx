"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Eye, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SchoolLinksProps {
  /** This school's secret link token — the only way in for guests and self sign-ups. */
  accessToken: string;
  /** App origin, resolved on the server so SSR and hydration render the same URL. */
  origin: string;
  /** Demo schools take no sign-ups, so only the guest view link is shown. */
  guestOnly?: boolean;
}

/** Admin-only: the two shareable links for this school (account sign-up, guest view). */
export function SchoolLinks({ accessToken, origin, guestOnly = false }: SchoolLinksProps) {
  const t = useTranslations("admin.staff.schoolLinks");
  const links = [
    {
      key: "signup",
      label: t("signup"),
      description: t("signupDescription"),
      icon: UserPlus,
      url: `${origin}/auth/login?school=${accessToken}`,
    },
    {
      key: "guest",
      label: t("guest"),
      description: t("guestDescription"),
      icon: Eye,
      url: `${origin}/schedule?school=${accessToken}`,
    },
  ].filter((link) => !guestOnly || link.key === "guest");
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">{t("hint")}</p>
      {links.map((link) => (
        <SchoolLinkRow
          key={link.key}
          id={`school-link-${link.key}`}
          label={link.label}
          description={link.description}
          icon={link.icon}
          url={link.url}
          copyLabel={t("copy")}
          copiedLabel={t("copied")}
        />
      ))}
    </div>
  );
}

function SchoolLinkRow({
  id,
  label,
  description,
  icon: Icon,
  url,
  copyLabel,
  copiedLabel,
}: {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  url: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-semibold text-neutral-950">
            {label}
          </label>
          <p className="text-xs text-neutral-500">{description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          readOnly
          value={url}
          dir="ltr"
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 font-mono text-xs text-neutral-600 outline-none focus:border-violet-500 focus:ring-3 focus:ring-violet-100"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium transition-colors hover:bg-neutral-50"
        >
          {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  );
}
