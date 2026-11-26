import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { Pool } from "pg";

/**
 * Profile permissions (E2E): the admin makes an admin-assigned category whose option
 * grants room booking, assigns it to the viewer, and the viewer sees it read-only on
 * /profile; saving their profile keeps it.
 *
 * Needs ADMIN_E2E=1 and DATABASE_URL (see profile-categories.spec.ts). The category is
 * archived again at the end so other specs sharing the school are not sent to /profile.
 */
const skip = process.env.ADMIN_E2E !== "1" || !process.env.DATABASE_URL;
const CATEGORY = "תפקיד e2e";
const VIEWER_EMAIL = "viewer@demo-school.test";
const BASE = "/api/v1/admin/categories";

test.describe.configure({ mode: "serial" });
test.skip(skip, "ADMIN_E2E=1 and DATABASE_URL required");

interface Category {
  id: string;
  name: string;
  options: { id: string; label: string }[];
}

async function adminContext(browser: Browser) {
  return browser.newContext({ storageState: "test/e2e/.auth/admin.json" });
}

async function testCategories(request: APIRequestContext): Promise<Category[]> {
  const res = await request.get(BASE);
  if (!res.ok()) return [];
  const { categories } = (await res.json()) as { categories: Category[] };
  return categories.filter((c) => c.name === CATEGORY);
}

async function archiveTestCategories(request: APIRequestContext): Promise<void> {
  for (const category of await testCategories(request)) {
    await request.delete(`${BASE}/${category.id}`);
  }
}

async function viewerId(): Promise<string> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const { rows } = await pool.query<{ id: string }>("SELECT id FROM staff_users WHERE email = $1", [
      VIEWER_EMAIL,
    ]);
    return rows[0].id;
  } finally {
    await pool.end();
  }
}

test.beforeAll(async ({ browser }) => {
  if (skip) return;
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

test("admin creates an admin-assigned category whose option books rooms", async ({ browser }) => {
  const admin = await adminContext(browser);
  const page = await admin.newPage();
  await page.goto("/admin/staff?tab=categories");

  await page.getByRole("button", { name: "הוסף קטגוריה" }).click();
  const form = page.getByRole("form", { name: "הוסף קטגוריה" });
  await form.getByLabel("שם הקטגוריה").fill(CATEGORY);
  await form.getByLabel("שיוך על ידי מנהל/ת בלבד").check();
  await form.getByRole("button", { name: "הוסף אפשרות" }).click();
  await form.getByLabel("אפשרות 1").fill("מורה");
  await form.getByRole("group", { name: "הרשאות של מורה" }).getByLabel("הזמנת חדרים").check();
  await form.getByRole("button", { name: "שמור" }).click();

  const list = page.getByRole("list", { name: "רשימת קטגוריות" });
  await expect(list).toContainText(CATEGORY);
  await expect(list).toContainText("מנהל/ת בלבד");
  await admin.close();
});

test("the viewer sees the assigned label read-only, and a self save keeps it", async ({ browser }) => {
  const admin = await adminContext(browser);
  const [category] = await testCategories(admin.request);
  const teacher = category.options[0].id;
  const assigned = await admin.request.put(`/api/v1/admin/staff/${await viewerId()}/labels`, {
    data: { optionIds: [teacher] },
  });
  expect(assigned.status()).toBe(204);
  await admin.close();

  const viewer = await browser.newContext({ storageState: "test/e2e/.auth/viewer.json" });
  const page = await viewer.newPage();
  await page.goto("/profile");
  const group = page.getByRole("group", { name: new RegExp(CATEGORY) });
  await expect(group.getByLabel("מורה")).toBeChecked();
  await expect(group.getByLabel("מורה")).toBeDisabled();
  await expect(group).toContainText("משויך על ידי ההנהלה");

  const refused = await viewer.request.put("/api/v1/profile", { data: { optionIds: [teacher] } });
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toEqual({ error: "admin_assigned" });

  await page.getByRole("button", { name: /שמירה/ }).click();
  await page.goto("/profile");
  await expect(page.getByRole("group", { name: new RegExp(CATEGORY) }).getByLabel("מורה")).toBeChecked();
  await viewer.close();
});
