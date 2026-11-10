import { test, expect } from "@playwright/test";

/**
 * Admin staff management (E2E).
 *
 * Uses the admin auth state created by global.setup.ts (test/e2e/.auth/admin.json)
 * instead of a UI login — the app authenticates via Google OAuth, so there is no
 * password form to drive. Requires ADMIN_E2E=1 and DATABASE_URL.
 *
 * Admins onboard staff two ways, both from the "Add staff" dialog: invite
 * links (InviteForm) or direct creation with a one-time generated temp
 * password (AddStaffForm). Tests select the form by `data-testid`.
 */
const enabled = process.env.ADMIN_E2E === "1";
const dbReady = !!process.env.DATABASE_URL;
const skip = !enabled || !dbReady;

test.describe.configure({ mode: "serial" });
test.use({ storageState: "test/e2e/.auth/admin.json" });
test.skip(skip, "ADMIN_E2E=1 and DATABASE_URL required");

test("ADMIN-01 e2e: admin creates an editor invite via the staff page", async ({
  page,
}) => {
  await page.goto("/admin/staff");

  // "Add staff" opens one dialog with two methods; pick the invite link.
  await page.getByRole("button", { name: "הוספת איש צוות" }).click();
  await page.getByRole("radio", { name: /קישור הזמנה/ }).click();
  const form = page.getByTestId("invite-form");
  await expect(form).toBeVisible();

  await form.locator('select[name="role"]').selectOption("editor");
  await form.locator('input[name="invite-grade-10"]').check();
  await form.locator('button[type="submit"]').click();

  // On success the form shows the generated invite URL (contains /invite/).
  await expect(form.getByRole("status").locator("input")).toHaveValue(/\/invite\//, {
    timeout: 10_000,
  });
});

test("ADMIN-04 e2e: admin creates a staff user directly and sees the one-time temp password", async ({
  page,
}) => {
  await page.goto("/admin/staff");

  await page.getByRole("button", { name: "הוספת איש צוות" }).click();
  const form = page.getByTestId("add-staff-form");
  await expect(form).toBeVisible();

  await form.locator('select[name="role"]').selectOption("viewer");
  const email = `e2e-direct-${Date.now()}@demo-school.test`;
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="fullName"]').fill("E2E Direct Viewer");
  await form.locator('button[type="submit"]').click();

  const revealPanel = form.getByTestId("temp-password-panel");
  await expect(revealPanel).toBeVisible({ timeout: 10_000 });
  await expect(revealPanel).toContainText(email);
  await expect(form.locator("code")).toBeVisible();
});
