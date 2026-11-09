# Public demo sandbox ("נסו את המערכת")

Status: approved (revision 3), amended during build (revision 5, see "Build amendments") · 2026-11-09 · branch `feature/demo-sandbox` (from `staging`)

## Goal

A principal who reaches the EduSolutions site can click "נסו הדגמה", land in SchoolSync as the admin of their **own private, throwaway school** that is already filled with a realistic school year, and freely create, edit and cancel events and watch them appear on the dashboard, Gantt, calendar and agenda — without touching real data, seeing any real school's data, or reaching anyone outside the app.

## Decisions (made by the user, 2026-11-09)

| Decision | Choice | Why |
|---|---|---|
| Model | One private demo school **per visitor**, deleted after 24 h | A shared school shows each visitor the previous visitor's edits (possibly offensive) and concurrent edits confuse. |
| Environment | **Production** (`school-gantt.vercel.app`) | Staging and previews sit behind a Vercel login; prod is the only public deployment. Isolation reuses the existing per-school RLS. |
| Visitor role | **Admin**, with every outbound action disabled | Admin shows everything a principal would use; outbound actions would reach real inboxes, GitHub or paid APIs. |
| Sign-in | **Signed demo cookie, no Supabase Auth account** | A real Supabase session lets the visitor call Supabase Auth directly (`PUT /user`) to change the account email to any address, making Supabase mail a stranger and spending the shared email quota. No account means no such path and no Auth users to clean up. This is a deliberate, demo-only exception to the "no custom session cookies" rule in CLAUDE.md; real schools keep Supabase Auth unchanged. |

## Acceptance criteria

1. `GET /demo` (public, Hebrew) explains the demo in two lines and shows a "התחילו הדגמה" button. A GET never creates anything (link prefetchers and bots must not create schools).
2. Pressing the button (`POST /api/v1/demo`) creates a demo school, sets the demo session cookie and redirects to `/dashboard`. Target: under 5 s. Any Supabase session in that browser is signed out first, so the visitor lands in the demo.
3. The demo school has: name "תיכון נווה ים (הדגמה)", a unique slug (`demo-<random>`), the default event types, default grade colors, the 2026–2027 academic year, the events from `db/demo-events.ts` (published), and one admin staff user (`id` = random UUID, no Auth user, email `demo-<uuid>@demo.edusolutions.invalid`, `must_change_password = false`, `status = 'active'`). `schools.demo_expires_at = now() + 24h`.
4. Every staff page of a demo school shows a persistent banner: "זוהי סביבת הדגמה — הנתונים יימחקו ב-<time>" with "התחלה מחדש" (new demo) and "חזרה לאתר" (EduSolutions site) links.
5. The visitor can create, edit, publish and cancel events, edit event types and grade colors, import a CSV, open the school's guest link (public Gantt/calendar/agenda) and the personal iCal feed. Changes appear on the public views within the existing 5 s bar.
6. For a demo school these are refused server-side with 403 `{ error: "demo_disabled" }` **and** hidden in the UI:
   - creating or editing staff (`POST /api/v1/admin/staff`, `PATCH /api/v1/admin/staff/[id]`), invites (`GET/POST /api/v1/admin/staff/invites`, `DELETE …/invites/[id]`), pending sign-ups (`GET/POST /api/v1/admin/staff/pending`)
   - `POST /api/v1/auth/change-password`, `POST /api/v1/support`
   - all `/api/v1/ai/*` routes (even once `GROQ_API_KEY` is set)
   - the school's staff sign-up link is not shown; `/auth/login?school=<demo token>`, `/auth/register` and the OAuth callback refuse to attach a pending registration to a demo school.
   The builder audits every route under `app/api/v1/` and every server action for anything else that sends mail, calls GitHub/Groq, or creates accounts, and adds it to this list.
7. A demo visitor can never read or write another school's rows. Beyond RLS, every event writer (create draft, publish, PATCH, CSV import) checks that the supplied event type belongs to the caller's school **for admins too** (today `isEventTypeAllowed` and the publish route skip this for admins, and the FK on `event_type_id` is not tenant-scoped). Event-route `[id]` params are validated as UUIDs (malformed → 404, not an uncaught DB error).
8. Demo schools never appear on `/platform/schools`; every `listAllSchools` caller is audited and excludes them.
9. **Expiry is enforced everywhere, not only in layouts:** staff resolution (`getStaffUser`) treats a demo session whose school is expired or missing as signed-out, so API routes return their normal 401 and pages redirect. The middleware redirects page requests with an expired/invalid demo cookie to `/demo?expired=1` ("ההדגמה הסתיימה — התחילו חדשה") and clears the cookie.
10. Abuse limits, enforced atomically: at most 3 demo creations per client IP per hour, at most 100 creations per rolling 24 h in total (= the maximum number of live demos), and no new demo while the database is larger than `DEMO_DB_SIZE_LIMIT_MB` (default 350, checked with `pg_database_size`). Beyond any of them, `/demo` shows "יש עומס כרגע, נסו שוב מאוחר יותר" plus the site's contact link. Only an HMAC of the IP is stored, never the raw IP.
11. Per-demo growth caps (demo schools only): at most 500 event rows, 1,000 event revision rows, 50 event types and 10 iCal subscriptions (revoked ones count; the personal-feed endpoint reuses an existing live subscription), and text limits on every demo write (event title and location ≤ 200 characters, description ≤ 1,000, event-type labels ≤ 60), and a date window on demo events (start no earlier than 2 years ago, end no later than 3 years ahead, at most 366 days long; 400 `demo_date_range`). These cover manual creation, publish, PATCH, cancel, CSV import, event-type and subscription writers. Beyond them, writes return 403 `{ error: "demo_quota" }` (over-length text: 400 `{ error: "demo_text_too_long" }`); the existing forms show their generic error state. Real schools are unaffected.
12. A visitor with a live demo who opens `/demo` sees "המשך להדגמה שלך" and "התחלה מחדש"; starting over deletes their previous demo school immediately (the creation still counts toward the limits).
13. Expired demo schools are deleted with all their rows, opportunistically in `POST /api/v1/demo` (bounded batch, e.g. 20) and daily by a Vercel cron.
14. The EduSolutions site's product card gets a second button "נסו הדגמה" linking to `${NEXT_PUBLIC_GANTT_URL}/demo` (separate PR in `C:\Users\ofekp\Projects\Personal\EduSolutions`; hidden when the env var is empty, like the existing button).

## Approach

### Data (migration `0019_demo_schools.sql` + `lib/db/schema.ts`)
- `schools.demo_expires_at timestamptz NULL` (a school is a demo iff not null), partial index on it.
- `demo_creations (id uuid pk, ip_hash text not null, created_at timestamptz not null default now())` with an index on `created_at` and `(ip_hash, created_at)`. Not tenant data: `REVOKE ALL … FROM authenticated, anon`, accessed only through the service-role client in `lib/db/`. CI's revoke list in `.github/workflows/ci.yml` gets the same table.
- Trigger function `demo_enforce_limits()` (SECURITY DEFINER, since `authenticated` cannot read `schools`) on `events` (insert/update), `event_revisions` (insert), `event_types` (insert/update) and `ical_subscriptions` (insert): for demo schools only, it checks text lengths and, on insert, takes `pg_advisory_xact_lock(hashtext('demo_quota:' || school_id))` and counts the school's rows against the cap, raising `demo_quota` / `demo_text_too_long`. Row-level BEFORE triggers see earlier rows of the same statement, so bulk inserts (CSV import) are counted too.
- The school lookup used by staff resolution returns `demoExpiresAt` (the `schools` table stays unreadable inside `withSchool`, migration 0010).

### Demo session
- Cookie `ss_demo`: `base64url(JSON{ staffId, schoolId, exp })` + `.` + `base64url(HMAC-SHA256(DEMO_SESSION_SECRET, payload))`. `HttpOnly`, `Secure` (except localhost), `SameSite=Lax`, `Path=/` (`Max-Age` below).
- `lib/auth/demo-session.ts`: `signDemoSession`, `verifyDemoSession` (constant-time compare via Web Crypto so the same code runs in middleware and in Node). Fails closed when `DEMO_SESSION_SECRET` is unset or shorter than 32 bytes.
- Cookie `Max-Age` = seconds until `exp` **plus 7 days**, so the browser still sends it after expiry and the app can show the expired screen; `exp` inside the signed payload is what authorizes.
- `middleware.ts`: `/demo`, `/api/v1/demo` and `/api/cron/demo-cleanup` are on the public allowlist (reachable with no cookie or with an expired one). For other routes, a present `ss_demo` is checked **before** any Supabase client is created: valid and unexpired → authenticated for staff/admin routes (platform routes still require Supabase); invalid or expired → clear cookie, redirect `/demo?expired=1` (pages) or 401 (API). With no `ss_demo`, the existing Supabase path runs unchanged.
- `resolveStaffUser` (`lib/auth/session.ts`): if `ss_demo` is present, verify it and never touch Supabase (so the demo works where Supabase is not configured, e.g. CI); otherwise the existing Supabase path. For the demo, load the staff row by `staffId`, and return it only if its `school_id` matches the cookie, the school's `demo_expires_at` is in the future and the row is active. The returned record carries `isDemo: true` and `demoExpiresAt`.
- `POST /api/v1/auth/logout` and every real sign-in path (`/api/v1/auth/login`, `/signin`, OAuth callback) clear `ss_demo`, so a leftover demo cookie cannot shadow a real session. Every direct `getSession()` / `supabase.auth.*` caller is audited: demo users have no Supabase user, so those paths must either be guarded (criterion 6) or tolerate it.

### Creating a demo (`lib/db/demo.ts`; service role allowed here)
1. **Reserve** in one transaction under `pg_advisory_xact_lock(hashtext('demo_create'))`: count `demo_creations` for this IP hash in the last hour and all rows in the last 24 h; if under both limits insert a row and commit. The row is never deleted on failure or start-over (pruned only after 24 h), so it counts toward the limits either way. IP = first `x-forwarded-for` entry on Vercel; IP hash = `HMAC(DEMO_SESSION_SECRET, "ip:" + ip)`.
2. Run the opportunistic cleanup batch.
3. Create the school by reusing provisioning internals: refactor `provisionSchool` (`lib/db/provision.ts`) into a shared core (school row, default event types, admin staff row with a supplied id/email and no Auth user) plus the existing magic-link wrapper; the demo path sets `demo_expires_at`.
4. Insert the demo events through a shared function moved out of `scripts/seed-demo-events.ts` (the script keeps working and keeps its slug allowlist).
5. On any failure after step 1, `deleteDemoSchool` whatever was created and redirect (303) to `/demo?error=unavailable` (the button is a plain form POST, so every outcome is a page).
6. Route handler checks `Origin` equals the app origin, signs out any Supabase session (skipped when Supabase is not configured), sets `ss_demo`, redirects to `/dashboard`.

### Guards
- `assertNotDemo(user)` → 403 `demo_disabled`, used by every route in criterion 6; UI receives `isDemo` and renders nothing for those controls.
- Quotas and text limits are enforced by the migration-0019 trigger inside each writer's own transaction (see Data), so every current and future writer is covered. Writer routes are wrapped in `withDemoLimits` (`lib/auth/demo-guard.ts`), which maps the trigger's errors to the responses in criterion 11. Real schools' validation is unchanged.
- Event-type ownership check (criterion 7) for every role.

### Deleting a demo
- `deleteDemoSchool(schoolId)`: refuses unless `demo_expires_at IS NOT NULL`; one transaction deleting the school's rows from every table with `school_id` or hanging off its staff/events, in dependency order (not all FKs cascade — `db/migrations/0000_initial.sql`), then the school. Idempotent (missing school = success). No external calls.
- Cron: `app/api/cron/demo-cleanup/route.ts`, `vercel.json` `crons` once a day (Hobby allows daily). Added to the middleware public allowlist; the handler requires `Authorization: Bearer ${CRON_SECRET}` (unset or mismatch → 401, constant-time compare). Deletes expired demos in batches and prunes `demo_creations` older than 24 h.

### i18n / RTL
All new strings in `messages/he.json` and `messages/en.json`; logical CSS properties only.

## Non-goals
- Fake extra staff members in the demo (the staff page shows only the demo admin).
- Analytics or lead capture on demo start.
- Making staging or previews public.
- Keeping demo content current past the 2026–2027 year.
- AI features in the demo.
- A tenant-scoped composite foreign key for `events.event_type_id` (the application check in criterion 7 covers it; a schema-level constraint can follow separately).
- Suppressing automatic server-error reports for demo requests: errors in demos are real bugs, and the reporter already deduplicates by fingerprint and caps new issues at 10 per instance. Malformed-id errors are removed at the source (criterion 7).

## Constraints
- Every school-scoped query inside `withSchool`; service-role client only inside `lib/db/`.
- New migration only; never edit existing migrations.
- Zod at API boundaries. The new routes take no request data (`POST /api/v1/demo` is a field-less form; the cron is a GET with a bearer header), so there is nothing to parse; the demo session payload is Zod-validated in `lib/auth/demo-session.ts`.
- Functions < 50 lines, files < 400 lines; no `any`.
- New env vars, set by the user in Vercel (Production and Preview) before promotion: `DEMO_SESSION_SECRET` (≥ 32 random bytes) and `CRON_SECRET`. Demo creation and verification fail closed without the first; cron fails closed without the second.
- CLAUDE.md and OPERATIONS.md updated: the demo-cookie exception to the auth rule, the new env vars, the cron, and that staging refreshes copy live demos (harmless; they expire).

## Risks
- **Vercel Hobby forbids commercial use**; a public sales demo on prod makes that more visible. Already on the go-forward list.
- **Supabase Free limits (500 MB)**: worst case per demo ≈ 500 events × ~1.5 KB + 1,000 revisions × ~2.5 KB ≈ 3.3 MB; × 100 live demos ≈ 330 MB. The `DEMO_DB_SIZE_LIMIT_MB` check stops new demos before the database fills; a typical demo is ≈ 300 rows (< 1 MB).
- **A second session mechanism** means two code paths in middleware and `getStaffUser`; both must be covered by tests so a bug cannot grant a demo cookie access to a real school (the school-match + `demo_expires_at` check is the guard).

## Verification
- `pnpm lint`, `pnpm tsc`, `pnpm test` (CI runs integration tests on real Postgres), `pnpm build`.
- Unit: `signDemoSession`/`verifyDemoSession` round trip, tampered payload, tampered signature, expired, missing/short secret.
- Integration (`test/integration/demo.test.ts`): creation → expected rows (event types, events = `demoEvents().length`, admin, no Auth user); demo admin cannot read `testSchoolA` events; a demo cookie whose `schoolId` is a real school (non-demo) or whose school expired resolves to no user; `deleteDemoSchool` leaves zero rows in every school-owned table and refuses a non-demo school; limits under concurrency (fire 5 reservations at once for one IP with 2 already used → exactly 1 succeeds; same for the global cap) and after start-over; quota boundaries for events, revisions, event types and subscriptions (at the cap ok, one more refused) including concurrent writers; over-length demo text refused while the same text still works for a real school; database-size limit blocks creation (limit set low in the test); foreign event-type id refused for an admin through create, publish and PATCH.
- Route tests for every guarded route in criterion 6 (demo user → 403 `demo_disabled`; normal admin unchanged); event `[id]` routes with a malformed id → 404.
- Middleware tests: `/demo` and `POST /api/v1/demo` reachable with no cookies and with an expired cookie; valid demo cookie reaches `/dashboard`; expired/tampered → `/demo?expired=1` and cookie cleared; demo cookie cannot reach `/platform/*`; cron path reaches its handler without a Supabase cookie; cron handler 401 without/with wrong secret, deletes only expired demos.
- CI: the e2e job today runs Playwright only when `NEXT_PUBLIC_SUPABASE_URL` is set, and CI has only Postgres. Add a step that always runs `test/e2e/demo.spec.ts` against the CI Postgres with a test-only `DEMO_SESSION_SECRET`; every page and route the demo flow touches must work without Supabase configuration when a demo session is present.
- E2E (`test/e2e/demo.spec.ts`): `/demo` → start → banner and seeded events → create and publish an event → it shows on the school's public agenda via its guest link → staff page shows no invite/add controls → logout clears the demo → letting the cookie's `exp` pass (fixed clock or a short-lived test secret) and navigating shows `/demo?expired=1`.
- Manual on the staging preview (built-in browser, Vercel login), then on prod after promotion, desktop and mobile widths; confirm demos never show on `/platform/schools`.

## Build amendments (revision 4)

Changes made while building, each reflected in the sections above:
1. Per-demo caps and text limits are a database trigger (migration 0019) instead of a per-writer `assertDemoQuota` call plus a Zod refinement: same lock-and-count semantics, but no writer can be missed.
2. `POST /api/v1/demo` answers every outcome with a 303 redirect (dashboard, or `/demo?error=busy|unavailable`) instead of a 503, because it is a plain HTML form POST.
3. Over-length demo text returns 400 `demo_text_too_long` (separate from the 403 `demo_quota`), and the forms show their existing generic error rather than a dedicated Hebrew message.
4. Demo events are bounded to a date window (migration 0020, same trigger): an event spanning centuries made the calendar views build tens of thousands of months. Found by the second code inspection.

### Known follow-up (not in this change)
Creating an event that a demo limit then rejects can leave an empty draft (the create route commits the draft before updating and publishing it). The harm is confined to the visitor's own demo (it counts toward its 500-event cap). The fix is making the shared create/submit path one transaction for every school, which is a separate change.
