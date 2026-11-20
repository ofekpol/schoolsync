"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryFieldset } from "@/components/profile/CategoryFieldset";
import { cn } from "@/lib/utils";
import type { ProfileCategory } from "@/lib/validations/profile";

interface Props {
  categories: ProfileCategory[];
  selected: string[];
  /** PUT { optionIds } goes here: the caller's own profile, or a staff member's (admin). */
  submitUrl: string;
  onSaved?: () => void;
  /** Where to go after a successful save (the first-login profile prompt). */
  savedHref?: string;
  /** A "back" link beside Save (the in-app profile page). */
  backHref?: string;
  /** "page": full-width sections with a sticky save bar; "dialog": compact, inside a modal. */
  variant?: "page" | "dialog";
  /** Label key for the Save button. */
  saveLabel?: "save" | "saveContinue";
}

type ErrorKey =
  | "errorSave"
  | "errorDemo"
  | "errorTooMany"
  | "errorRequiredMissing"
  | "errorUnknownOption";

const SERVER_ERRORS: Record<string, ErrorKey> = {
  too_many: "errorTooMany",
  required_missing: "errorRequiredMissing",
  unknown_option: "errorUnknownOption",
  demo_disabled: "errorDemo",
};

async function save(url: string, optionIds: string[]): Promise<ErrorKey | null> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optionIds }),
  }).catch(() => null);
  if (res?.ok) return null;
  const payload = (await res?.json().catch(() => null)) as { error?: string } | null;
  return SERVER_ERRORS[payload?.error ?? ""] ?? "errorSave";
}

function nextPicked(current: Set<string>, category: ProfileCategory, optionId: string | null) {
  const next = new Set(current);
  if (!category.multiSelect) category.options.forEach((o) => next.delete(o.id));
  if (optionId === null) return next;
  if (category.multiSelect && next.has(optionId)) next.delete(optionId);
  else next.add(optionId);
  return next;
}

/** The school's categories as pill groups (checkboxes for multi-select, radios for single). */
export function ProfileForm({
  categories, selected, submitUrl, onSaved, savedHref, backHref, variant = "dialog", saveLabel = "save",
}: Props) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [picked, setPicked] = useState(() => new Set(selected));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);

  const missing = categories.some(
    (c) => c.required && c.options.length > 0 && !c.options.some((o) => picked.has(o.id)),
  );

  function toggle(category: ProfileCategory, optionId: string | null) {
    setSaved(false);
    setPicked((current) => nextPicked(current, category, optionId));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const failure = await save(submitUrl, [...picked]);
    setSaving(false);
    if (failure) return setError(failure);
    onSaved?.();
    if (savedHref) router.push(savedHref as Route);
    else setSaved(true);
    router.refresh();
  }

  const page = variant === "page";
  return (
    <form onSubmit={submit} className={page ? "" : "space-y-5"}>
      <div className={page ? "divide-y divide-[var(--sg-hairline-2)]" : "space-y-5"}>
        {categories.map((category) => (
          <CategoryFieldset key={category.id} category={category} picked={picked}
            className={page ? "px-5 py-6 sm:px-7" : undefined}
            onToggle={(optionId) => toggle(category, optionId)} />
        ))}
      </div>
      <div className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2",
        page && "sticky bottom-0 rounded-b-2xl border-t border-[var(--sg-hairline)] bg-[var(--sg-surface-raised)]/95 px-5 py-4 shadow-[0_-10px_18px_-14px_rgb(37_99_235_/_22%)] backdrop-blur-sm sm:px-7",
      )}>
        <Button type="submit" disabled={saving || missing}
          className="sg-button-primary h-10 rounded-full px-6 text-sm font-semibold">
          {saving ? t("saving") : t(saveLabel)}
        </Button>
        {backHref && (
          <Link href={backHref as Route}
            className="rounded-full px-3 py-2 text-sm text-[var(--sg-ink-mute)] hover:bg-[var(--sg-hairline-2)] hover:text-[var(--sg-ink)]">
            {t("back")}
          </Link>
        )}
        <FormStatus error={error} saved={saved} missing={missing} />
      </div>
    </form>
  );
}

function FormStatus({ error, saved, missing }: { error: ErrorKey | null; saved: boolean; missing: boolean }) {
  const t = useTranslations("profile");
  if (error) return <span role="alert" className="text-sm text-rose-700">{t(error)}</span>;
  if (saved) {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800">
        <CircleCheck aria-hidden className="size-4" />
        {t("saved")}
      </span>
    );
  }
  if (missing) return <span className="text-sm text-[var(--sg-ink-soft)]">{t("errorRequiredMissing")}</span>;
  return null;
}
