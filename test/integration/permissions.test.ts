import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { profileCategories, profileCategoryOptions, staffProfileOptions } from "@/lib/db/schema-profile";
import type { StaffUserRecord } from "@/lib/db/staff";
import { getPermissions, hasPermission } from "@/lib/permissions";
import { archiveCategory, createCategory } from "@/lib/profile/categories";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

const staffIds: string[] = [];

async function createStaff(
  schoolId: string,
  role: StaffUserRecord["role"] = "viewer",
): Promise<StaffUserRecord> {
  const id = randomUUID();
  const record: StaffUserRecord = {
    id,
    schoolId,
    role,
    status: "active",
    email: `perm-${id}@test`,
    fullName: "Permission Holder",
    mustChangePassword: false,
  };
  await testDb!.insert(schema.staffUsers).values({
    id,
    schoolId,
    email: record.email,
    fullName: record.fullName,
    role,
    status: "active",
  });
  staffIds.push(id);
  return record;
}

async function giveOption(user: StaffUserRecord, optionId: string, schoolId = user.schoolId!) {
  await testDb!.insert(staffProfileOptions).values({ staffUserId: user.id, optionId, schoolId });
}

/** An admin-assigned "תפקיד" category in school A: מורה books, מנהל/ת manages. */
async function roleCategory() {
  const created = await createCategory(testSchoolA, {
    name: "תפקיד",
    multiSelect: true,
    required: false,
    adminAssigned: true,
    options: [
      { label: "מורה", permissions: ["rooms.book"] },
      { label: "מנהל/ת", permissions: ["rooms.manage"] },
    ],
  });
  const [teacher, manager] = created.options;
  return { category: created, teacher, manager };
}

async function clearAll(): Promise<void> {
  if (shouldSkip()) return;
  await testDb!
    .delete(profileCategories)
    .where(inArray(profileCategories.schoolId, [testSchoolA, testSchoolB]));
  if (staffIds.length > 0) {
    await testDb!.delete(schema.staffUsers).where(inArray(schema.staffUsers.id, staffIds));
    staffIds.length = 0;
  }
}

describe.skipIf(skipIfNoTestDb)("profile permissions", () => {
  beforeEach(clearAll);
  afterAll(clearAll);

  it("an admin with no labels holds every permission", async () => {
    const admin = await createStaff(testSchoolA, "admin");
    expect([...(await getPermissions(admin))].sort()).toEqual(["rooms.book", "rooms.manage"]);
  });

  it("a viewer holding מורה can book but not manage", async () => {
    const { teacher } = await roleCategory();
    const viewer = await createStaff(testSchoolA);
    await giveOption(viewer, teacher.id);
    expect(await hasPermission(viewer, "rooms.book")).toBe(true);
    expect(await hasPermission(viewer, "rooms.manage")).toBe(false);
  });

  it("rooms.manage implies rooms.book", async () => {
    const { manager } = await roleCategory();
    const viewer = await createStaff(testSchoolA);
    await giveOption(viewer, manager.id);
    expect([...(await getPermissions(viewer))].sort()).toEqual(["rooms.book", "rooms.manage"]);
  });

  it("a deactivated staff member holds nothing, even an admin", async () => {
    const { teacher } = await roleCategory();
    const viewer = await createStaff(testSchoolA);
    await giveOption(viewer, teacher.id);
    expect(await hasPermission({ ...viewer, status: "deactivated" }, "rooms.book")).toBe(false);

    await testDb!
      .update(schema.staffUsers)
      .set({ status: "deactivated" })
      .where(eq(schema.staffUsers.id, viewer.id));
    expect(await hasPermission(viewer, "rooms.book")).toBe(false);

    const admin = await createStaff(testSchoolA, "admin");
    expect(await getPermissions({ ...admin, status: "deactivated" })).toEqual(new Set());
  });

  it("an archived category or option grants nothing", async () => {
    const { category, teacher, manager } = await roleCategory();
    const viewer = await createStaff(testSchoolA);
    await giveOption(viewer, teacher.id);
    await giveOption(viewer, manager.id);
    await testDb!
      .update(profileCategoryOptions)
      .set({ archivedAt: new Date() })
      .where(eq(profileCategoryOptions.id, manager.id));
    expect([...(await getPermissions(viewer))]).toEqual(["rooms.book"]);

    await archiveCategory(testSchoolA, category.id);
    expect(await getPermissions(viewer)).toEqual(new Set());
  });

  it("an option that lost admin assignment grants nothing", async () => {
    const { category, teacher } = await roleCategory();
    const viewer = await createStaff(testSchoolA);
    await giveOption(viewer, teacher.id);
    await testDb!
      .update(profileCategories)
      .set({ adminAssigned: false })
      .where(eq(profileCategories.id, category.id));
    expect(await hasPermission(viewer, "rooms.book")).toBe(false);
  });

  it("no user holds nothing", async () => {
    expect(await hasPermission(null, "rooms.book")).toBe(false);
  });

  it("a school B user holding school A's option gets nothing", async () => {
    const { teacher } = await roleCategory();
    const outsider = await createStaff(testSchoolB);
    await giveOption(outsider, teacher.id, testSchoolB);
    expect(await getPermissions(outsider)).toEqual(new Set());
  });
});
