import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffUserRecord } from "@/lib/auth/session";

const countCategories = vi.fn<(schoolId: string) => Promise<number>>();
const isDemoUser = vi.fn<(user: StaffUserRecord) => boolean>();

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/profile/categories", () => ({ countCategories: (id: string) => countCategories(id) }));
vi.mock("@/lib/auth/demo-guard", () => ({ isDemoUser: (u: StaffUserRecord) => isDemoUser(u) }));

const { ProfileLink } = await import("@/components/profile/ProfileLink");

function staff(role: string): StaffUserRecord {
  return { id: "u", schoolId: "s", role } as unknown as StaffUserRecord;
}

describe("ProfileLink", () => {
  afterEach(cleanup);
  beforeEach(() => {
    countCategories.mockResolvedValue(2);
    isDemoUser.mockReturnValue(false);
  });

  it.each(["editor", "viewer"])("links a %s to /profile", async (role) => {
    render((await ProfileLink({ user: staff(role) }))!);
    expect(screen.getByRole("link", { name: "profile" })).toHaveAttribute("href", "/profile");
  });

  it("is hidden for admins, who edit labels in staff management", async () => {
    expect(await ProfileLink({ user: staff("admin") })).toBeNull();
  });

  it("is hidden while the school has no profile categories", async () => {
    countCategories.mockResolvedValue(0);
    expect(await ProfileLink({ user: staff("editor") })).toBeNull();
  });

  it("is hidden in demo schools", async () => {
    isDemoUser.mockReturnValue(true);
    expect(await ProfileLink({ user: staff("viewer") })).toBeNull();
  });
});
