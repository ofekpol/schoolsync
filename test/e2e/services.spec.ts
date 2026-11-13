import { test, expect } from "@playwright/test";

/**
 * Service selection on the demo school, which has `gantt` only.
 * Assert on what the visitor sees, not on status: the staff layouts stream a
 * loading state first.
 */

test("SERVICES: signed out, /timetable ends on the login page", async ({ page }) => {
  await page.goto("/timetable");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test.describe("signed in as the demo admin", () => {
  test.use({ storageState: "test/e2e/.auth/admin.json" });
  test.skip(
    process.env.ADMIN_E2E !== "1" || !process.env.DATABASE_URL,
    "ADMIN_E2E=1 and DATABASE_URL required",
  );

  test("SERVICES: a gantt-only school gets not-found on /timetable and no timeTable link", async ({ page }) => {
    await page.goto("/timetable");
    await expect(page.getByRole("heading", { name: "הדף לא נמצא" })).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "לוח שנה" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "מערכת שעות" })).toHaveCount(0);
  });
});
