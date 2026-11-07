# Multi-School Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app safe and fully working with 2+ schools (strict separation), and make onboarding school #2 a one-command, rehearsed step.

**Architecture:** RLS via `withSchool` already isolates every school-scoped table. This plan closes the holes outside RLS:
- give the global `pending_registrations` table a `school_id`;
- guard the service-role side effect in `updateStaffUser`;
- remove the "first school wins" `/schedule`.

Signup carries school context from a `?school=<slug>` link. The staging refresh becomes manual. Staging has no permanent demo school: the second tenant there is a school provisioned with `provision-school.ts` as the onboarding rehearsal.

**Tech Stack:** Next.js 15 App Router, Drizzle + pg, Supabase Auth, Zod, Vitest (unit + real-Postgres integration), Playwright, GitHub Actions.

**Spec:** `C:\Users\ofekp\.claude\plans\since-we-are-getting-proud-boole.md` (approved design; Context lists the 4 holes with file:line).

## Global Constraints

- Branch `feature/multi-school-readiness` from `staging`; merge back into `staging`, never commit to `main`.
- New migration file only: `db/migrations/0016_pending_registrations_school.sql`. Never edit existing migrations.
- Raw `db` / `supabaseAdmin` only inside `lib/db/`.
- School ids come from the session (`user.schoolId`) or are server-resolved from a slug, never from a client-sent id.
- Slug format is `^[a-z0-9-]+$`, length 2–64, the same rule `ProvisionSchoolInput` uses in `lib/db/provision.ts`.
- Auth pages (`app/auth/*`) use inline Hebrew strings today. Match that in those files and don't introduce `t()` there.
- Functions < 50 lines, no `any`, Zod at API boundaries.
- `OPERATIONS.md` currently has uncommitted user edits. Before touching it, show `git diff OPERATIONS.md` and keep those edits out of our commits (`git add -p`), unless the user says otherwise.

## Review Focus

1. **Cross-school pending actions.** School B's admin approves or rejects a pending row that belongs to school A, or that has `school_id = NULL`. Expected: 404, no staff row created, `deleteUser` never called. *(Task 2)*
2. **Tampered `?school=` value.** A garbage or unknown `?school=` value (`../x`, `UPPER`, a slug that doesn't exist) on login, register or the OAuth callback. Expected: treated as "no school", with no error page and no crash. *(Task 3)*
3. **Email signup after the orphan row is removed.** The user confirms their email, then signs in with no staff row. Expected: they land on `/auth/pending`, not bounced back to `/auth/login`. *(Task 3)*
4. **`updateStaffUser` targeting another school.** Called with only scope fields (no column updates) for another school's user id. Expected: not-found before any `editor_scopes` delete or insert. *(Task 4)*
5. **Seed command aimed at prod.** `pnpm seed` run with a prod `DATABASE_URL`. Expected: it refuses before connecting. *(Task 1)*

---

### Task 1: Staging refresh is manual; seed refuses prod

**Files:**
- Modify: `.github/workflows/refresh-staging-db.yml`
- Modify: `db/seed.ts` (`main()` guard)
- Modify: `OPERATIONS.md` §7 "Data refresh"
- Test: `test/unit/db/seed-guard.test.ts`

**Interfaces:**
- Produces: `export function assertSeedTargetAllowed(databaseUrl: string | undefined): void` in `db/seed.ts`.

- [ ] **Step 1: Branch.** `git fetch && git checkout -b feature/multi-school-readiness origin/staging`.
- [ ] **Step 2: Write the failing test** `test/unit/db/seed-guard.test.ts`:
  - `"allows localhost"`: `postgres://u:p@localhost:5432/db` and `127.0.0.1` do not throw.
  - `"allows the staging project"`: a URL containing `wmapfuwpdyishfqtzwha` does not throw.
  - `"refuses any other host"`: `postgres://u:p@db.abcprodref.supabase.co:5432/postgres` throws `/refusing to seed/`.
  - `"refuses when unset"`: `undefined` throws `/refusing to seed/`.
  - `db/seed.ts` imports `@/lib/db/client`, so mock it with `vi.mock` the way other unit tests do.
- [ ] **Step 3:** Run `pnpm test:unit test/unit/db/seed-guard.test.ts`. Expected: FAIL, because `assertSeedTargetAllowed` is not exported.
- [ ] **Step 4: Implement `assertSeedTargetAllowed`.**
  - Allow when the URL host is `localhost` / `127.0.0.1`, or the URL contains the constant `STAGING_PROJECT_REF = "wmapfuwpdyishfqtzwha"` (the same ref `scripts/refresh-staging-db.sh` checks).
  - Otherwise throw `Error("refusing to seed: DATABASE_URL is not local or staging")`.
  - Call it first thing in `main()` with `process.env.DATABASE_URL`.
- [ ] **Step 5:** Run the test. Expected: PASS.
- [ ] **Step 6: Workflow changes.**
  - Delete the `schedule:` block (lines 4–5) and keep `workflow_dispatch:`.
  - No seed step: the workflow doesn't need staging Supabase secrets.
- [ ] **Step 7: OPERATIONS.md §7 "Data refresh".**
  - It is now manual only (`gh workflow run refresh-staging-db.yml`).
  - Debugging on staging uses the copied prod school directly.
  - `pnpm seed` against staging is optional, only for when role-specific test logins are needed.
  - "Anything created on staging survives until the next manual refresh."
- [ ] **Step 8: Commit.** `chore: make staging refresh manual; seed refuses prod`.

---

### Task 2: Pending registrations are scoped to a school

**Files:**
- Create: `db/migrations/0016_pending_registrations_school.sql`
- Modify: `lib/db/schema.ts:324-334`, `lib/db/pending.ts`, `app/api/v1/admin/staff/pending/route.ts`, `app/(admin)/admin/staff/page.tsx`
- Test: `test/integration/pending.test.ts`, `test/unit/db/pending.test.ts`

**Interfaces:**
- Produces, in `lib/db/pending.ts`:
  - `PendingRegistrationRecord` gains `schoolId: string | null`.
  - `createPendingRegistration(params: { authUserId: string; email: string; fullName: string; googleAvatarUrl?: string | null; schoolId: string | null }): Promise<void>`
  - `listPendingRegistrations(schoolId: string): Promise<PendingRegistrationRecord[]>`
  - `approvePendingRegistration(params)`: params are unchanged, but the row must match `params.schoolId`.
  - `rejectPendingRegistration(params: { pendingId: string; schoolId: string; reviewedBy: string }): Promise<void>`
  - Both throw `Error("pending_registration_not_found")` on a school mismatch.

- [ ] **Step 1: Migration.** Write `0016_pending_registrations_school.sql`:
  ```sql
  ALTER TABLE pending_registrations ADD COLUMN school_id uuid REFERENCES schools(id) ON DELETE CASCADE;
  -- Backfill only while the deployment is single-school (prod today); ambiguous otherwise.
  UPDATE pending_registrations SET school_id = (SELECT id FROM schools)
    WHERE school_id IS NULL AND (SELECT count(*) FROM schools) = 1;
  CREATE INDEX pending_registrations_open_by_school
    ON pending_registrations (school_id) WHERE review_outcome IS NULL;
  ```
  Add `schoolId: uuid("school_id").references(() => schools.id, { onDelete: "cascade" })` to the Drizzle table.
- [ ] **Step 2: Write failing integration tests** in `test/integration/pending.test.ts`:
  - Update existing calls to pass `schoolId: testSchoolA`, and `listPendingRegistrations(testSchoolA)`.
  - Add `describe("PENDING-04: cross-school isolation")`:
    - `"list for school B excludes school A's row"`
    - `"list excludes rows with null school"`
    - `"approve from school B throws pending_registration_not_found and creates no staff row"`: assert that no `staff_users` row has id = the pending auth id.
    - `"reject from school B throws pending_registration_not_found and leaves the row unreviewed"`
- [ ] **Step 3: Write the failing unit test** in `test/unit/db/pending.test.ts`:
  - `"reject with a school mismatch never calls deleteUser"`. The select mock returns `[]` when the query is school-filtered for `OTHER_SCHOOL`; the simplest way is to make the `limit` mock return `[]` for this case.
  - Expect a rejects-with `pending_registration_not_found`, and `deleteUserMock` not called.
- [ ] **Step 4:** Run `pnpm db:migrate`, then `pnpm test:unit test/unit/db/pending.test.ts && pnpm test:integration test/integration/pending.test.ts`. Expected: new tests FAIL.
- [ ] **Step 5: Implement in `lib/db/pending.ts`.**
  - Every select on approve and reject uses `and(eq(id, pendingId), eq(schoolId, params.schoolId))`.
  - The list uses `and(isNull(reviewOutcome), eq(schoolId, schoolId))`.
  - The insert writes `schoolId`.
- [ ] **Step 6: Route `app/api/v1/admin/staff/pending/route.ts`.**
  - GET: `listPendingRegistrations(user.schoolId)`.
  - Reject: pass `schoolId: user.schoolId`.
  - On both approve and reject, map `pending_registration_not_found` to `404 { error: "Not found" }`. Today it is an unhandled 500.
- [ ] **Step 7:** `app/(admin)/admin/staff/page.tsx:29` passes `user.schoolId`.
- [ ] **Step 8:** Run both test files plus `pnpm tsc --noEmit`. Expected: PASS. Then fix the remaining `createPendingRegistration` callers flagged by tsc (`app/auth/callback/route.ts`) by passing `schoolId: null` for now; Task 3 replaces it.
- [ ] **Step 9: Commit.** `fix: scope pending registrations to the admin's school`.

---

### Task 3: Sign-up carries the school via `?school=<slug>`

**Files:**
- Create: `lib/validations/school.ts`
- Modify:
  - Validation: `lib/db/provision.ts` (reuse the schema)
  - Lookup: `lib/db/schools.ts`
  - Pages: `app/auth/login/page.tsx`, `app/auth/register/page.tsx`, `app/auth/pending/page.tsx`
  - Components: `components/auth/GoogleSignInButton.tsx`, `components/auth/RegisterForm.tsx`, `components/auth/GuestViewButton.tsx`
  - Routes: `app/auth/callback/route.ts`, `app/api/v1/auth/register/route.ts`, `app/auth/confirm/route.ts`, `app/api/v1/auth/signin/route.ts`
- Delete: `createStaffUserFromEmailSignup` from `lib/db/staff.ts:197-219`, and `test/integration/email-signup.test.ts`
- Test: `test/unit/auth/confirm-route.test.ts`, `test/unit/auth/register-route.test.ts`, new `test/unit/auth/callback-school.test.ts`, `test/integration/public-routes.test.ts` (or a new `test/integration/schools.test.ts`)

**Interfaces:**
- Consumes: `createPendingRegistration` and `getPendingRegistrationByAuthId` from Task 2.
- Produces:
  - `export const SchoolSlugSchema = z.string().min(2).max(64).regex(/^[a-z0-9-]+$/)` in `lib/validations/school.ts`. `ProvisionSchoolInput.slug` uses it.
  - `export async function resolveSchoolIdFromParam(raw: unknown): Promise<string | null>` in `lib/db/schools.ts`. It runs `SchoolSlugSchema.safeParse`, then `getSchoolBySlug`, then returns the id or `null`. It never throws on bad input.
  - `GoogleSignInButtonProps.school?: string`, `RegisterForm` prop `school?: string`, `GuestViewButton` prop `href?: string` (default `"/schedule"`).

- [ ] **Step 1: Write failing tests.**
  - **Integration (`resolveSchoolIdFromParam`):** returns `testSchoolA` for `"test-a"`; `null` for `"no-such-school"`, `"../x"`, `"UPPER"`, `undefined` and `42`.
  - **Unit `confirm-route.test.ts`:** replace the `createStaffUserFromEmailSignup` expectations with `"creates a pending registration with the school from user_metadata.school"`. Mock `@/lib/db/pending` and `@/lib/db/schools`. Expect `createPendingRegistration` to be called with `{ authUserId, email, fullName, schoolId: "school-uuid" }`; `"skips creation when a pending row already exists"`.
  - **Unit `register-route.test.ts`:** `"stores school slug in user_metadata"`, and `"rejects an invalid school slug with 422"`.
  - **Unit `callback-school.test.ts`:** a no-invite OAuth callback with `?school=test-a` calls `createPendingRegistration` with the resolved id; an unknown slug calls it with `schoolId: null`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement the schema and resolver.** Add `SchoolSlugSchema` and `resolveSchoolIdFromParam`, and point `ProvisionSchoolInput.slug` at the schema.
- [ ] **Step 4: Callback.** `app/auth/callback/route.ts:86`: `schoolId: await resolveSchoolIdFromParam(searchParams.get("school"))`.
- [ ] **Step 5: Register.**
  - `RegisterSchema` gains `school: SchoolSlugSchema.optional()`, and the route puts `school` into `options.data`.
  - The register page reads `?school=` and passes it to `RegisterForm`, which includes it in the POST body.
  - The login↔register links preserve `school`.
- [ ] **Step 6: Confirm.** In `app/auth/confirm/route.ts:75`, replace `createStaffUserFromEmailSignup(...)` with:
  - if `!(await getPendingRegistrationByAuthId(authUser.id))`, then `createPendingRegistration({ authUserId, email, fullName, schoolId: await resolveSchoolIdFromParam(authUser.user_metadata?.school) })`.
  - Keep the `?confirmed=1` redirect. Delete `createStaffUserFromEmailSignup` and `email-signup.test.ts`.
- [ ] **Step 7: Sign-in.** `app/api/v1/auth/signin/route.ts` ends with `redirectTo: resolvedUser ? getPostLoginRedirect(resolvedUser) : "/auth/pending"`, so a confirmed email registrant without a staff row lands on pending. Add a unit case in the existing signin test: `"returns /auth/pending when the user has no staff row"`.
- [ ] **Step 8: Login page.**
  - Read `school` from searchParams and resolve it with `getSchoolBySlug` after `SchoolSlugSchema.safeParse`.
  - When resolved: the heading becomes `כניסה למערכת — {school.name}`, `GoogleSignInButton school={school.slug}`, `GuestViewButton href={`/${school.slug}`}`, and the register link carries `school`.
  - `GoogleSignInButton` sets `callbackUrl.searchParams.set("school", school)` when the prop is present.
- [ ] **Step 9: Pending page.**
  - `app/auth/pending/page.tsx` becomes async: get the auth user via the existing session helper in `lib/auth/session.ts`, then `getPendingRegistrationByAuthId`.
  - When a row exists with `schoolId === null`, add the paragraph `לא זוהה בית ספר לבקשה. בקשו מבית הספר את קישור ההרשמה שלו והירשמו דרכו.`
- [ ] **Step 10:** Run all Task 3 tests plus `pnpm tsc --noEmit && pnpm lint`. Expected: PASS.
- [ ] **Step 11: Commit.** `feat: carry school context through sign-up via ?school= link`.

---

### Task 4: `updateStaffUser` cannot touch another school

**Files:**
- Modify: `lib/db/staff.ts:225-288`, `app/api/v1/admin/staff/[id]/route.ts`
- Test: `test/integration/admin.test.ts`

**Interfaces:**
- Produces: `updateStaffUser` throws `new Response(null, { status: 404, statusText: "Not found" })` when the id is not visible in `schoolId`. The route already maps a thrown `Response` to JSON.

- [ ] **Step 1: Write failing integration tests** in `admin.test.ts`:
  - `"updateStaffUser from school B on a school A user throws 404 and changes nothing"`: rename-only call; afterwards A's user keeps its `fullName`.
  - `"scope-only update from school B leaves A's editor_scopes intact"`: pass `gradeScopes: [7]` and assert A's scope rows are unchanged.
  - `"deactivate from school B never calls signOut"`: `vi.spyOn(supabaseAdmin.auth.admin, "signOut")` (import from `@/lib/db/supabase-admin`) and expect it not to have been called.
- [ ] **Step 2:** Run `pnpm test:integration test/integration/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The first statement inside `withSchool` is an RLS-scoped `tx.select({ id }).from(staffUsers).where(eq(staffUsers.id, staffUserId)).limit(1)`. If there is no row, throw the 404 Response. This happens before the update, the scope rewrite and `signOut`, and an exception inside `withSchool` aborts the transaction.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit.** `fix: block cross-school staff updates and sign-outs`.

---

### Task 5: `/schedule` picks or lists schools

**Files:**
- Modify: `app/(public)/schedule/page.tsx`, `lib/db/schools.ts:72-76` (doc comment)
- Create: `components/public/SchoolPicker.tsx`
- Test: `test/e2e/read-only-schedule.spec.ts`, new `test/unit/views/school-picker.test.tsx`

**Interfaces:**
- Produces: `SchoolPicker({ schools }: { schools: Array<{ slug: string; name: string }> })`, a server component that renders a list of `<Link href={`/${slug}`}>` items. RTL, logical properties, strings via `next-intl` keys `publicViewer.schoolPicker.title` (`בחרו בית ספר` / `Choose a school`), added to `messages/he.json` and `en.json`.

- [ ] **Step 1: Write the failing unit test.** `"renders one link per school to /<slug>"`, with 2 schools giving hrefs `/a` and `/b`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The page: if `schools.length === 0`, then `notFound()`; if exactly 1, keep the current render; otherwise render `<SchoolPicker schools={schools} />`.
  - Update the `listSchools` doc comment to say `/schedule` lists them when there are several.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: E2E.** `read-only-schedule.spec.ts`: when the picker is shown (the e2e DB has 2 schools after Task 6), click `Demo School`, then continue with the existing assertions on `/demo-school`. A trailing `readonly` wrapper isn't needed because `/<slug>` is the public view.
- [ ] **Step 6: Commit.** `fix: /schedule lists schools instead of picking the first`.

---

### Task 6: Cross-school test suite and e2e

**Files:**
- Create: `test/integration/cross-school.test.ts`, `test/e2e/multi-school.spec.ts`
- Modify: `test/e2e/global.setup.ts`

**Interfaces:**
- Consumes: `testSchoolA` / `testSchoolB` and `testDb` from `test/integration/setup.ts`; `withSchool` from `@/lib/db/client`.

- [ ] **Step 1: Table-level denial** (`cross-school.test.ts`).
  - For each of `audit_log`, `academic_years`, `editor_scopes`, `staff_invites`, `staff_event_dismissals`, `event_revisions`:
    - insert a school A row via `testDb` (raw, as setup does);
    - then inside `withSchool(testSchoolB, tx => …)` assert that select-by-id returns `[]`;
    - and that update/delete by id return 0 rows (`.returning()` length 0);
    - and that inserting a row with `schoolId: testSchoolA` rejects (WITH CHECK).
  - Name each `"<table>: school B cannot read/update/delete/insert school A rows"`.
- [ ] **Step 2: Route-level denial.** Follow the session-mocking pattern in `test/integration/events-api.test.ts`. As school B's admin, call A's ids on:
  - `GET/PATCH/DELETE /api/v1/events/[id]`
  - `POST /api/v1/events/[id]/submit`
  - `DELETE /api/v1/admin/staff/invites/[id]`
  - `PATCH/DELETE /api/v1/admin/event-types/[id]`
  - `DELETE /api/v1/ical-subscriptions/[id]`

  Expect a status of 403 or 404, then re-read A's row with `testDb` and assert it is unchanged.
- [ ] **Step 3:** Run `pnpm test:integration test/integration/cross-school.test.ts`. Expected: PASS, since RLS already holds. Any FAIL is a real hole: stop and fix it in the owning module before continuing.
- [ ] **Step 4: E2E second school.** In `test/e2e/global.setup.ts`, after the demo seed, upsert school `second-school` ("Second School"), its event types (`DEFAULT_EVENT_TYPES`), an active academic year, an admin `admin@second-school.test` with the seed temp password and `mustChangePassword: false`, and one approved event `"Second School Only Event"`. Reuse the existing setup's auth helpers.
- [ ] **Step 5: `multi-school.spec.ts`.**
  - `"second-school admin sees only its own staff, event types and events"`: log in as `admin@second-school.test`, then:
    - `/admin/staff` has no `@demo-school.test` emails;
    - `/admin/event-types` loads;
    - the dashboard does not contain demo-school event titles.
  - `"public views are separated"`: `/second-school` contains `"Second School Only Event"`, and `/demo-school` does not.
  - `"/schedule shows a picker with both schools"`.
  - `"login link with ?school=second-school shows the school name"`.
- [ ] **Step 6:** Run `pnpm test:e2e:full test/e2e/multi-school.spec.ts test/e2e/read-only-schedule.spec.ts`. Expected: PASS.
- [ ] **Step 7: Commit.** `test: cross-school isolation suite and multi-school e2e`.

---

### Task 7: Onboarding runbook and fresh-school check

**Files:**
- Modify: `OPERATIONS.md` (new section "Onboarding a new school"); `lib/db/provision.ts` only if Step 2 fails.
- Test: `test/integration/provision.test.ts` (only if Step 2 fails)

- [ ] **Step 1: Check a fresh school.** Against the local/test DB, run `pnpm provision:school --slug=fresh-check --name="Fresh" --admin-email=fresh@check.test --admin-name=Fresh`, then open `/fresh-check`, `/fresh-check/calendar`, `/fresh-check/agenda`, and the dashboard as that admin via the magic link.
- [ ] **Step 2: Decide.**
  - If any page errors because there is no active academic year: write the failing test `"provisionSchool creates the current academic year and sets it active"`, then make `provisionSchool` insert the Sept 1 → Jul 31 year (same computation as `db/seed.ts:106-107`) and set `schools.active_academic_year_id`, inside the existing `withSchool` block. Run it until it passes.
  - Otherwise, skip the code change.
- [ ] **Step 3: Write the runbook in OPERATIONS.md.**
  1. `pnpm provision:school ...` against prod.
  2. The admin logs in through the magic link.
  3. Set the year in `/admin/year` if Step 2 didn't automate it.
  4. Review event types.
  5. Share `https://<app>/auth/login?school=<slug>` as the staff sign-up link, and `https://<app>/<slug>` as the public link.
  6. Smoke-check the public views.

  Add the note: "Rehearse on staging first; the next manual refresh wipes it."
- [ ] **Step 4: Commit.** `docs: onboarding runbook for a new school`.

---

### Task 8: Full verification and staging rollout

- [ ] **Step 1:** Run `pnpm tsc --noEmit && pnpm lint && pnpm test && pnpm build`. Expected: all green.
- [ ] **Step 2:** Run `pnpm test:e2e:full`. Expected: all green.
- [ ] **Step 3: Run the `typescript-reviewer` agent on the branch diff** and address the findings.
- [ ] **Step 4: Prod data check** (read-only, Supabase MCP `execute_sql` on prod). `SELECT count(*) FROM staff_users WHERE school_id IS NULL` lists legacy orphan email signups. Report the count to the user; they stay stuck exactly as before, and an admin can re-invite them. No data change without the user's OK.
- [ ] **Step 5:** With the user's go-ahead, merge to `staging`. Then rehearse onboarding on staging: run `pnpm provision:school --slug=rehearsal-school ...` with the env pointed at staging (Task 7 runbook).
- [ ] **Step 6: Staging check in the built-in browser.**
  - `/schedule` shows both schools.
  - As the `rehearsal-school` admin: `/admin/staff` shows only its own staff, and the pending list doesn't include the prod school's pending rows.
  - `/<prod-slug>` and `/rehearsal-school` each show only their own events.
  - Run Supabase `get_advisors` (security) on staging.
- [ ] **Step 7: Report to the user.** Promotion `staging` → `main` waits for their go-ahead.
