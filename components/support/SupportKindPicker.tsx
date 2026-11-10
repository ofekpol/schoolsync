"use client";

import { useTranslations } from "next-intl";
import { Bug, Lightbulb, MessageCircleQuestion, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const SUPPORT_KINDS = ["bug", "question", "idea"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

/** Icon + tint per kind, so the choice reads by shape as well as color. */
const KIND_STYLE: Record<SupportKind, { icon: LucideIcon; tile: string; selected: string }> = {
  bug: { icon: Bug, tile: "bg-rose-50 text-rose-600", selected: "border-rose-400 bg-rose-50/60 ring-rose-200" },
  question: { icon: MessageCircleQuestion, tile: "bg-blue-50 text-blue-600", selected: "border-blue-400 bg-blue-50/60 ring-blue-200" },
  idea: { icon: Lightbulb, tile: "bg-amber-50 text-amber-600", selected: "border-amber-400 bg-amber-50/60 ring-amber-200" },
};

interface Props {
  value: SupportKind;
  onChange: (kind: SupportKind) => void;
}

/** Three large radio cards (bug / question / idea) with an icon and a one-line hint. */
export function SupportKindPicker({ value, onChange }: Props) {
  const t = useTranslations("support");
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-sm font-semibold text-neutral-800">{t("kindLabel")}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {SUPPORT_KINDS.map((kind) => {
          const { icon: Icon, tile, selected } = KIND_STYLE[kind];
          const checked = value === kind;
          return (
            <label
              key={kind}
              className={cn(
                "sg-interactive relative flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3 sm:flex-col sm:items-start sm:p-4",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-amber-300",
                checked ? cn("ring-2", selected) : "border-neutral-200 hover:border-neutral-300",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={kind}
                checked={checked}
                onChange={() => onChange(kind)}
                className="sr-only"
              />
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", tile)}>
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="space-y-0.5">
                <span className="block text-sm font-semibold text-neutral-900">{t(`kinds.${kind}`)}</span>
                <span className="block text-xs text-neutral-500">{t(`kindHints.${kind}`)}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
