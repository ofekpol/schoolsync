import { test, expect, type Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";

/**
 * timeTable setup (E2E): an admin builds a small board through the five
 * setup tabs; an editor cannot open it.
 *
 * Needs ADMIN_E2E=1 and DATABASE_URL (a local stack with TEST_LOGIN_ENABLED on
 * the seed's demo-school). The spec turns the timetable service on for that
 * school and restores it, and deletes its board, when done.
 */
const skip = process.env.ADMIN_E2E !== "1" || !process.env.DATABASE_URL;
const BOARD = "בדיקה";
const SCHOOL_SLUG = "demo-school";

test.describe.configure({ mode: "serial" });
test.skip(skip, "ADMIN_E2E=1 and DATABASE_URL required");

async function sql(query: string, params: unknown[]): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await pool.query(query, params);
  } finally {
    await pool.end();
  }
}

// Direct SQL: updateSchoolServices is server-only and needs an acting platform admin.
const setServices = (services: string[]) =>
  sql("UPDATE schools SET services = $1 WHERE slug = $2", [services, SCHOOL_SLUG]);
const deleteBoard = () =>
  sql("DELETE FROM tt_boards WHERE name = $1 AND school_id = (SELECT id FROM schools WHERE slug = $2)", [
    BOARD,
    SCHOOL_SLUG,
  ]);

const context = (browser: Browser, role: "admin" | "editor") =>
  browser.newContext({ storageState: `test/e2e/.auth/${role}.json` });

let boardUrl = "";

test.beforeAll(async () => {
  if (skip) return;
  await deleteBoard();
  await setServices(["gantt", "timetable"]);
});

test.afterAll(async () => {
  if (skip) return;
  await deleteBoard();
  await setServices(["gantt"]);
});

test("admin creates a board with classes, subjects and teachers", async ({ browser }) => {
  const page = await (await context(browser, "admin")).newPage();
  await page.goto("/timetable");
  await page.getByLabel("שם הלוח").fill(BOARD);
  await page.getByRole("button", { name: "לוח חדש" }).click();
  await page.waitForURL(/\/timetable\/[0-9a-f-]+\/setup/);
  boardUrl = new URL(page.url()).pathname;

  const grade7 = page.getByLabel("מספר הכיתות בשכבה ז");
  await grade7.fill("3");
  await grade7.press("Enter");
  await expect(page.getByText("ז1 · ז2 · ז3")).toBeVisible();

  await page.getByRole("link", { name: "מקצועות" }).click();
  await page.getByRole("button", { name: "הדבקת רשימה" }).click();
  await page.getByRole("textbox", { name: "הדבקת רשימה" }).fill("מתמטיקה\nאנגלית");
  await page.getByRole("button", { name: "הוספה", exact: true }).click();
  await expect(page.getByLabel("שם המקצוע מתמטיקה")).toBeVisible();

  await page.getByRole("link", { name: "מורים" }).click();
  await page.getByRole("button", { name: "הדבקת רשימה" }).click();
  await page.getByRole("textbox", { name: "הדבקת רשימה" }).fill("מורה א\nמורה ב");
  await page.getByRole("button", { name: "הוספה", exact: true }).click();
  await expect(page.getByLabel("שם המורה מורה א")).toBeVisible();
});

test("a lesson with a teacher leaves the readiness list", async ({ browser }) => {
  const page = await (await context(browser, "admin")).newPage();
  await page.goto(`${boardUrl}?tab=lessons`);
  await page.getByLabel("מתמטיקה, ז1 · שעות").fill("5");
  await page.getByLabel("מתמטיקה, ז1 · מורה").fill("מורה א");
  await page.getByLabel("מתמטיקה, ז1 · מורה").press("Enter");
  await expect(page.getByText("5 מתוך 45")).toBeVisible();
  await expect(page.getByText("מוכן ליצירת מערכת")).toBeVisible();
});

test("a Plata shows as read-only cells in the lessons grid", async ({ browser }) => {
  const page = await (await context(browser, "admin")).newPage();
  await page.goto(`${boardUrl}?tab=plata`);
  await page.getByRole("button", { name: "הקבצה חדשה" }).click();
  const form = page.getByRole("form", { name: "הקבצה חדשה" });
  await form.getByLabel("מקצוע").selectOption({ label: "אנגלית" });
  await form.getByLabel("ז2").check();
  await form.getByLabel("ז3").check();
  await form.getByLabel("מורה ב").check();
  await form.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("ז2, ז3")).toBeVisible();

  await page.goto(`${boardUrl}?tab=lessons`);
  await expect(page.getByText("בהקבצה")).toHaveCount(2);
});

test("an editor opening the setup page lands on /timetable", async ({ browser }) => {
  const page = await (await context(browser, "editor")).newPage();
  await page.goto(boardUrl);
  await expect(page).toHaveURL(/\/timetable$/);
});

test("the setup page has no serious or critical axe issue", async ({ browser }) => {
  const page = await (await context(browser, "admin")).newPage();
  await page.goto(`${boardUrl}?tab=lessons`);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map((v) => v.id)).toEqual([]);
});
