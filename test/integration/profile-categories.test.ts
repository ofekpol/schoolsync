import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { profileCategories, profileCategoryOptions } from "@/lib/db/schema-profile";
import {
  archiveCategory,
  CategoryError,
  countCategories,
  createCategory,
  listCategories,
  reorderCategories,
  replaceCategory,
} from "@/lib/profile/categories";
import { MAX_CATEGORIES } from "@/lib/validations/profile";
import { shouldSkip, skipIfNoTestDb, testDb, testSchoolA, testSchoolB } from "./setup";

async function clearAll(): Promise<void> {
  if (shouldSkip()) return;
  await testDb!
    .delete(profileCategories)
    .where(inArray(profileCategories.schoolId, [testSchoolA, testSchoolB]));
}

const subject = {
  name: "מקצוע",
  multiSelect: true,
  required: false,
  options: [{ label: "מתמטיקה" }, { label: "אנגלית" }],
};

describe.skipIf(skipIfNoTestDb)("profile categories", () => {
  beforeEach(clearAll);
  afterAll(clearAll);

  it("creates a category and lists it with its options in order", async () => {
    const created = await createCategory(testSchoolA, subject);
    expect(created.options.map((o) => o.label)).toEqual(["מתמטיקה", "אנגלית"]);

    const list = await listCategories(testSchoolA);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "מקצוע", multiSelect: true, required: false });
    expect(list[0].options.map((o) => o.label)).toEqual(["מתמטיקה", "אנגלית"]);
    expect(await countCategories(testSchoolA)).toBe(1);
  });

  it("replace renames, adds and archives options", async () => {
    const created = await createCategory(testSchoolA, subject);
    const [math, english] = created.options;

    const replaced = await replaceCategory(testSchoolA, created.id, {
      name: "מקצוע הוראה",
      multiSelect: false,
      required: true,
      options: [{ id: math.id, label: "מתמטיקה 5 יח״ל" }, { label: "מדעים" }],
    });
    expect(replaced).toMatchObject({ name: "מקצוע הוראה", multiSelect: false, required: true });
    expect(replaced!.options.map((o) => o.label)).toEqual(["מתמטיקה 5 יח״ל", "מדעים"]);
    expect(replaced!.options[0].id).toBe(math.id);

    const [archived] = await testDb!
      .select()
      .from(profileCategoryOptions)
      .where(eq(profileCategoryOptions.id, english.id));
    expect(archived.archivedAt).not.toBeNull();
  });

  it("replace can swap two option labels", async () => {
    const created = await createCategory(testSchoolA, subject);
    const [math, english] = created.options;
    const replaced = await replaceCategory(testSchoolA, created.id, {
      ...subject,
      options: [
        { id: math.id, label: "אנגלית" },
        { id: english.id, label: "מתמטיקה" },
      ],
    });
    expect(replaced!.options.map((o) => o.label)).toEqual(["אנגלית", "מתמטיקה"]);
  });

  it("replace returns null for a category of another school", async () => {
    const created = await createCategory(testSchoolA, subject);
    expect(await replaceCategory(testSchoolB, created.id, subject)).toBeNull();
  });

  it("rejects a duplicate active name and frees it after archiving", async () => {
    const first = await createCategory(testSchoolA, subject);
    await expect(createCategory(testSchoolA, subject)).rejects.toMatchObject({
      code: "duplicate_name",
    });
    expect(await archiveCategory(testSchoolA, first.id)).toBe(true);
    expect(await listCategories(testSchoolA)).toHaveLength(0);
    const second = await createCategory(testSchoolA, subject);
    expect(second.id).not.toBe(first.id);
  });

  it("rejects renaming a category onto another active name", async () => {
    await createCategory(testSchoolA, subject);
    const other = await createCategory(testSchoolA, { ...subject, name: "שכבה" });
    await expect(replaceCategory(testSchoolA, other.id, subject)).rejects.toBeInstanceOf(
      CategoryError,
    );
  });

  it("rejects the category after the limit", async () => {
    for (let i = 0; i < MAX_CATEGORIES; i++) {
      await createCategory(testSchoolA, { ...subject, name: `קטגוריה ${i}`, options: [] });
    }
    await expect(
      createCategory(testSchoolA, { ...subject, name: "אחת יותר מדי" }),
    ).rejects.toMatchObject({ code: "limit_reached" });
  });

  it("reorders categories", async () => {
    const a = await createCategory(testSchoolA, { ...subject, name: "א" });
    const b = await createCategory(testSchoolA, { ...subject, name: "ב" });
    await reorderCategories(testSchoolA, [b.id, a.id]);
    expect((await listCategories(testSchoolA)).map((c) => c.name)).toEqual(["ב", "א"]);
  });

  it("keeps schools apart", async () => {
    const created = await createCategory(testSchoolA, subject);
    expect(await listCategories(testSchoolB)).toEqual([]);
    expect(await archiveCategory(testSchoolB, created.id)).toBe(false);
    expect(await countCategories(testSchoolA)).toBe(1);
  });
});
