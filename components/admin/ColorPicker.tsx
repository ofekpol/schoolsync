"use client";

import { useTranslations } from "next-intl";
import { Pipette } from "lucide-react";
import { cn } from "@/lib/utils";

/** Color-blind-safe preset palette (Tableau 10 + greys). */
export const COLOR_PRESETS = [
  "#1f77b4",
  "#d62728",
  "#9467bd",
  "#2ca02c",
  "#ff7f0e",
  "#8c564b",
  "#17becf",
  "#bcbd22",
  "#e377c2",
  "#7f7f7f",
  "#aec7e8",
  "#393b79",
];

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

/**
 * Compact color selector: one row of preset swatches plus a native picker
 * for a custom hex. Emits #RRGGBB (matches the event-type schema regex).
 */
export function ColorPicker({ value, onChange }: Props) {
  const t = useTranslations("admin.eventTypes");
  const normalized = value.toLowerCase();
  const isCustom = !COLOR_PRESETS.includes(normalized);

  return (
    <div role="radiogroup" aria-label={t("chooseColor")} className="flex flex-wrap items-center gap-1">
      {COLOR_PRESETS.map((hex) => {
        const selected = hex === normalized;
        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={hex}
            title={hex}
            onClick={() => onChange(hex)}
            style={{ background: hex }}
            className={cn(
              "size-6 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              selected ? "ring-2 ring-neutral-900 ring-offset-1" : "border-black/15 hover:scale-110",
            )}
          />
        );
      })}
      <label
        title={t("customColor")}
        className={cn(
          "relative inline-flex size-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-neutral-400 text-neutral-500 focus-within:ring-2 focus-within:ring-ring",
          isCustom && "border-solid ring-2 ring-neutral-900 ring-offset-1",
        )}
        style={isCustom ? { background: normalized } : undefined}
      >
        {!isCustom && <Pipette aria-hidden="true" className="size-3" />}
        <input
          type="color"
          aria-label={t("customColor")}
          value={normalized}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
