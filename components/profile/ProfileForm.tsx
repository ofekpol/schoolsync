"use client";

import { useId, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ProfileCategory } from "@/lib/validations/profile";

interface Props {
  categories: ProfileCategory[];
  selected: string[];
  /** PUT { optionIds } goes here: the caller's own profile, or a staff member's (admin). */
  submitUrl: string;
  onSaved?: () => void;
  /** Where to go after a successful save (the standalone /profile page). */
  savedHref?: string;
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

/** One fieldset per category: checkboxes for multi-select, radios for single-select. */
export function ProfileForm({ categories, selected, submitUrl, onSaved, savedHref }: Props) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [picked, setPicked] = useState(() => new Set(selected));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);

  const missing = categories.some(
    (c) => c.required && c.options.length > 0 && !c.options.some((o) => picked.has(o.id)),
  );

  function toggle(category: ProfileCategory, optionId: string | null) {
    setPicked((current) => {
      const next = new Set(current);
      if (!category.multiSelect) category.options.forEach((o) => next.delete(o.id));
      if (optionId === null) return next;
      if (category.multiSelect && next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const failure = await save(submitUrl, [...picked]);
    setSaving(false);
    if (failure) return setError(failure);
    onSaved?.();
    if (savedHref) {
      router.push(savedHref as Route);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {categories.map((category) => (
        <CategoryFieldset key={category.id} category={category} picked={picked}
          onToggle={(optionId) => toggle(category, optionId)} />
      ))}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || missing}>
          {saving ? t("saving") : t("save")}
        </Button>
        {error && <span role="alert" className="text-sm text-destructive">{t(error)}</span>}
      </div>
    </form>
  );
}

const OPTION =
  "flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-2 has-focus-visible:ring-ring";

function CategoryFieldset({ category, picked, onToggle }: {
  category: ProfileCategory;
  picked: Set<string>;
  onToggle: (optionId: string | null) => void;
}) {
  const t = useTranslations("profile");
  const name = useId();
  const type = category.multiSelect ? "checkbox" : "radio";
  const none = !category.options.some((o) => picked.has(o.id));
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-neutral-900">
        {category.name}
        {category.required && (
          <span className="ms-1.5 text-xs font-normal text-destructive">{t("required")}</span>
        )}
        {category.multiSelect && (
          <span className="ms-1.5 text-xs font-normal text-neutral-500">{t("multiHint")}</span>
        )}
      </legend>
      {category.options.length === 0 && <p className="text-xs text-neutral-500">{t("noOptions")}</p>}
      <div className="flex flex-wrap gap-2">
        {category.options.map((option) => (
          <label key={option.id} className={OPTION}>
            <input type={type} name={name} checked={picked.has(option.id)}
              onChange={() => onToggle(option.id)} className="accent-primary" />
            {option.label}
          </label>
        ))}
        {!category.multiSelect && !category.required && category.options.length > 0 && (
          <label className={`${OPTION} text-neutral-500`}>
            <input type="radio" name={name} checked={none} onChange={() => onToggle(null)}
              className="accent-primary" />
            {t("none")}
          </label>
        )}
      </div>
    </fieldset>
  );
}
