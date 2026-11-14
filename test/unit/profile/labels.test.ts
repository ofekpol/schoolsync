import { describe, expect, it } from "vitest";
import { labelNames, matchesLabelFilter, missesRequired } from "@/lib/profile/labels";
import type { ProfileCategory } from "@/lib/validations/profile";

const GRADE: ProfileCategory = {
  id: "c1", name: "שכבה", multiSelect: false, required: true, sortOrder: 1,
  options: [{ id: "g7", label: "ז", sortOrder: 0 }, { id: "g8", label: "ח", sortOrder: 1 }],
};
const SUBJECT: ProfileCategory = {
  id: "c2", name: "מקצוע", multiSelect: true, required: false, sortOrder: 2,
  options: [{ id: "math", label: "מתמטיקה", sortOrder: 0 }, { id: "eng", label: "אנגלית", sortOrder: 1 }],
};
const EMPTY_REQUIRED: ProfileCategory = { ...GRADE, id: "c3", name: "תפקיד", options: [] };
const ALL = [GRADE, SUBJECT, EMPTY_REQUIRED];

describe("profile label helpers", () => {
  it("names a staff member's labels in category and option order", () => {
    expect(labelNames(ALL, ["eng", "g8", "math", "gone"])).toEqual(["ח", "מתמטיקה", "אנגלית"]);
  });

  it("flags a missing required category, ignoring required categories with no options", () => {
    expect(missesRequired(ALL, ["math"])).toBe(true);
    expect(missesRequired(ALL, ["g7"])).toBe(false);
    expect(missesRequired([SUBJECT], [])).toBe(false);
  });

  it("filters by one option, by a missing required label, or not at all", () => {
    expect(matchesLabelFilter("all", ALL, [])).toBe(true);
    expect(matchesLabelFilter("math", ALL, ["math", "g7"])).toBe(true);
    expect(matchesLabelFilter("math", ALL, ["eng"])).toBe(false);
    expect(matchesLabelFilter("missing", ALL, ["math"])).toBe(true);
    expect(matchesLabelFilter("missing", ALL, ["g7"])).toBe(false);
  });
});
