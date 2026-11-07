import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { DEMO_SCHOOL_PATH } from "../../db/demo-school";

/**
 * Two schools side by side: the demo seed's `demo-school` plus a
 * `second-school` this spec upserts directly. Covers the unauthenticated
 * surfaces: only a school's secret link token opens it, slugs open nothing,
 * and no page lists schools. Admin-side isolation lives in
 * test/integration/cross-school.test.ts; token isolation in school-link.test.ts.
 */
test.skip(!process.env.DATABASE_URL, "DATABASE_URL required — skipping DB-dependent e2e");

const SECOND_SLUG = "second-school";
const SECOND_EVENT = "Second School Only Event";

let secondToken = "";

/** Returns the second school's link token. */
async function upsertSecondSchool(pool: Pool): Promise<string> {
  const school = await pool.query<{ id: string; access_token: string }>(
    `INSERT INTO schools (slug, name) VALUES ($1, 'Second School')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, access_token`,
    [SECOND_SLUG],
  );
  const schoolId = school.rows[0].id;
  const token = school.rows[0].access_token;
  const eventType = await pool.query<{ id: string }>(
    `INSERT INTO event_types (school_id, key, label_he, label_en, color_hex, glyph)
     VALUES ($1, 'general', 'כללי', 'General', '#aec7e8', 'G')
     ON CONFLICT (school_id, key) DO UPDATE SET label_en = EXCLUDED.label_en RETURNING id`,
    [schoolId],
  );
  const staffId = randomUUID();
  await pool.query(
    `INSERT INTO staff_users (id, school_id, email, full_name, role)
     VALUES ($1, $2, $3, 'Second Admin', 'admin') ON CONFLICT (email) DO NOTHING`,
    [staffId, schoolId, "admin@second-school.test"],
  );
  const staff = await pool.query<{ id: string }>(
    "SELECT id FROM staff_users WHERE email = 'admin@second-school.test'",
  );
  const existing = await pool.query("SELECT 1 FROM events WHERE school_id = $1 AND title = $2", [
    schoolId,
    SECOND_EVENT,
  ]);
  if (existing.rowCount) return token;
  const event = await pool.query<{ id: string }>(
    `INSERT INTO events (school_id, event_type_id, title, start_at, end_at, all_day, status, created_by)
     VALUES ($1, $2, $3, now() + interval '1 day', now() + interval '1 day 2 hours', false, 'approved', $4)
     RETURNING id`,
    [schoolId, eventType.rows[0].id, SECOND_EVENT, staff.rows[0].id],
  );
  await pool.query("INSERT INTO event_grades (event_id, grade, school_id) VALUES ($1, 10, $2)", [
    event.rows[0].id,
    schoolId,
  ]);
  return token;
}

test.beforeAll(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    secondToken = await upsertSecondSchool(pool);
  } finally {
    await pool.end();
  }
});

test("MULTI: /schedule without a link lists no schools", async ({ page }) => {
  for (const url of ["/schedule", "/schedule?school=demo-school", "/schedule?school=second-school"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "נדרש קישור של בית הספר" })).toBeVisible();
    await expect(page.getByText("Demo School")).toHaveCount(0);
    await expect(page.getByText("Second School")).toHaveCount(0);
  }
});

test("MULTI: slugs open no public view or API", async ({ page, request }) => {
  // The viewer's loading.tsx streams first, so a slug page renders the
  // link-required screen under HTTP 200; assert on what the visitor sees instead.
  for (const path of ["/demo-school", "/second-school/agenda", "/second-school/calendar"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "נדרש קישור של בית הספר" })).toBeVisible();
    await expect(page.getByText(SECOND_EVENT)).toHaveCount(0);
  }
  expect((await request.get("/api/v1/public/second-school/events")).status()).toBe(404);
  expect((await request.get("/api/v1/export/ics?school=second-school")).status()).toBe(404);
});

test("MULTI: each school's link shows only its own events", async ({ page }) => {
  await page.goto(`/${secondToken}/agenda`);
  await expect(page.getByText(SECOND_EVENT).first()).toBeVisible({ timeout: 20_000 });

  await page.goto(`${DEMO_SCHOOL_PATH}/agenda`);
  await expect(page.getByText(SECOND_EVENT)).toHaveCount(0);
});

test("MULTI: a school link shows the school, keeps it on register, and guests stay in it", async ({ page }) => {
  await page.goto(`/auth/login?school=${secondToken}`);
  await expect(page.getByText("Second School")).toBeVisible();
  await expect(page.getByTestId("guest-view-button")).toHaveAttribute(
    "href",
    `/schedule?school=${secondToken}`,
  );
  await page.getByRole("link", { name: "הרשמה" }).click();
  await expect(page).toHaveURL(new RegExp(`/auth/register[?]school=${secondToken}`));
  await expect(page.getByText("Second School")).toBeVisible();
});

test("MULTI: a slug, malformed or unknown ?school= selects no school", async ({ page }) => {
  for (const bad of ["second-school", "demo-school", "..%2Fx", "0".repeat(64)]) {
    const res = await page.goto(`/auth/login?school=${bad}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "כניסה למערכת" })).toBeVisible();
    await expect(page.getByText("Second School")).toHaveCount(0);
    await expect(page.getByTestId("guest-view-button")).toHaveAttribute("href", "/schedule");
  }
});
