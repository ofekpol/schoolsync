import { beforeEach, describe, expect, it, vi } from "vitest";

const getEditorAllowedGradesMock = vi.fn();
vi.mock("@/lib/events/queries", () => ({
  getEditorAllowedGrades: (...args: unknown[]) => getEditorAllowedGradesMock(...args),
}));

import { canEditEvents, findDisallowedGrades } from "@/lib/events/scope";

const EDITOR = {
  id: "staff-1",
  schoolId: "school-1",
  role: "editor" as const,
  status: "active" as const,
  mustChangePassword: false,
};

describe("canEditEvents", () => {
  it("allows active editors and admins", () => {
    expect(canEditEvents(EDITOR)).toBe(true);
    expect(canEditEvents({ ...EDITOR, role: "admin" })).toBe(true);
  });

  it("refuses viewers", () => {
    expect(canEditEvents({ ...EDITOR, role: "viewer" })).toBe(false);
  });

  it("refuses pending and deactivated staff", () => {
    expect(canEditEvents({ ...EDITOR, status: "pending" })).toBe(false);
    expect(canEditEvents({ ...EDITOR, status: "deactivated" })).toBe(false);
  });

  it("refuses staff who must still change their password", () => {
    expect(canEditEvents({ ...EDITOR, mustChangePassword: true })).toBe(false);
  });
});

describe("findDisallowedGrades", () => {
  beforeEach(() => {
    getEditorAllowedGradesMock.mockReset();
    getEditorAllowedGradesMock.mockResolvedValue([9, 10]);
  });

  it("returns the grades outside the editor's scope", async () => {
    await expect(findDisallowedGrades(EDITOR, [9, 11, 12])).resolves.toEqual([11, 12]);
    expect(getEditorAllowedGradesMock).toHaveBeenCalledWith("school-1", "staff-1");
  });

  it("returns nothing when every grade is in scope", async () => {
    await expect(findDisallowedGrades(EDITOR, [9, 10])).resolves.toEqual([]);
  });

  it("skips the lookup for admins", async () => {
    await expect(findDisallowedGrades({ ...EDITOR, role: "admin" }, [7, 12])).resolves.toEqual([]);
    expect(getEditorAllowedGradesMock).not.toHaveBeenCalled();
  });

  it("skips the lookup when no grades are given", async () => {
    await expect(findDisallowedGrades(EDITOR, undefined)).resolves.toEqual([]);
    await expect(findDisallowedGrades(EDITOR, [])).resolves.toEqual([]);
    expect(getEditorAllowedGradesMock).not.toHaveBeenCalled();
  });

  it("disallows every grade for an editor without a school", async () => {
    await expect(findDisallowedGrades({ ...EDITOR, schoolId: null }, [9])).resolves.toEqual([9]);
    expect(getEditorAllowedGradesMock).not.toHaveBeenCalled();
  });
});
