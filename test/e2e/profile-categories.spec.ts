import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { Pool } from "pg";

/**
 * Profile categories (E2E): the admin creates a category, an editor is sent to
 * /profile once and picks a label, and the admin finds that editor by label.
 *
 * Uses the auth states from global.setup.ts, so it needs ADMIN_E2E=1 and
 * DATABASE_URL (a local or preview stack with TEST_LOGIN_ENABLED; not the
 * public demo, where these writes are disabled).
 *
 * The category is archived again at the end: while a school has a category,
 * every staff member who has not saved a profile is redirected to /profile,
 * which would break the other specs sharing this school.
 */
const skip = process.env.ADMIN_E2E !== "1" || !process.env.DATABASE_URL;
const CATEGORY = "מקצוע e2e";
const EDITOR_EMAIL = "grade10@demo-school.test";
const BASE = "/api/v1/admin/categories";

test.describe.configure({ mode: "serial" });
test.skip(skip, "ADMIN_E2E=1 and DATABASE_URL required");

async function adminContext(browser: Browser) {
  return browser.newContext({ storageState: "test/e2e/.auth/admin.json" });
}

async function archiveTestCategories(request: APIRequestContext): Promise<void> {
  const res = await request.get(BASE);
  if (!res.ok()) return;
  const { categories } = (await res.json()) as { categories: { id: string; name: string }[] };
  for (const category of categories.filter((c) => c.name === CATEGORY)) {
    await request.delete(`${BASE}/${category.id}`);
  }
}

/** A rerun must start with the editor never having saved a profile. */
async function resetEditorProfile(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await pool.query("UPDATE staff_users SET profile_completed_at = NULL WHERE email = $1", [
      EDITOR_EMAIL,
    ]);
  } finally {
    await pool.end();
  }
}

test.beforeAll(async ({ browser }) => {
  if (skip) return;
  await resetEditorProfile();
  const admin = await adminContext(browser);
  await archiveTestCategories(admin.request);
  await admin.close();
});

test.afterAll(async ({ browser }) => {
  if (skip) return;
  const admin = await adminContext(browser);
  await archiveTestCategories(admin.request);
  await admin.close();
});

test("admin creates a category with two options", async ({ browser }) => {
  const admin = await adminContext(browser);
  const page = await admin.newPage();
  await page.goto("/admin/categories");

  await page.getByRole("button", { name: "הוסף קטגוריה" }).click();
  const form = page.getByRole("form", { name: "הוסף קטגוריה" });
  await form.getByLabel("שם הקטגוריה").fill(CATEGORY);
  await form.getByRole("button", { name: "הוסף אפשרות" }).click();
  await form.getByLabel("אפשרות 1").fill("מתמטיקה");
  await form.getByRole("button", { name: "הוסף אפשרות" }).click();
  await form.getByLabel("אפשרות 2").fill("אנגלית");
  await form.getByRole("button", { name: "שמור" }).click();

  const list = page.getByRole("list", { name: "רשימת קטגוריות" });
  await expect(list).toContainText(CATEGORY);
  await expect(list).toContainText("מתמטיקה · אנגלית");
  await admin.close();
});

test("an editor is sent to /profile once, picks a label and lands on the dashboard", async ({
  browser,
}) => {
  const editor = await browser.newContext({ storageState: "test/e2e/.auth/editor.json" });
  const page = await editor.newPage();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole("group", { name: new RegExp(CATEGORY) }).getByLabel("מתמטיקה").check();
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
  await editor.close();
});

test("admin filters the staff table by the label and sees the editor", async ({ browser }) => {
  const admin = await adminContext(browser);
  const page = await admin.newPage();
  await page.goto("/admin/staff");

  await page.getByLabel("סינון לפי תיוג").selectOption({ label: "מתמטיקה" });
  const list = page.getByRole("list", { name: /./ }).filter({ hasText: EDITOR_EMAIL });
  await expect(list.first()).toBeVisible();
  await expect(page.getByText("admin@demo-school.test")).toHaveCount(0);
  await admin.close();
});
