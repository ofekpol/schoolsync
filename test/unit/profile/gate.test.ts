import { beforeEach, describe, expect, it, vi } from "vitest";

const countCategoriesMock = vi.fn();
vi.mock("@/lib/profile/categories", () => ({
  countCategories: (...args: unknown[]) => countCategoriesMock(...args),
}));

import { needsProfile } from "@/lib/profile/gate";

const USER = {
  id: "00000000-0000-0000-0000-0000000000a2",
  schoolId: "00000000-0000-0000-0000-00000000000a",
  role: "editor" as const,
  status: "active" as const,
  email: "editor@school.test",
  fullName: "Editor",
  mustChangePassword: false,
  profileCompletedAt: null,
};

describe("needsProfile", () => {
  beforeEach(() => {
    countCategoriesMock.mockReset();
    countCategoriesMock.mockResolvedValue(2);
  });

  it("is true for a staff member who has not filled a profile the school asks for", async () => {
    expect(await needsProfile(USER)).toBe(true);
    expect(countCategoriesMock).toHaveBeenCalledWith(USER.schoolId);
  });

  it("is false without a school", async () => {
    expect(await needsProfile({ ...USER, schoolId: null })).toBe(false);
  });

  it("is false for a demo user", async () => {
    expect(await needsProfile({ ...USER, demoExpiresAt: new Date() })).toBe(false);
    expect(countCategoriesMock).not.toHaveBeenCalled();
  });

  it("is false once the profile was completed", async () => {
    expect(await needsProfile({ ...USER, profileCompletedAt: new Date() })).toBe(false);
    expect(countCategoriesMock).not.toHaveBeenCalled();
  });

  it("is false when the record does not say whether the profile was completed", async () => {
    const { profileCompletedAt: _unknown, ...withoutField } = USER;
    expect(await needsProfile(withoutField)).toBe(false);
  });

  it("is false while the school has no category", async () => {
    countCategoriesMock.mockResolvedValue(0);
    expect(await needsProfile(USER)).toBe(false);
  });
});
