import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { profileCategories, staffProfileOptions } from "@/lib/db/schema-profile";
import { archiveCategory, createCategory, replaceCategory } from "@/lib/profile/categories";
import {
  getStaffOptionIds,
  isActiveStaffOfSchool,
  listStaffLabels,
  setStaffOptions,
} from "@/lib/profile/staff-labels";
import type { ProfileCategory } from "@/lib/validations/profile";

const SELF = { kind: "self" } as const;
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

const staffIds: string[] = [];

async function createStaff(schoolId: string, status: "active" | "deactivated" = "active") {
  const id = randomUUID();
  await testDb!.insert(schema.staffUsers).values({
    id,
    schoolId,
    email: `labels-${id}@test`,
    fullName: "Label Holder",
    role: "viewer",
    status,
  });
  staffIds.push(id);
  return id;
}

async function clearCategories(): Promise<void> {
  if (shouldSkip()) return;
  await testDb!
    .delete(profileCategories)
    .where(inArray(profileCategories.schoolId, [testSchoolA, testSchoolB]));
}

const category = (name: string, multiSelect: boolean, required: boolean, labels: string[]) =>
  ({ name, multiSelect, required, options: labels.map((label) => ({ label })) });

describe.skipIf(skipIfNoTestDb)("staff profile labels", () => {
  let subject: ProfileCategory; // multi-select, optional
  let grade: ProfileCategory; // single-select, required
  let staff: string;

  beforeEach(async () => {
    if (shouldSkip()) return;
    await clearCategories();
    subject = await createCategory(testSchoolA, category("מקצוע", true, false, ["מתמטיקה", "אנגלית"]));
    grade = await createCategory(testSchoolA, category("שכבה", false, true, ["ז", "ח"]));
    staff = await createStaff(testSchoolA);
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    await clearCategories();
    if (staffIds.length > 0) {
      await testDb!.delete(schema.auditLog).where(inArray(schema.auditLog.actorStaffId, staffIds));
      await testDb!.delete(schema.staffUsers).where(inArray(schema.staffUsers.id, staffIds));
    }
  });

  it("saves a selection, marks the profile complete and replaces it next time", async () => {
    const [math, english] = subject.options;
    const [seven, eight] = grade.options;
    await setStaffOptions(testSchoolA, staff, [math.id, english.id, seven.id], SELF);
    expect((await getStaffOptionIds(testSchoolA, staff)).sort()).toEqual(
      [math.id, english.id, seven.id].sort(),
    );
    const [row] = await testDb!
      .select({ at: schema.staffUsers.profileCompletedAt })
      .from(schema.staffUsers)
      .where(eq(schema.staffUsers.id, staff));
    expect(row.at).not.toBeNull();

    await setStaffOptions(testSchoolA, staff, [eight.id], SELF);
    expect(await getStaffOptionIds(testSchoolA, staff)).toEqual([eight.id]);
  });

  it("rejects an option of another school and writes nothing", async () => {
    const foreign = await createCategory(testSchoolB, category("מקצוע", true, false, ["ספורט"]));
    await expect(
      setStaffOptions(testSchoolA, staff, [grade.options[0].id, foreign.options[0].id], SELF),
    ).rejects.toMatchObject({ code: "unknown_option" });
    expect(await getStaffOptionIds(testSchoolA, staff)).toEqual([]);
    const [row] = await testDb!
      .select({ at: schema.staffUsers.profileCompletedAt })
      .from(schema.staffUsers)
      .where(eq(schema.staffUsers.id, staff));
    expect(row.at).toBeNull();
  });

  it("rejects two options of a single-select category", async () => {
    await expect(
      setStaffOptions(testSchoolA, staff, grade.options.map((o) => o.id), SELF),
    ).rejects.toMatchObject({ code: "too_many" });
  });

  it("rejects a selection without a required category", async () => {
    await expect(
      setStaffOptions(testSchoolA, staff, [subject.options[0].id], SELF),
    ).rejects.toMatchObject({ code: "required_missing" });
  });

  it("hides an archived option the user still holds, but keeps the row", async () => {
    const [math, english] = subject.options;
    await setStaffOptions(testSchoolA, staff, [math.id, english.id, grade.options[0].id], SELF);
    await replaceCategory(testSchoolA, subject.id, {
      ...category("מקצוע", true, false, []),
      options: [{ id: math.id, label: "מתמטיקה" }],
    });

    expect((await getStaffOptionIds(testSchoolA, staff)).sort()).toEqual(
      [math.id, grade.options[0].id].sort(),
    );
    expect((await listStaffLabels(testSchoolA))[staff]).not.toContain(english.id);
    await expect(
      setStaffOptions(testSchoolA, staff, [english.id, grade.options[0].id], SELF),
    ).rejects.toMatchObject({ code: "unknown_option" });
    const kept = await testDb!
      .select()
      .from(staffProfileOptions)
      .where(eq(staffProfileOptions.optionId, english.id));
    expect(kept).toHaveLength(1);
  });

  it("hides the labels of an archived category", async () => {
    await setStaffOptions(testSchoolA, staff, [subject.options[0].id, grade.options[0].id], SELF);
    await archiveCategory(testSchoolA, subject.id);
    expect(await getStaffOptionIds(testSchoolA, staff)).toEqual([grade.options[0].id]);
  });

  it("does not list deactivated staff under any label", async () => {
    const gone = await createStaff(testSchoolA);
    await setStaffOptions(testSchoolA, gone, [grade.options[0].id], SELF);
    await setStaffOptions(testSchoolA, staff, [grade.options[0].id], SELF);
    await testDb!
      .update(schema.staffUsers)
      .set({ status: "deactivated" })
      .where(eq(schema.staffUsers.id, gone));

    const labels = await listStaffLabels(testSchoolA);
    expect(labels[staff]).toEqual([grade.options[0].id]);
    expect(labels[gone]).toBeUndefined();
    expect(await listStaffLabels(testSchoolB)).toEqual({});
  });

  it("knows which active staff belong to the school", async () => {
    expect(await isActiveStaffOfSchool(testSchoolA, staff)).toBe(true);
    expect(await isActiveStaffOfSchool(testSchoolB, staff)).toBe(false);
    expect(await isActiveStaffOfSchool(testSchoolA, await createStaff(testSchoolA, "deactivated"))).toBe(false);
  });

  describe("admin-assigned categories", () => {
    let role: ProfileCategory; // admin-assigned, single-select, required
    let admin: string;

    beforeEach(async () => {
      if (shouldSkip()) return;
      role = await createCategory(testSchoolA, {
        name: "תפקיד",
        multiSelect: false,
        required: true,
        adminAssigned: true,
        options: [{ label: "מורה", permissions: ["rooms.book"] }, { label: "מזכירות" }],
      });
      admin = await createStaff(testSchoolA);
    });

    const byAdmin = () => ({ kind: "admin", actorStaffId: admin }) as const;

    it("a self save that includes an admin-assigned option is refused", async () => {
      await expect(
        setStaffOptions(testSchoolA, staff, [grade.options[0].id, role.options[0].id], SELF),
      ).rejects.toMatchObject({ code: "admin_assigned" });
    });

    it("a self save of free labels keeps the admin-assigned ones", async () => {
      await setStaffOptions(testSchoolA, staff, [grade.options[0].id, role.options[0].id], byAdmin());
      await setStaffOptions(testSchoolA, staff, [grade.options[1].id, subject.options[0].id], SELF);
      expect((await getStaffOptionIds(testSchoolA, staff)).sort()).toEqual(
        [grade.options[1].id, subject.options[0].id, role.options[0].id].sort(),
      );
    });

    it("a required admin-assigned category does not block a self save", async () => {
      await expect(setStaffOptions(testSchoolA, staff, [grade.options[0].id], SELF)).resolves.toBeUndefined();
    });

    it("an admin save replaces both kinds and is audited", async () => {
      await setStaffOptions(testSchoolA, staff, [grade.options[0].id, role.options[0].id], byAdmin());
      const ids = [grade.options[1].id, role.options[1].id];
      await setStaffOptions(testSchoolA, staff, ids, byAdmin());
      expect((await getStaffOptionIds(testSchoolA, staff)).sort()).toEqual([...ids].sort());

      const audits = await testDb!
        .select()
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.actorStaffId, admin), eq(schema.auditLog.action, "staff.labels_set")));
      expect(audits).toHaveLength(2);
      expect(audits[1]).toMatchObject({
        schoolId: testSchoolA,
        targetTable: "staff_users",
        targetId: staff,
      });
      expect(audits.map((a) => a.payload)).toContainEqual({ optionIds: ids });
    });

    it("a self save writes no audit row", async () => {
      await setStaffOptions(testSchoolA, staff, [grade.options[0].id], SELF);
      const audits = await testDb!
        .select()
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.targetId, staff), eq(schema.auditLog.action, "staff.labels_set")));
      expect(audits).toHaveLength(0);
    });
  });
});
