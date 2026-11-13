import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  profileCategories,
  profileCategoryOptions,
  staffProfileOptions,
} from "@/lib/db/schema-profile";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

/**
 * RLS for the three profile tables: a school reads and writes its own rows,
 * never sees another school's, and cannot write a row for another school.
 */
describe.skipIf(skipIfNoTestDb)("profile tables RLS", () => {
  const staffId = randomUUID();
  let categoryId: string;
  let optionId: string;

  beforeAll(async () => {
    if (shouldSkip()) return;
    await testDb!.insert(schema.staffUsers).values({
      id: staffId,
      schoolId: testSchoolA,
      email: `profile-rls-${staffId}@test`,
      fullName: "Profile RLS",
      role: "editor",
      status: "active",
    });
    const [category] = await withSchool(testSchoolA, (tx) =>
      tx
        .insert(profileCategories)
        .values({ schoolId: testSchoolA, name: `rls-${staffId}` })
        .returning(),
    );
    categoryId = category.id;
    const [option] = await withSchool(testSchoolA, (tx) =>
      tx
        .insert(profileCategoryOptions)
        .values({ schoolId: testSchoolA, categoryId, label: "rls option" })
        .returning(),
    );
    optionId = option.id;
    await withSchool(testSchoolA, (tx) =>
      tx.insert(staffProfileOptions).values({ staffUserId: staffId, optionId, schoolId: testSchoolA }),
    );
  });

  afterAll(async () => {
    if (shouldSkip()) return;
    // Cascades to options and staff_profile_options.
    await testDb!.delete(profileCategories).where(inArray(profileCategories.id, [categoryId]));
    await testDb!.delete(schema.staffUsers).where(eq(schema.staffUsers.id, staffId));
  });

  it("lets a school read its own rows in all three tables", async () => {
    const counts = await withSchool(testSchoolA, async (tx) => ({
      categories: (await tx.select().from(profileCategories).where(eq(profileCategories.id, categoryId))).length,
      options: (await tx.select().from(profileCategoryOptions).where(eq(profileCategoryOptions.id, optionId))).length,
      labels: (await tx.select().from(staffProfileOptions).where(eq(staffProfileOptions.optionId, optionId))).length,
    }));
    expect(counts).toEqual({ categories: 1, options: 1, labels: 1 });
  });

  it("hides another school's rows in all three tables", async () => {
    const counts = await withSchool(testSchoolB, async (tx) => ({
      categories: (await tx.select().from(profileCategories).where(eq(profileCategories.id, categoryId))).length,
      options: (await tx.select().from(profileCategoryOptions).where(eq(profileCategoryOptions.id, optionId))).length,
      labels: (await tx.select().from(staffProfileOptions).where(eq(staffProfileOptions.optionId, optionId))).length,
    }));
    expect(counts).toEqual({ categories: 0, options: 0, labels: 0 });
  });

  it("rejects inserting a category for another school", async () => {
    await expect(
      withSchool(testSchoolB, (tx) =>
        tx.insert(profileCategories).values({ schoolId: testSchoolA, name: `x-${randomUUID()}` }),
      ),
    ).rejects.toThrow();
  });

  it("rejects inserting an option for another school", async () => {
    await expect(
      withSchool(testSchoolB, (tx) =>
        tx.insert(profileCategoryOptions).values({ schoolId: testSchoolA, categoryId, label: "x" }),
      ),
    ).rejects.toThrow();
  });

  it("rejects inserting a staff label for another school", async () => {
    await expect(
      withSchool(testSchoolB, (tx) =>
        tx.insert(staffProfileOptions).values({ staffUserId: staffId, optionId, schoolId: testSchoolA }),
      ),
    ).rejects.toThrow();
  });

  it("adds a nullable profile_completed_at to staff_users", async () => {
    const [row] = await testDb!
      .select({ at: schema.staffUsers.profileCompletedAt })
      .from(schema.staffUsers)
      .where(eq(schema.staffUsers.id, staffId));
    expect(row.at).toBeNull();
  });
});
