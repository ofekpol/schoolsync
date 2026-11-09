import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { DEMO_COOKIE, signDemoSession } from "../../lib/auth/demo-session";

/**
 * Public demo sandbox, end to end: /demo → private demo school → publish an
 * event → it shows on the school's public agenda; outbound staff controls are
 * hidden; logout drops the demo; an expired demo cookie lands on the ended screen.
 * Needs only Postgres and DEMO_SESSION_SECRET (no Supabase), so CI runs it on
 * every PR (see .github/workflows/ci.yml "E2E: demo sandbox").
 */
test.skip(
  !process.env.DATABASE_URL || !process.env.DEMO_SESSION_SECRET,
  "DATABASE_URL and DEMO_SESSION_SECRET required — skipping demo e2e",
);

const EVENT_TITLE = `אירוע הדגמה ${Date.now()}`;

/** Tomorrow on the calendar (the agenda lists upcoming events). */
function tomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

test.beforeAll(async () => {
  // Retries and reruns from one runner IP must not trip the 3-per-hour limit.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("delete from demo_creations");
  await pool.end();
});

test("DEMO: a visitor tries the product in a private school", async ({ page, context, baseURL }) => {
  test.setTimeout(90_000);

  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "נסו את הגאנט הבית־ספרי" })).toBeVisible();
  await page.getByRole("button", { name: "התחילו הדגמה" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.getByRole("note").filter({ hasText: "זוהי סביבת הדגמה" })).toBeVisible();

  await page.goto("/events/new");
  const main = page.getByRole("main");
  await main.getByLabel("שם האירוע").fill(EVENT_TITLE);
  await main.locator('input[type="date"]').first().fill(tomorrow());
  await main.getByRole("radio").first().click();
  await main.getByRole("button", { name: "י", exact: true }).click();
  await main.getByRole("button", { name: "פרסם אירוע" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

  await page.goto("/admin/staff");
  await expect(page.getByText("בסביבת ההדגמה לא ניתן להוסיף אנשי צוות")).toBeVisible();
  await expect(page.getByRole("heading", { name: "צור משתמש" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "הזמנות" })).toHaveCount(0);
  await expect(page.locator("#school-link-signup")).toHaveCount(0);
  const guestLink = await page.locator("#school-link-guest").inputValue();
  const token = new URL(guestLink).searchParams.get("school");
  expect(token).toMatch(/^[0-9a-f]{64}$/);

  await page.goto(`/${token}/agenda`);
  await expect(page.getByText(EVENT_TITLE).first()).toBeVisible({ timeout: 20_000 });

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "יציאה" }).click();
  await expect.poll(async () => (await context.cookies()).some((c) => c.name === DEMO_COOKIE)).toBe(false);

  const expired = await signDemoSession(
    {
      staffId: "11111111-1111-4111-8111-111111111111",
      schoolId: "22222222-2222-4222-8222-222222222222",
      exp: Date.now() - 1000,
    },
    process.env.DEMO_SESSION_SECRET!,
  );
  await context.addCookies([{ name: DEMO_COOKIE, value: expired, url: baseURL ?? "http://localhost:3000" }]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/demo\?expired=1/);
  await expect(page.getByText("ההדגמה הסתיימה")).toBeVisible();
});
