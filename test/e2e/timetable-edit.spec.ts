import { randomUUID } from "crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";

/**
 * timeTable editing (E2E): the principal moves a lesson (with the clash hint),
 * places the unplaced one from the tray, loses a two-tab race, publishes and
 * prints; regenerates only when a solver is configured. An editor cannot open
 * the option page.
 *
 * Needs ADMIN_E2E=1 and DATABASE_URL (a local stack with TEST_LOGIN_ENABLED on
 * the seed's demo-school). No solver: beforeAll inserts a tiny board, a done
 * run and one solution by SQL. Turns the timetable service off again only if it turned it on, and deletes its
 * board when done.
 */
const skip = process.env.ADMIN_E2E !== "1" || !process.env.DATABASE_URL;
const BOARD = "בדיקת עריכת מערכת";
const SCHOOL_SLUG = "demo-school";
const SAVE_TIMEOUT = 15_000;
const SOLVE_TIMEOUT = 120_000;

test.describe.configure({ mode: "serial" });
test.skip(skip, "ADMIN_E2E=1 and DATABASE_URL required");

async function withPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

const deleteBoard = () =>
  withPool((pool) =>
    pool.query("DELETE FROM tt_boards WHERE name = $1 AND school_id = (SELECT id FROM schools WHERE slug = $2)", [BOARD, SCHOOL_SLUG]));
const context = (browser: Browser, role: "admin" | "editor") =>
  browser.newContext({ storageState: `test/e2e/.auth/${role}.json` });

const periods = [1, 2, 3].map((period) => {
  const hour = String(7 + period).padStart(2, "0");
  return { period, start: `${hour}:00`, end: `${hour}:45` };
});
const WEEK = { days: [0, 1].map((day) => ({ day, periods })) };

/**
 * Board ז1, ז2 / מורה א, מורה ב. Math (ז1, א) at Sun 1 and English (ז2, א) at Sun 2
 * share a teacher in adjacent periods; History (ז1, ב) is left unplaced.
 */
async function seed(pool: Pool): Promise<string> {
  const ids = {
    board: randomUUID(), run: randomUUID(), solution: randomUUID(),
    c1: randomUUID(), c2: randomUUID(), ta: randomUUID(), tb: randomUUID(),
    math: randomUUID(), english: randomUUID(), history: randomUUID(),
  };
  const blocks = [
    { id: ids.math, name: "מתמטיקה", classId: ids.c1, teacherId: ids.ta, subjectId: randomUUID() },
    { id: ids.english, name: "אנגלית", classId: ids.c2, teacherId: ids.ta, subjectId: randomUUID() },
    { id: ids.history, name: "היסטוריה", classId: ids.c1, teacherId: ids.tb, subjectId: randomUUID() },
  ];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [school] } = await client.query<{ id: string; year: string }>(
      // Any year of the school satisfies the FK; staging's demo school has no active one.
      `SELECT s.id, coalesce(s.active_academic_year_id,
         (SELECT y.id FROM academic_years y WHERE y.school_id = s.id ORDER BY y.start_date DESC LIMIT 1)) AS year
       FROM schools s WHERE s.slug = $1`, [SCHOOL_SLUG]);
    const s = school.id;
    await client.query("INSERT INTO tt_boards (id, school_id, academic_year_id, name, status, week) VALUES ($1, $2, $3, $4, 'review', $5)",
      [ids.board, s, school.year, BOARD, JSON.stringify(WEEK)]);
    for (const [id, number] of [[ids.c1, 1], [ids.c2, 2]] as const) {
      await client.query("INSERT INTO tt_classes (id, school_id, board_id, grade, number) VALUES ($1, $2, $3, 7, $4)", [id, s, ids.board, number]);
    }
    for (const [id, name] of [[ids.ta, "מורה א"], [ids.tb, "מורה ב"]] as const) {
      await client.query("INSERT INTO tt_teachers (id, school_id, board_id, full_name) VALUES ($1, $2, $3, $4)", [id, s, ids.board, name]);
    }
    for (const b of blocks) {
      await client.query("INSERT INTO tt_subjects (id, school_id, board_id, name) VALUES ($1, $2, $3, $4)", [b.subjectId, s, ids.board, b.name]);
      await client.query("INSERT INTO tt_lesson_blocks (id, school_id, board_id, subject_id, weekly_periods) VALUES ($1, $2, $3, $4, 1)", [b.id, s, ids.board, b.subjectId]);
      await client.query("INSERT INTO tt_block_classes (block_id, class_id, school_id) VALUES ($1, $2, $3)", [b.id, b.classId, s]);
      await client.query("INSERT INTO tt_block_teachers (block_id, teacher_id, school_id) VALUES ($1, $2, $3)", [b.id, b.teacherId, s]);
    }
    // The board's export as executeRun stores it: SolverInput without `profile`.
    const input = {
      version: 1, mode: "solve", timeLimitSeconds: 60, week: WEEK,
      classIds: [ids.c1, ids.c2], teacherIds: [ids.ta, ids.tb],
      blocks: blocks.map((b) => ({ id: b.id, subjectId: b.subjectId, weeklyPeriods: 1, classIds: [b.classId], teacherIds: [b.teacherId], consecutive: false })),
      constraints: [], placements: [],
    };
    await client.query("INSERT INTO tt_runs (id, school_id, board_id, status, input, started_at, finished_at) VALUES ($1, $2, $3, 'done', $4, now(), now())",
      [ids.run, s, ids.board, JSON.stringify(input)]);
    await client.query("INSERT INTO tt_solutions (id, school_id, run_id, board_id, profile, status, score, violations, report_stale) VALUES ($1, $2, $3, $4, 'balanced', 'ok', 0, '[]', false)",
      [ids.solution, s, ids.run, ids.board]);
    for (const [blockId, period] of [[ids.math, 1], [ids.english, 2]] as const) {
      await client.query("INSERT INTO tt_placements (school_id, solution_id, block_id, day, period, pinned) VALUES ($1, $2, $3, 0, $4, false)",
        [s, ids.solution, blockId, period]);
    }
    await client.query("COMMIT");
    return `/timetable/${ids.board}/generate/${ids.run}/${ids.solution}`;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Only the spec that turned the service on turns it off: other specs may toggle it in parallel.
let addedTimetable = false;
let optionUrl = "";

test.beforeAll(async () => {
  if (skip) return;
  await deleteBoard();
  await withPool(async (pool) => {
    const added = await pool.query(
      "UPDATE schools SET services = array_append(services, 'timetable') WHERE slug = $1 AND NOT ('timetable' = ANY(services)) RETURNING id",
      [SCHOOL_SLUG]);
    addedTimetable = (added.rowCount ?? 0) > 0;
    optionUrl = await seed(pool);
  });
});

test.afterAll(async () => {
  if (skip) return;
  await deleteBoard();
  if (addedTimetable) {
    await withPool((pool) =>
      pool.query("UPDATE schools SET services = array_remove(services, 'timetable') WHERE slug = $1", [SCHOOL_SLUG]));
  }
});

const cell = (page: Page, day: number, period: number) => page.getByTestId(`cell-${day}-${period}`);
const lesson = (page: Page, day: number, period: number, subject: string) =>
  cell(page, day, period).getByRole("button", { name: new RegExp(subject) });
const freeTarget = (page: Page, day: number, period: number) =>
  cell(page, day, period).getByRole("button", { name: "העברה לכאן", exact: true });
const placementSaved = (page: Page) =>
  page.waitForResponse((r) => r.url().endsWith("/placements") && r.request().method() === "PATCH", { timeout: SAVE_TIMEOUT });
const tray = (page: Page) => page.getByRole("region", { name: "שיעורים שלא שובצו" });

async function openAdmin(browser: Browser): Promise<Page> {
  const page = await (await context(browser, "admin")).newPage();
  await page.goto(`${optionUrl}?view=class`);
  return page;
}

test("the option page shows a clash-free grid with no serious or critical axe issue", async ({ browser }) => {
  const page = await openAdmin(browser);
  await expect(lesson(page, 0, 1, "מתמטיקה")).toBeVisible();
  await expect(page.getByText("התנגשות", { exact: true })).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.failureSummary ?? ""}`).join("; ")}`)).toEqual([]);
});

test("a selected lesson shows the clash hint and moves to a free slot, pinned", async ({ browser }) => {
  const page = await openAdmin(browser);
  await lesson(page, 0, 1, "מתמטיקה").click();
  await expect(cell(page, 0, 2).getByRole("button", { name: "העברה לכאן (תפוס: מורה א)" })).toBeVisible();
  const saved = placementSaved(page);
  await freeTarget(page, 1, 1).click();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(lesson(page, 1, 1, "מתמטיקה")).toBeVisible();
  await expect(cell(page, 1, 1).getByText("נעוץ", { exact: true })).toBeVisible();
});

test("the tray lesson is placed and the tray empties", async ({ browser }) => {
  const page = await openAdmin(browser);
  await tray(page).getByRole("button", { name: /היסטוריה/ }).click();
  const saved = placementSaved(page);
  await freeTarget(page, 0, 3).click();
  expect((await saved).ok()).toBe(true);
  await expect(tray(page).getByText("כל השיעורים שובצו")).toBeVisible();
  await expect(lesson(page, 0, 3, "היסטוריה")).toBeVisible();
});

test("a move of a lesson another tab already moved shows moved_elsewhere", async ({ browser }) => {
  const first = await openAdmin(browser);
  const second = await openAdmin(browser);
  await lesson(first, 1, 1, "מתמטיקה").click();

  await lesson(second, 1, 1, "מתמטיקה").click();
  const saved = placementSaved(second);
  await freeTarget(second, 1, 2).click();
  expect((await saved).ok()).toBe(true);

  await freeTarget(first, 1, 3).click();
  await expect(first.getByRole("alert").filter({ hasText: "השיעור הוזז בחלון אחר. המערכת נטענה מחדש." })).toBeVisible();
  await expect(lesson(first, 1, 2, "מתמטיקה")).toBeVisible();
});

test("publishing shows the banner and the generate page marks the option published", async ({ browser }) => {
  const page = await openAdmin(browser);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "פרסום המערכת" }).click();
  await expect(page.getByRole("status").filter({ hasText: "זו המערכת שפורסמה" })).toBeVisible({ timeout: SAVE_TIMEOUT });

  await page.goto(optionUrl.replace(/\/[^/]+\/[^/]+$/, ""));
  await expect(page.getByRole("article", { name: "מאוזן" }).getByText("פורסמה", { exact: true })).toBeVisible();
});

test("the print page by class has one table per class", async ({ browser }) => {
  const page = await (await context(browser, "admin")).newPage();
  await page.goto(`${optionUrl}/print?view=class`);
  await expect(page.getByRole("table")).toHaveCount(2);
});

test("regenerate starts a new run that reaches done", async ({ browser }) => {
  test.skip(!process.env.SOLVER_URL, "SOLVER_URL not set");
  test.setTimeout(SOLVE_TIMEOUT + 30_000);
  const page = await openAdmin(browser);
  await page.getByRole("button", { name: "חישוב מחדש" }).click();
  await page.waitForURL(/\/generate$/);
  const history = page.getByRole("region", { name: "חישובים קודמים" });
  await expect(history.getByRole("button", { name: /הסתיים/ })).toHaveCount(2, { timeout: SOLVE_TIMEOUT });
});

test("an editor opening the option page lands on /timetable", async ({ browser }) => {
  const page = await (await context(browser, "editor")).newPage();
  await page.goto(optionUrl);
  await expect(page).toHaveURL(/\/timetable$/);
});
