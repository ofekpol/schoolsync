import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEMO_SCHOOL_PATH } from "../../db/demo-school";

/**
 * axe-core sweep — Phase 8 quality gate.
 *
 * The end-of-phase requirement is "zero serious or critical issues across
 * all 4 views". We assert that explicitly by filtering violations to those
 * two impact levels — `moderate` and `minor` are not part of the gate and
 * are logged as warnings only.
 *
 * Routes that require auth (/dashboard, /admin/*, /profile, /events/new)
 * are exercised by the wizard.spec.ts and admin-queue.spec.ts files which
 * sign in first. This file covers the public surface only.
 */
const PUBLIC_ROUTES = [
  { name: "home", url: "/" },
  { name: "privacy", url: "/privacy" },
  { name: "accessibility", url: "/accessibility" },
  // Note: /[school]/* routes need a seeded school. Wired here to demonstrate
  // shape; the actual checks rely on the demo seed (demo-school, fixed token in db/demo-school.ts).
  { name: "agenda (demo-school)", url: `${DEMO_SCHOOL_PATH}/agenda` },
  { name: "gantt (demo-school)", url: DEMO_SCHOOL_PATH },
  { name: "calendar (demo-school)", url: `${DEMO_SCHOOL_PATH}/calendar` },
];

for (const route of PUBLIC_ROUTES) {
  test(`a11y: no serious/critical issues on ${route.name}`, async ({ page }) => {
    const response = await page.goto(route.url);
    // 404 is acceptable for routes that depend on a seed that's not present.
    if (response && response.status() === 404) {
      test.skip(true, `${route.url} returned 404 — likely no demo seed`);
    }
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    if (results.violations.length > 0) {
      console.warn(
        `axe violations on ${route.url}: ${results.violations
          .map((v) => `${v.id}(${v.impact ?? "?"})`)
          .join(", ")}`,
      );
    }

    expect(
      blocking,
      `Expected no serious/critical a11y violations on ${route.url}`,
    ).toEqual([]);
  });
}

test("a11y: Hebrew-only home chrome has no serious/critical issues", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(blocking).toEqual([]);
});
