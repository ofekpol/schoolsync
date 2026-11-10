"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Eye, PenLine, ShieldCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatGradeLabel } from "@/lib/grades";
import { cn } from "@/lib/utils";

export type StaffRole = "editor" | "admin" | "viewer";

interface EventTypeLabel {
  key: string;
  labelHe: string;
}

const ROLE_STYLE: Record<StaffRole, { tone: string; Icon: typeof ShieldCheck }> = {
  admin: { tone: "bg-violet-50 text-violet-800 ring-violet-200", Icon: ShieldCheck },
  editor: { tone: "bg-sky-50 text-sky-800 ring-sky-200", Icon: PenLine },
  viewer: { tone: "bg-neutral-100 text-neutral-700 ring-neutral-200", Icon: Eye },
};

/** Two-letter initials: first and last word of the name (falls back to the email). */
function initials(name: string, email?: string): string {
  const words = name.trim().split(/\s+/).filter((word) => /^\p{L}/u.test(word));
  if (words.length >= 2) return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
  const source = words[0] ?? email ?? "?";
  return source.slice(0, 2).toUpperCase();
}

export function StaffAvatar({
  name,
  email,
  role,
  muted = false,
}: {
  name: string;
  email?: string;
  role: StaffRole;
  muted?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-inset",
        muted ? "bg-neutral-100 text-neutral-400 ring-neutral-200" : ROLE_STYLE[role].tone,
      )}
    >
      {initials(name, email)}
    </span>
  );
}

export function RoleBadge({ role }: { role: StaffRole }) {
  const t = useTranslations("admin.staff");
  const { tone, Icon } = ROLE_STYLE[role];
  const label = role === "admin" ? t("roleAdmin") : role === "viewer" ? t("roleViewer") : t("roleEditor");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        tone,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

/** Readable permission chips: "Full access", "View only", or one chip per grade/event type. */
export function ScopeChips({
  role,
  gradeScopes,
  eventTypeScopes,
  eventTypes,
}: {
  role: StaffRole;
  gradeScopes: number[];
  eventTypeScopes: string[];
  eventTypes: EventTypeLabel[];
}) {
  const t = useTranslations("admin.staff");
  let chips: string[];
  if (role === "admin") chips = [t("fullAccess")];
  else if (role === "viewer") chips = [t("viewOnly")];
  else {
    const types = eventTypeScopes.map(
      (key) => eventTypes.find((et) => et.key === key)?.labelHe ?? key,
    );
    chips = [...gradeScopes.map((g) => t("gradeChip", { grade: formatGradeLabel(g) })), ...types];
  }
  if (chips.length === 0) {
    return <span className="text-xs text-neutral-400">{t("noScopes")}</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li
          key={chip}
          className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs whitespace-nowrap text-neutral-700"
        >
          {chip}
        </li>
      ))}
    </ul>
  );
}

/** Centered modal shell: Escape and backdrop click close it; focus moves inside on open. */
export function StaffDialog({
  titleId,
  title,
  subtitle,
  closeLabel,
  onClose,
  children,
  size = "lg",
}: {
  titleId: string;
  title: string;
  subtitle?: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Kept in a ref so a new onClose each render doesn't re-run the effect
  // (re-focusing the panel would steal focus from the field being typed in).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl outline-none sm:rounded-2xl sm:p-6",
          size === "md" ? "sm:max-w-lg" : "sm:max-w-2xl",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-neutral-950">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm break-all text-neutral-500">{subtitle}</p>}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={closeLabel}>
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** One line under a role picker saying what the chosen role can do. */
export function RoleHint({ role }: { role: string }) {
  const t = useTranslations("admin.staff");
  const hint = role === "admin" ? t("adminHint") : role === "viewer" ? t("viewerHint") : t("editorHint");
  return <p className="text-xs text-neutral-500">{hint}</p>;
}

/** Shared field styles so every staff form input looks the same. */
export const fieldClass =
  "h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none transition focus:border-violet-500 focus:ring-3 focus:ring-violet-100";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
