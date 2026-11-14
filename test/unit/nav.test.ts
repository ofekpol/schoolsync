import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

import { buildNavLinks } from "@/lib/nav";

async function hrefs(...args: Parameters<typeof buildNavLinks>): Promise<string[]> {
  return (await buildNavLinks(...args)).map((link) => link.href);
}

describe("buildNavLinks", () => {
  it("keeps today's admin links for a gantt-only school", async () => {
    expect(await hrefs("admin", false, ["gantt"])).toEqual(["/dashboard", "/admin/staff", "/admin/event-types"]);
    expect(await hrefs("admin")).toEqual(["/dashboard", "/admin/staff", "/admin/event-types"]);
  });

  it("keeps today's editor and viewer links and the platform link last", async () => {
    expect(await hrefs("editor")).toEqual(["/dashboard", "/admin/event-types"]);
    expect(await hrefs("viewer")).toEqual(["/dashboard"]);
    expect(await hrefs("admin", true)).toEqual([
      "/dashboard", "/admin/staff", "/admin/event-types", "/platform/schools",
    ]);
  });

  it("adds the timeTable link for a school with both services", async () => {
    expect(await hrefs("admin", false, ["gantt", "timetable"])).toEqual([
      "/dashboard", "/admin/staff", "/admin/event-types", "/timetable",
    ]);
    expect(await hrefs("admin", true, ["gantt", "timetable"])).toEqual([
      "/dashboard", "/admin/staff", "/admin/event-types", "/timetable", "/platform/schools",
    ]);
  });

  it("shows only the timeTable to an editor of a timetable-only school", async () => {
    expect(await hrefs("editor", false, ["timetable"])).toEqual(["/timetable"]);
  });

  it("shows the timeTable and staff to an admin of a timetable-only school", async () => {
    expect(await hrefs("admin", false, ["timetable"])).toEqual(["/timetable", "/admin/staff"]);
  });

  it("has no separate categories link (it is a tab of the staff page)", async () => {
    for (const role of ["admin", "editor", "viewer"] as const) {
      expect(await hrefs(role)).not.toContain("/admin/categories");
    }
  });
});
