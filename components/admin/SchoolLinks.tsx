"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";

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
    { key: "signup", label: t("signup"), url: `${origin}/auth/login?school=${accessToken}` },
    { key: "guest", label: t("guest"), url: `${origin}/schedule?school=${accessToken}` },
  ].filter((link) => !guestOnly || link.key === "guest");
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">{t("hint")}</p>
      {links.map((link) => (
        <SchoolLinkRow
          key={link.key}
          id={`school-link-${link.key}`}
          label={link.label}
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
  url,
  copyLabel,
  copiedLabel,
}: {
  id: string;
  label: string;
  url: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={url}
          dir="ltr"
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          <Copy className="size-4" aria-hidden />
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  );
}
