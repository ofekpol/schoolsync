# Service Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A school has a list of services (`gantt`, `timetable`), chosen by platform admins, and the app shows and guards pages accordingly.

**Architecture:** One `services text[]` column on `schools`, read through `lib/db/schools.ts`. A tiny `lib/services.ts` holds the names and `hasService`. Navigation and page guards read the school's services; the three staff layouts share one extracted shell. timeTable gets an empty, guarded shell at `/timetable`.

**Tech Stack:** Next.js 15 App Router, Drizzle + Postgres, Zod, next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-timetable-design.md` (sections "Shared code that changes", "Project 1")

**Branch:** `feature/service-selection` from `staging`. Migration number: **0021**.

## Global Constraints

- The Gantt behaves exactly as today for every existing school, user and URL.
- Existing schools get `{gantt}` from the column default; no data backfill script.
- `schools` is read only through `lib/db/schools.ts`, outside `withSchool`.
- Never edit an existing migration file.
- All user-visible strings through `next-intl`; add to `messages/he.json` first, mirror in `en.json`.
- Zod at every API boundary. No `any`. Functions under 50 lines, files under 400.
- CSS logical properties only (`start`/`end`).
- Service names are exactly `gantt` and `timetable`.
- Out of scope: the `provision:school` CLI keeps the default (`gantt` only); Gantt API routes are not service-guarded (spec, "Known shortcut").

## Review Focus

1. `/timetable` requested without a login: must redirect to `/auth/login`, not render the public viewer (Task 5).
2. A school with only `timetable`: its sign-up link `/auth/login?school=<token>` still works, while `/<token>` and `/schedule?school=<token>` show not-found (Task 5).
3. An empty list or an unknown name in `services`: rejected by Zod with 400 and by the DB check (Tasks 1, 3).
4. `["gantt","gantt"]`: stored once (Task 1).
5. A user of a school without `gantt` opens a bookmarked `/dashboard`, `/events/new` or `/admin/event-types`: lands on `/timetable` (Task 5).
6. A demo user opens `/timetable`: not-found (Task 5).

---

### Task 1: `services` column, helper and school record

**Files:**
- Create: `db/migrations/0021_school_services.sql`
- Create: `lib/services.ts`
- Modify: `lib/db/schema.ts` (the `schools` table)
- Modify: `lib/db/schools.ts` (`PublicSchoolRecord`, `SCHOOL_COLUMNS`)
- Test: `test/unit/services.test.ts`, `test/integration/school-services.test.ts`

**Interfaces:**
- Produces:
  - `SERVICES = ["gantt", "timetable"] as const`, `type Service = (typeof SERVICES)[number]`
  - `ServicesSchema`: Zod, array of `Service`, at least one, output deduplicated
  - `hasService(school: { services: readonly string[] }, service: Service): boolean`
  - `homePathFor(services: readonly string[]): "/dashboard" | "/timetable"` (`/dashboard` when `gantt` is present)
  - `PublicSchoolRecord.services: Service[]`

- [ ] **Step 1: Write the failing unit test** `test/unit/services.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { ServicesSchema, hasService, homePathFor } from "@/lib/services";

describe("services", () => {
  it("accepts known services and removes duplicates", () => {
    expect(ServicesSchema.parse(["gantt", "gantt", "timetable"])).toEqual(["gantt", "timetable"]);
  });
  it("rejects an empty list and unknown names", () => {
    expect(ServicesSchema.safeParse([]).success).toBe(false);
    expect(ServicesSchema.safeParse(["rooms"]).success).toBe(false);
  });
  it("hasService", () => {
    expect(hasService({ services: ["gantt"] }, "gantt")).toBe(true);
    expect(hasService({ services: ["gantt"] }, "timetable")).toBe(false);
  });
  it("homePathFor prefers the Gantt dashboard", () => {
    expect(homePathFor(["gantt", "timetable"])).toBe("/dashboard");
    expect(homePathFor(["timetable"])).toBe("/timetable");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (module not found): `pnpm vitest run test/unit/services.test.ts`

- [ ] **Step 3: Implement `lib/services.ts`** with the four exports above. No `server-only` import: client components use it.

- [ ] **Step 4: Run it, expect PASS.**

- [ ] **Step 5: Write the migration** `db/migrations/0021_school_services.sql`

```sql
-- Which products a school has (docs/superpowers/specs/2026-11-13-timetable-design.md).
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "services" text[] NOT NULL DEFAULT '{gantt}';
--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_services_check"
  CHECK ("services" <@ ARRAY['gantt','timetable']::text[] AND cardinality("services") >= 1);
```

- [ ] **Step 6: Mirror it in `lib/db/schema.ts`**: `services: text().array().notNull().default(sql\`'{gantt}'::text[]\`)` on `schools`, with a one-line comment naming migration 0021.

- [ ] **Step 7: Add `services` to `PublicSchoolRecord` and `SCHOOL_COLUMNS`** in `lib/db/schools.ts`.

- [ ] **Step 8: Write the integration test** `test/integration/school-services.test.ts` (pattern: `test/integration/grade-colors.test.ts`, `describe.skipIf(skipIfNoTestDb)`)

Assertions:
- `getSchoolById(testSchoolA)` returns `services` equal to `["gantt"]`.
- A raw update of `services` to `'{}'` rejects; to `'{rooms}'` rejects.

- [ ] **Step 9: Run** `pnpm db:migrate && pnpm vitest run test/integration/school-services.test.ts`, expect PASS. Run `pnpm tsc`, expect no errors.

- [ ] **Step 10: Commit** `feat: add services column to schools`

---

### Task 2: choose services when creating a school

**Files:**
- Modify: `lib/validations/school.ts` (`ProvisionSchoolInput`)
- Modify: `lib/db/provision.ts` (`SchoolRowInput`, `insertSchool`)
- Modify: `components/platform/ProvisionSchoolForm.tsx`
- Modify: `messages/he.json`, `messages/en.json` (`platform.schools.services.*`)
- Test: `test/unit/db/provision.test.ts`, `test/unit/platform/schools-route.test.ts`

**Interfaces:**
- Consumes: `ServicesSchema`, `Service` (Task 1)
- Produces: `ProvisionSchoolInput.services: Service[]` (default `["gantt"]`); `SchoolRowInput.services?: Service[]`

- [ ] **Step 1: Add failing tests**
  - `provision.test.ts`: make the `db.insert().values` mock capture its argument; `provisionSchool({ ...INPUT, services: ["gantt", "timetable"] })` passes `services: ["gantt", "timetable"]`; `provisionSchool(INPUT)` passes `["gantt"]`.
  - `schools-route.test.ts`: POST with `services: ["rooms"]` returns 400; POST with `services: ["timetable"]` calls `provisionSchool` with it.

- [ ] **Step 2: Run both files, expect FAIL.**

- [ ] **Step 3: Implement.** `services: ServicesSchema.default(["gantt"])` in `ProvisionSchoolInput`; `insertSchool` writes `input.services ?? ["gantt"]`. Demo schools (`lib/db/demo.ts`) pass nothing and keep `gantt`.

- [ ] **Step 4: Add a checkbox group to `ProvisionSchoolForm`** following the form's existing field pattern: one checkbox per entry of `SERVICES`, `gantt` ticked by default, submit disabled when none is ticked. Labels: `platform.schools.services.gantt` = "לוח אירועים (Gantt)", `.timetable` = "מערכת שעות (timeTable)", `.title` = "שירותים".

- [ ] **Step 5: Run the two test files and `pnpm tsc`, expect PASS.**

- [ ] **Step 6: Commit** `feat: choose services when provisioning a school`

---

### Task 3: change a school's services later

**Files:**
- Create: `app/api/v1/platform/schools/[id]/route.ts` (PATCH)
- Create: `components/platform/SchoolServicesForm.tsx`
- Modify: `lib/db/schools.ts` (add `updateSchoolServices`)
- Modify: `app/(platform)/platform/schools/page.tsx` (render the form in each school card)
- Test: `test/unit/platform/school-services-route.test.ts`, extend `test/integration/school-services.test.ts`

**Interfaces:**
- Produces:
  - `updateSchoolServices(schoolId: string, services: Service[]): Promise<boolean>` (false when no such school)
  - `PATCH /api/v1/platform/schools/[id]` body `{ services: Service[] }` → 200 `{ services }`, 400 invalid, 403 not a platform admin, 404 unknown school

- [ ] **Step 1: Write failing route tests** (mock `requirePlatformAdmin` and `updateSchoolServices` as `schools-route.test.ts` does): 403 when the guard throws a 403 `Response`; 400 for `{ services: [] }`; 404 when the helper returns false; 200 and the helper called with `["gantt","timetable"]`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement the helper and the route.** Reuse the `denyUnlessPlatformAdmin` shape from the sibling `route.ts`; validate the `id` param as a uuid.

- [ ] **Step 4: Integration test**: `updateSchoolServices(testSchoolA, ["gantt","timetable"])` then `getSchoolById` returns both; restore `["gantt"]` in `afterAll`.

- [ ] **Step 5: `SchoolServicesForm`** (client component): props `{ schoolId: string; services: Service[] }`; checkboxes, a Save button, calls the PATCH, shows `platform.schools.services.saved` or `.error`. Removing a service shows `platform.schools.services.hideWarning` = "השירות יוסתר. הנתונים נשמרים." before saving.

- [ ] **Step 6: Run the tests and `pnpm tsc`, expect PASS.**

- [ ] **Step 7: Commit** `feat: edit a school's services on the platform page`

---

### Task 4: extract the shared staff shell (no behavior change)

**Files:**
- Create: `components/staff/StaffShell.tsx`
- Modify: `app/(staff)/layout.tsx`, `app/(admin)/layout.tsx`
- Test: existing `test/unit/staff-loading.test.tsx` and the e2e smoke suite must pass unchanged

**Interfaces:**
- Produces:
  - `requireActiveStaff(): Promise<StaffUserRecord>` in `lib/auth/require-staff.ts`: the four redirects both layouts repeat today (signed out, pending, deactivated, must change password)
  - `<StaffShell user={user} withChat={boolean}>{children}</StaffShell>`: the demo banner, `AppHeader` with nav, support link, name and logout; renders `StaffChatPanel` only when `withChat` and the existing conditions hold

- [ ] **Step 1: Move the duplicated code** from the two layouts into `requireActiveStaff` and `StaffShell`. `(staff)` passes `withChat`; `(admin)` keeps its `viewer → /dashboard` redirect and its `min-h-screen` wrapper. `StaffShell` loads the school first, then builds nav (Task 5 needs the school's services there).

- [ ] **Step 2: Run** `pnpm vitest run test/unit` and `pnpm tsc`, expect PASS with no test edits.

- [ ] **Step 3: Commit** `refactor: share one staff shell between staff and admin layouts`

---

### Task 5: navigation, guards and the timeTable shell

**Files:**
- Create: `lib/auth/service-guard.ts`
- Create: `app/(timetable)/layout.tsx`, `app/(timetable)/timetable/page.tsx`
- Modify: `lib/nav.ts`, `components/staff/StaffShell.tsx`
- Modify: `lib/auth/public-request.ts` (`RESERVED_PREFIXES`)
- Modify: `lib/db/schools.ts` (add `resolveGanttSchoolFromParam`)
- Modify: `app/(staff)/dashboard/page.tsx`, `app/(staff)/events/new/page.tsx`, `app/(admin)/admin/event-types/page.tsx`
- Modify: every caller of `resolveSchoolFromParam` under `app/(viewer)/`, `app/(public)/schedule/`, `app/api/v1/public/`, `app/api/v1/export/`
- Modify: `messages/he.json`, `messages/en.json` (`nav.timetable`, `timetable.shell.*`)
- Test: `test/unit/nav.test.ts` (new), `test/unit/auth/public-request.test.ts`, `test/integration/school-link.test.ts`, `test/e2e/services.spec.ts` (new)

**Interfaces:**
- Consumes: `hasService`, `homePathFor`, `Service` (Task 1); `requireActiveStaff`, `StaffShell` (Task 4)
- Produces:
  - `buildNavLinks(role, isPlatformAdmin = false, services: readonly Service[] = ["gantt"])`
  - `requireService(user: StaffUserRecord, service: Service): Promise<void>`: redirects to `homePathFor(school.services)` when the school lacks it; `notFound()` when that would redirect to the same service
  - `resolveGanttSchoolFromParam(raw: unknown): Promise<PublicSchoolRecord | null>`: `resolveSchoolFromParam` plus `hasService(school, "gantt")`

- [ ] **Step 1: Failing unit tests**
  - `public-request.test.ts`: `shouldBypassAuthRefresh("/timetable")` and `("/timetable/x")` are `false`.
  - `nav.test.ts` (mock `next-intl/server` so `t(key)` returns the key):
    - admin, `["gantt"]` → hrefs `/dashboard`, `/admin/staff`, `/admin/event-types` (today's output, unchanged)
    - admin, `["gantt","timetable"]` → the same plus `/timetable`
    - editor, `["timetable"]` → only `/timetable`
    - admin, `["timetable"]` → `/timetable`, `/admin/staff`

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `"/timetable"` in `RESERVED_PREFIXES` (without it the path matches the public viewer pattern and skips the auth gate); the `services` parameter in `buildNavLinks`; `StaffShell` passes `school?.services`.

- [ ] **Step 4: Run the unit tests, expect PASS.**

- [ ] **Step 5: Guards.** Implement `requireService`. Call `requireService(user, "gantt")` at the top of the dashboard, `events/new` and `admin/event-types` pages. Implement `resolveGanttSchoolFromParam` and use it in the public viewer, `/schedule`, public events API and `.ics` export callers. Leave the auth callers (`resolveSchoolIdFromParam`, sign-up) untouched.

- [ ] **Step 6: Integration test** in `school-link.test.ts`: with school A set to `["timetable"]`, `resolveGanttSchoolFromParam(tokenA)` is null and `resolveSchoolIdFromParam(tokenA)` still returns the id; restore afterwards.

- [ ] **Step 7: timeTable shell.** `app/(timetable)/layout.tsx`: `requireActiveStaff()`, then `notFound()` unless the user has a school with `timetable` and is not a demo user, then `<StaffShell>`. `timetable/page.tsx`: heading `timetable.shell.title` = "מערכת שעות" and text `timetable.shell.empty` = "בקרוב".

- [ ] **Step 8: E2E** `test/e2e/services.spec.ts` (staging demo school, which has `gantt` only; assert on visible content, not status):
  - signed in as the demo admin, `/timetable` shows the not-found page and the header has no timeTable link
  - signed out, `/timetable` ends on `/auth/login`

- [ ] **Step 9: Full check.** `pnpm lint && pnpm tsc && pnpm test && pnpm build`, all green. Run the existing Playwright suite against the preview deployment, expect no new failures.

- [ ] **Step 10: Commit** `feat: service-aware navigation, guards and timeTable shell`

---

## After merging

- Confirm on staging: the demo school looks exactly as before; `/platform/schools` shows the services form.
- Production: no SQL needed. The column default gives Kfar Galim `{gantt}`.
