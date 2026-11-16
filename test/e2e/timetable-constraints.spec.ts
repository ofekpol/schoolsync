import { test, expect, type Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";

/**
 * timeTable constraints (E2E): the admin adds a meeting aimed at chosen
 * teachers, opens the collection round and fills in a free day; an editor
 * cannot open the Collect page.
 *
 * Needs ADMIN_E2E=1 and DATABASE_URL (a local stack with TEST_LOGIN_ENABLED on
 * the seed's demo-school). Turns the timetable service on for that school and
 * restores it, and deletes its board, when done.
 */
const skip = process.env.ADMIN_E2E !== "1" || !process.env.DATABASE_URL;
const BOARD = "בדיקת אילוצים";
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
  sql("DELETE FROM tt_boards WHERE name = $1 AND school_id = (SELECT id FROM schools WHERE slug = $2)", [BOARD, SCHOOL_SLUG]);
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

test("admin adds a meeting for two teachers", async ({ browser }) => {
  const page = await (await context(browser, "admin")).newPage();
  await page.goto("/timetable");
  await page.getByLabel("שם הלוח").fill(BOARD);
  await page.getByRole("button", { name: "לוח חדש" }).click();
  await page.waitForURL(/\/timetable\/[0-9a-f-]+\/setup/);
  boardUrl = new URL(page.url()).pathname.replace(/\/setup$/, "");

  await page.goto(`${boardUrl}/setup?tab=teachers`);
  await page.getByRole("button", { name: "הדבקת רשימה" }).click();
  await page.getByRole("textbox", { name: "הדבקת רשימה" }).fill("מורה א\nמורה ב");
  await page.getByRole("button", { name: "הוספה", exact: true }).click();
  await expect(page.getByLabel("שם המורה מורה ב")).toBeVisible();

  await page.goto(`${boardUrl}/setup?tab=constraints`);
  await page.getByLabel("סוג אילוץ").selectOption("meeting");
  await page.getByRole("button", { name: "הוספת אילוץ" }).click();
  const form = page.getByRole("form", { name: "פגישה" });
  await form.getByLabel("מורה א").check();
  await form.getByLabel("מורה ב").check();
  await form.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("פגישה של מורה א, מורה ב, 2 שעות בשבוע ברצף")).toBeVisible();
});

test("admin opens collection and fills in a free day", async ({ browser }) => {
  const page = await (await context(browser, "admin")).newPage();
  await page.goto(`${boardUrl}/collect`);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.getByLabel("תאריך").fill(tomorrow);
  await page.getByRole("button", { name: "פתיחת איסוף" }).click();
  await expect(page.getByText("האיסוף פתוח")).toBeVisible();
  await page.getByRole("button", { name: "מילוי במקום מורה א" }).click();
  await page.getByLabel("יום חופשי").selectOption({ label: "שישי" });
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("1 מתוך 2 ענו")).toBeVisible();
});

test("an editor opening the Collect page lands on /timetable", async ({ browser }) => {
  const page = await (await context(browser, "editor")).newPage();
  await page.goto(`${boardUrl}/collect`);
  await expect(page).toHaveURL(/\/timetable$/);
});

test("the constraints tab and the Collect page have no serious or critical axe issue", async ({ browser }) => {
  const page = await (await context(browser, "admin")).newPage();
  for (const path of [`${boardUrl}/setup?tab=constraints`, `${boardUrl}/collect`]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => v.id)).toEqual([]);
  }
});
