"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfileCategory } from "@/lib/validations/profile";

/**
 * A real radio/checkbox (visually hidden) inside a pill, so keyboard, screen readers and
 * form semantics stay native while the pill carries the selected state.
 */
const CHIP = cn(
  "group relative inline-flex min-h-10 cursor-pointer select-none items-center gap-1.5 rounded-full border px-4 text-sm",
  "border-[var(--sg-hairline)] bg-[var(--sg-surface)] text-[var(--sg-ink)]",
  "transition-[background-color,border-color,color,box-shadow] duration-150 ease-out",
  "hover:border-[color-mix(in_srgb,var(--sg-studio-blue)_45%,var(--sg-hairline))]",
  "has-checked:border-[var(--sg-studio-blue)] has-checked:bg-[var(--sg-studio-blue-soft)]",
  "has-checked:font-medium has-checked:text-[var(--sg-accent-ink)]",
  "has-checked:shadow-[0_2px_6px_rgb(37_99_235_/_12%)]",
  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2",
  "has-focus-visible:outline-[color-mix(in_srgb,var(--sg-studio-sun)_70%,white)]",
);

interface Props {
  category: ProfileCategory;
  picked: Set<string>;
  onToggle: (optionId: string | null) => void;
  className?: string;
  /** Shown but not editable (an admin-assigned category on the staff member's own profile). */
  locked?: boolean;
}

/** One category: its name, whether it is required, and its options as selectable pills. */
export function CategoryFieldset({ category, picked, onToggle, className, locked = false }: Props) {
  const t = useTranslations("profile");
  const name = useId();
  const type = category.multiSelect ? "checkbox" : "radio";
  const count = category.options.filter((o) => picked.has(o.id)).length;
  const missing = !locked && category.required && category.options.length > 0 && count === 0;
  return (
    <fieldset className={cn(className, locked && "[&_label]:cursor-default")} disabled={locked}>
      <legend className="float-start w-full">
        <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="font-[family-name:var(--sg-font-display)] text-lg font-semibold text-[var(--sg-ink)]">
            {category.name}
          </span>
          {locked && (
            <span className="rounded-full bg-[var(--sg-hairline-2)] px-2 py-0.5 text-xs font-medium text-[var(--sg-ink-mute)]">
              {t("adminAssignedNote")}
            </span>
          )}
          {category.required && !locked && (
            <span className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              missing
                ? "bg-rose-50 text-rose-700"
                : "bg-[var(--sg-studio-mint-soft)] text-emerald-800",
            )}>
              {t("required")}
            </span>
          )}
          {category.multiSelect && (
            <span className="text-xs text-[var(--sg-ink-soft)]">
              {count > 0 ? t("selectedCount", { count }) : t("multiHint")}
            </span>
          )}
        </span>
      </legend>
      {category.options.length === 0 ? (
        <p className="clear-both pt-3 text-sm text-[var(--sg-ink-soft)]">{t("noOptions")}</p>
      ) : (
        <div className="clear-both flex flex-wrap gap-2 pt-4">
          {category.options.map((option) => (
            <label key={option.id} className={CHIP}>
              <input type={type} name={name} checked={picked.has(option.id)}
                onChange={() => onToggle(option.id)} className="sr-only" />
              <Check aria-hidden strokeWidth={2.5}
                className="hidden size-3.5 text-[var(--sg-studio-blue)] group-has-checked:block" />
              {option.label}
            </label>
          ))}
          {!category.multiSelect && !category.required && (
            <label className={cn(CHIP, "text-[var(--sg-ink-mute)]")}>
              <input type="radio" name={name} checked={count === 0}
                onChange={() => onToggle(null)} className="sr-only" />
              {t("none")}
            </label>
          )}
        </div>
      )}
    </fieldset>
  );
}
