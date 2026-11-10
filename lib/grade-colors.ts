import { readableTextColor } from "@/lib/colors";
import { formatGradeLabel } from "@/lib/grades";

/**
 * Grade color system for calendar views.
 *
 * Events are colored by ONE source at a time. Today that source is the grade;
 * a future "color by event type" mode adds a branch in `eventColorScheme`
 * (returning no grade dots) without touching callers. An event never carries
 * two color sources, and the grade label (text) always stays, so swapping the
 * fill never loses information.
 */

export const SCHOOL_GRADES = [7, 8, 9, 10, 11, 12] as const;

/**
 * A grade color is a light pastel fill plus two darker tones of the same hue:
 * `ink` for text on the fill (WCAG AA) and `accent` for small marks (dots).
 * Only `fill` is stored per school; the other tones come from this table.
 */
export interface GradeSwatch {
  fill: string;
  accent: string;
  ink: string;
}

/** Curated palette admins pick from (by fill). No reds: red means "canceled". */
export const GRADE_COLOR_OPTIONS = [
  "#CFE3FA",
  "#FFE8B8",
  "#CDEFD9",
  "#FAD4E6",
  "#E2D6FA",
  "#C9EEF2",
  "#DDF5D0",
  "#FFF2C2",
  "#DCE3EC",
  // Stronger tones of the same hues, plus peach, lime and orchid.
  "#A9CCF5",
  "#FFD27A",
  "#A6E3BD",
  "#F5B3D2",
  "#C9B6F5",
  "#9FDFE8",
  "#FFD9C2",
  "#E6F5B0",
  "#F0D2F5",
] as const;

export type GradeColorOption = (typeof GRADE_COLOR_OPTIONS)[number];

const SWATCHES: Record<GradeColorOption, GradeSwatch> = {
  "#CFE3FA": { fill: "#CFE3FA", accent: "#3D7CC9", ink: "#133A66" },
  "#FFE8B8": { fill: "#FFE8B8", accent: "#C9921A", ink: "#5A3E00" },
  "#CDEFD9": { fill: "#CDEFD9", accent: "#2F9E5E", ink: "#0F4227" },
  "#FAD4E6": { fill: "#FAD4E6", accent: "#C95A8E", ink: "#5E1F3D" },
  "#E2D6FA": { fill: "#E2D6FA", accent: "#7B5BC9", ink: "#33236B" },
  "#C9EEF2": { fill: "#C9EEF2", accent: "#2A9BAA", ink: "#0D4A52" },
  "#DDF5D0": { fill: "#DDF5D0", accent: "#5C9A2E", ink: "#24400F" },
  "#FFF2C2": { fill: "#FFF2C2", accent: "#B8960F", ink: "#4D3D00" },
  "#DCE3EC": { fill: "#DCE3EC", accent: "#5B6F8C", ink: "#1F2A3A" },
  "#A9CCF5": { fill: "#A9CCF5", accent: "#2F6DB8", ink: "#0F2F55" },
  "#FFD27A": { fill: "#FFD27A", accent: "#B07A0A", ink: "#4A3300" },
  "#A6E3BD": { fill: "#A6E3BD", accent: "#25864D", ink: "#0B381F" },
  "#F5B3D2": { fill: "#F5B3D2", accent: "#B4477A", ink: "#521A35" },
  "#C9B6F5": { fill: "#C9B6F5", accent: "#6A48BA", ink: "#2C1D5E" },
  "#9FDFE8": { fill: "#9FDFE8", accent: "#1F8794", ink: "#0A3F46" },
  "#FFD9C2": { fill: "#FFD9C2", accent: "#C46A2E", ink: "#5A2C0E" },
  "#E6F5B0": { fill: "#E6F5B0", accent: "#7A9A1A", ink: "#334208" },
  "#F0D2F5": { fill: "#F0D2F5", accent: "#A04BB0", ink: "#4A1A52" },
};

/** Light-pastel defaults, one distinct hue per grade. */
export const DEFAULT_GRADE_COLORS: Readonly<Record<number, string>> = {
  7: "#CFE3FA",
  8: "#FFE8B8",
  9: "#CDEFD9",
  10: "#FAD4E6",
  11: "#E2D6FA",
  12: "#C9EEF2",
};

/** Swatch for events that include every grade in the school. */
export const WHOLE_SCHOOL_SWATCH: GradeSwatch = { fill: "#E1E3E8", accent: "#4B5262", ink: "#20242D" };
export const WHOLE_SCHOOL_COLOR = WHOLE_SCHOOL_SWATCH.fill;

/** Fill/text for events outside the selected grades (monthly view). */
export const DIMMED_EVENT_COLORS = { fill: "#EFEDE7", text: "#8A8984" } as const;

export type GradeColorMap = Record<number, string>;

export type EventColorKind = "single" | "multi" | "school";

export interface EventColorScheme {
  kind: EventColorKind;
  fill: string;
  text: string;
  /** Accent colors to render as dots — only for multi-grade events in grade mode. */
  dots: string[];
  /** One swatch per grade tag shown on the chip (whole school: the school swatch). */
  swatches: GradeSwatch[];
}

/** Merges stored overrides on top of the defaults so every school grade has a color. */
export function resolveGradeColors(
  overrides: ReadonlyArray<{ grade: number; colorHex: string }>,
): GradeColorMap {
  const map: GradeColorMap = { ...DEFAULT_GRADE_COLORS };
  for (const row of overrides) {
    if (row.grade in map) map[row.grade] = row.colorHex;
  }
  return map;
}

/** Full swatch for a stored fill; unknown (legacy) fills get a readable fallback. */
export function swatchFor(fill: string | undefined): GradeSwatch {
  if (!fill) return WHOLE_SCHOOL_SWATCH;
  const known = SWATCHES[fill.toUpperCase() as GradeColorOption];
  if (known) return known;
  const ink = readableTextColor(fill);
  return { fill, accent: fill, ink };
}

export function gradeSwatch(gradeColors: GradeColorMap, grade: number): GradeSwatch {
  return swatchFor(gradeColors[grade] ?? DEFAULT_GRADE_COLORS[grade]);
}

export function isWholeSchoolEvent(grades: readonly number[]): boolean {
  return grades.length === 0 || SCHOOL_GRADES.every((grade) => grades.includes(grade));
}

/** Text color to use on a grade fill. */
export function gradeTextColor(fill: string): string {
  return swatchFor(fill).ink;
}

export function eventColorScheme(
  grades: readonly number[],
  gradeColors: GradeColorMap,
): EventColorScheme {
  if (isWholeSchoolEvent(grades)) {
    const school = WHOLE_SCHOOL_SWATCH;
    return { kind: "school", fill: school.fill, text: school.ink, dots: [], swatches: [school] };
  }
  const sorted = [...grades].sort((a, b) => a - b);
  const swatches = sorted.map((grade) => gradeSwatch(gradeColors, grade));
  if (sorted.length === 1) {
    return { kind: "single", fill: swatches[0].fill, text: swatches[0].ink, dots: [], swatches };
  }
  return {
    kind: "multi",
    fill: "#ffffff",
    text: "#2A2926",
    dots: swatches.map((swatch) => swatch.accent),
    swatches,
  };
}

/**
 * True when the event should render in full color for the current grade
 * selection. An empty selection means "no lens" — everything is highlighted.
 * Whole-school events always stay highlighted.
 */
export function isEventInGradeSelection(
  grades: readonly number[],
  selectedGrades: readonly number[],
): boolean {
  if (selectedGrades.length === 0 || isWholeSchoolEvent(grades)) return true;
  return grades.some((grade) => selectedGrades.includes(grade));
}

/** Stable-sorts events in the grade selection first, so dimmed ones overflow last. */
export function sortBySelection<T extends { grades: readonly number[] }>(
  events: readonly T[],
  selectedGrades: readonly number[],
): T[] {
  if (selectedGrades.length === 0) return [...events];
  const rank = (event: T) => (isEventInGradeSelection(event.grades, selectedGrades) ? 0 : 1);
  return [...events].sort((a, b) => rank(a) - rank(b));
}

/**
 * Short grade tag shown on every chip so the grade is readable without the
 * legend: "ז", "ז–ח" (consecutive), "ז, ט" (gaps), or the whole-school label.
 */
export function gradeTagLabel(grades: readonly number[], wholeSchoolLabel: string): string {
  if (isWholeSchoolEvent(grades)) return wholeSchoolLabel;
  const sorted = [...grades].sort((a, b) => a - b);
  const consecutive = sorted.every((grade, index) => index === 0 || grade === sorted[index - 1] + 1);
  if (sorted.length > 1 && consecutive) {
    return `${formatGradeLabel(sorted[0])}–${formatGradeLabel(sorted[sorted.length - 1])}`;
  }
  return sorted.map(formatGradeLabel).join(", ");
}
