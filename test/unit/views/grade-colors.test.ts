import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRADE_COLORS,
  GRADE_COLOR_OPTIONS,
  WHOLE_SCHOOL_COLOR,
  eventColorScheme,
  isEventInGradeSelection,
  isWholeSchoolEvent,
  resolveGradeColors,
  gradeTagLabel,
  sortBySelection,
  swatchFor,
} from "@/lib/grade-colors";
import { relativeLuminance } from "@/lib/colors";
import { calendarEventVisual } from "@/components/CalendarEventChip";

const ALL = [7, 8, 9, 10, 11, 12];

describe("resolveGradeColors", () => {
  it("fills unset grades with defaults and applies overrides", () => {
    const map = resolveGradeColors([{ grade: 9, colorHex: "#7A7A2E" }]);
    expect(map[9]).toBe("#7A7A2E");
    expect(map[7]).toBe(DEFAULT_GRADE_COLORS[7]);
  });

  it("ignores grades the school does not have", () => {
    const map = resolveGradeColors([{ grade: 3, colorHex: "#7A7A2E" }]);
    expect(map[3]).toBeUndefined();
  });

  it("offers every default color in the curated palette", () => {
    for (const color of Object.values(DEFAULT_GRADE_COLORS)) {
      expect(GRADE_COLOR_OPTIONS).toContain(color);
    }
  });
});

describe("grade palette", () => {
  function ratio(a: string, b: string): number {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  it("gives every option its own text tone that meets WCAG AA on the fill", () => {
    expect(new Set(GRADE_COLOR_OPTIONS).size).toBe(GRADE_COLOR_OPTIONS.length);
    for (const fill of GRADE_COLOR_OPTIONS) {
      const swatch = swatchFor(fill);
      expect(swatch.fill).toBe(fill);
      expect(ratio(swatch.ink, fill)).toBeGreaterThanOrEqual(4.5);
      expect(swatch.accent).not.toBe(fill);
    }
  });
});

describe("eventColorScheme", () => {
  it("uses the grade color for single-grade events", () => {
    const scheme = eventColorScheme([8], DEFAULT_GRADE_COLORS);
    expect(scheme).toMatchObject({ kind: "single", fill: DEFAULT_GRADE_COLORS[8], dots: [] });
  });

  it("uses a neutral fill with one dot per grade for multi-grade events", () => {
    const scheme = eventColorScheme([9, 7], DEFAULT_GRADE_COLORS);
    expect(scheme.kind).toBe("multi");
    expect(scheme.fill).toBe("#ffffff");
    expect(scheme.dots).toEqual([swatchFor(DEFAULT_GRADE_COLORS[7]).accent, swatchFor(DEFAULT_GRADE_COLORS[9]).accent]);
  });

  it("uses the whole-school color when every grade (or none) is included", () => {
    expect(eventColorScheme(ALL, DEFAULT_GRADE_COLORS).fill).toBe(WHOLE_SCHOOL_COLOR);
    expect(eventColorScheme([], DEFAULT_GRADE_COLORS).kind).toBe("school");
    expect(isWholeSchoolEvent(ALL)).toBe(true);
    expect(isWholeSchoolEvent([7, 8])).toBe(false);
  });
});

describe("grade selection focus", () => {
  it("highlights everything when nothing is selected", () => {
    expect(isEventInGradeSelection([7], [])).toBe(true);
  });

  it("highlights events sharing any selected grade, and whole-school events", () => {
    expect(isEventInGradeSelection([7, 8], [8, 10])).toBe(true);
    expect(isEventInGradeSelection([9], [8, 10])).toBe(false);
    expect(isEventInGradeSelection(ALL, [8])).toBe(true);
  });

  it("orders highlighted events first without mutating the input", () => {
    const events = [{ id: "a", grades: [9] }, { id: "b", grades: [8] }];
    expect(sortBySelection(events, [8]).map((e) => e.id)).toEqual(["b", "a"]);
    expect(events[0].id).toBe("a");
  });
});

describe("calendarEventVisual", () => {
  it("dims events outside the selection and mutes their grade tabs", () => {
    const visual = calendarEventVisual({ grades: [9, 10] }, DEFAULT_GRADE_COLORS, [7], "all");
    expect(visual.highlighted).toBe(false);
    expect(visual.tabs.map((tab) => tab.label)).toEqual(["ט", "י"]);
    expect(visual.tabs[0].style.background).toBe("#D9D6CE");
  });

  it("puts a dark grade tab on the pastel chip", () => {
    const visual = calendarEventVisual({ grades: [7] }, DEFAULT_GRADE_COLORS, [], "all");
    const swatch = swatchFor(DEFAULT_GRADE_COLORS[7]);
    expect(visual.tabs).toEqual([{ label: "ז", style: { background: swatch.ink, color: swatch.fill } }]);
    expect(visual.style.color).toBe(swatch.ink);
  });

  it("labels whole-school chips with a single school tab", () => {
    const visual = calendarEventVisual({ grades: ALL }, DEFAULT_GRADE_COLORS, [], "all");
    expect(visual.tabs.map((tab) => tab.label)).toEqual(["all"]);
  });

  it("keeps the canceled treatment regardless of grade", () => {
    const visual = calendarEventVisual({ grades: [7], isCanceled: true }, DEFAULT_GRADE_COLORS, [], "all");
    expect(visual.style.textDecoration).toBe("line-through");
  });

  it("paints single-grade chips with the grade color", () => {
    const visual = calendarEventVisual({ grades: [7] }, DEFAULT_GRADE_COLORS, [], "all");
    expect(visual.style.backgroundColor).toBe(DEFAULT_GRADE_COLORS[7]);
  });
});

describe("gradeTagLabel", () => {
  it("labels single, consecutive, gapped and whole-school events", () => {
    expect(gradeTagLabel([7], "all")).toBe("ז");
    expect(gradeTagLabel([8, 7], "all")).toBe("ז–ח");
    expect(gradeTagLabel([7, 9], "all")).toBe("ז, ט");
    expect(gradeTagLabel([7, 8, 9, 10, 11, 12], "all")).toBe("all");
  });
});

describe("swatchFor", () => {
  it("returns the curated dark tones for a palette fill", () => {
    expect(swatchFor("#cfe3fa")).toEqual({ fill: "#CFE3FA", accent: "#3D7CC9", ink: "#133A66" });
  });

  it("falls back to a readable swatch for unknown legacy colors", () => {
    expect(swatchFor("#0F6FB0").ink).toBe("#ffffff");
  });
});
