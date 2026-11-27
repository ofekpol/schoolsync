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

  it("shows no Gantt links to a school without gantt", async () => {
    expect(await hrefs("admin", false, [])).toEqual(["/admin/staff"]);
  });

  it("has no separate categories link (it is a tab of the staff page)", async () => {
    for (const role of ["admin", "editor", "viewer"] as const) {
      expect(await hrefs(role)).not.toContain("/admin/categories");
    }
  });

  it("shows rooms only when the school has rooms and the user can book", async () => {
    expect(await hrefs("viewer", false, ["gantt", "rooms"], true)).toEqual(["/dashboard", "/rooms"]);
    expect(await hrefs("viewer", false, ["gantt", "rooms"], false)).toEqual(["/dashboard"]);
    expect(await hrefs("viewer", false, ["gantt"], true)).toEqual(["/dashboard"]);
    expect(await hrefs("admin", false, ["rooms"], true)).toEqual(["/rooms", "/admin/staff"]);
  });
});
