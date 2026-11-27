import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Rooms (E2E) against the demo seed: the viewer holds "מורה" (rooms.book), grade10 holds no label.
 * Needs ADMIN_E2E=1 (auth states from global.setup.ts). The booking is canceled at the end.
 */
test.skip(process.env.ADMIN_E2E !== "1", "ADMIN_E2E=1 required");
test.describe.configure({ mode: "serial" });

const ROOM = "ספרייה";

/** The next Sunday (8 periods in the demo week) as YYYY-MM-DD, never today. */
function nextSunday(): string {
  const now = new Date();
  const ahead = 7 - now.getUTCDay();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ahead)).toISOString().slice(0, 10);
}

test("a teacher filters free rooms, books two periods, sees them and cancels", async ({ browser }) => {
  const viewer = await browser.newContext({ storageState: "test/e2e/.auth/viewer.json" });
  const page = await viewer.newPage();
  const date = nextSunday();

  await page.goto(`/rooms?date=${date}`);
  await page.getByRole("checkbox", { name: "שיעור 3" }).check();
  await page.getByRole("checkbox", { name: "רק חדרים פנויים" }).check();
  await page.getByRole("button", { name: "הצג" }).click();
  await expect(page).toHaveURL(/periods=3/);
  await expect(page.getByRole("link", { name: ROOM }).first()).toBeVisible();

  await page.getByRole("link", { name: ROOM }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: ROOM })).toBeVisible();
  await page.getByRole("checkbox", { name: /שיעור 3/ }).check();
  await page.getByRole("checkbox", { name: /שיעור 4/ }).check();
  await page.getByRole("button", { name: "הזמנה" }).click();
  await expect(page.getByRole("status")).toHaveText("ההזמנה נשמרה.");

  await page.goto(`/rooms?date=${date}&mine=1`);
  await expect(page.getByRole("table")).toContainText("Demo Viewer");

  // Periods 3 and 4 are one booking group: one cancel frees both.
  await page.getByRole("link", { name: ROOM }).first().click();
  await page.getByRole("button", { name: "ביטול ההזמנה שלי" }).first().click();
  await expect(page.getByRole("status")).toHaveText("ההזמנה בוטלה.");
  await expect(page.getByRole("button", { name: "ביטול ההזמנה שלי" })).toHaveCount(0);
  await viewer.close();
});

test("staff without a room label get the not-found page and 403 from the API", async ({ browser }) => {
  const editor = await browser.newContext({ storageState: "test/e2e/.auth/editor.json" });
  const page = await editor.newPage();
  await page.goto("/rooms");
  await expect(page.getByText("הדף לא נמצא")).toBeVisible();
  expect((await editor.request.get("/api/v1/rooms")).status()).toBe(403);
  await editor.close();
});

test("a11y: no serious/critical issues on /rooms", async ({ browser }) => {
  const viewer = await browser.newContext({ storageState: "test/e2e/.auth/viewer.json" });
  const page = await viewer.newPage();
  await page.goto(`/rooms?date=${nextSunday()}`);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  await viewer.close();
});
