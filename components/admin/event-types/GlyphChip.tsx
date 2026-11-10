import { readableTextColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

/** The event type as it appears on events: its glyph on its color. */
export function GlyphChip({
  colorHex,
  glyph,
  className,
}: {
  colorHex: string;
  glyph: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
        className,
      )}
      style={{ backgroundColor: colorHex, color: readableTextColor(colorHex) }}
    >
      {glyph || "·"}
    </span>
  );
}
