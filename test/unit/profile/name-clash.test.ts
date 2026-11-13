import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ withSchool: vi.fn() }));

import { isNameClash } from "@/lib/profile/categories";

const clash = { code: "23505", constraint: "profile_categories_school_name_active_key" };

describe("isNameClash", () => {
  it("matches the active-name unique violation, bare or wrapped by drizzle", () => {
    expect(isNameClash(clash)).toBe(true);
    expect(isNameClash(new Error("query failed", { cause: clash }))).toBe(true);
  });

  it("ignores other unique violations and other errors", () => {
    expect(isNameClash({ code: "23505", constraint: "profile_category_options_category_label_active_key" })).toBe(false);
    expect(isNameClash(new Error("boom"))).toBe(false);
    expect(isNameClash(null)).toBe(false);
  });
});
