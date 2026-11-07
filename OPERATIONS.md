# Operations

End-to-end runbook for setting up, deploying, and operating the School Gantt Chart System.

## 1. Environment variables

Copy `.env.example` to `.env.local` and fill these in:

| Variable | Purpose | Where it's used |
|----------|---------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | client + middleware |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | client auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (admin operations) | `lib/db/supabase-admin.ts` only |
| `DATABASE_URL` | Postgres connection. On Vercel use the Supabase **transaction pooler** (port 6543): the session pooler caps at 15 clients and each function instance opens up to 10 (`EMAXCONNSESSION`). Used by migrations + the `db` pool | `lib/db/client.ts` |
| `TEST_DATABASE_URL` | Separate Postgres for integration tests; tests skip if absent | `test/integration/setup.ts` |
| `NEXT_PUBLIC_APP_URL` | Public base URL; unset on Preview (links use the request origin) | email links, provisioning |
| `GROQ_API_KEY` / `AI_MODEL` | Staff AI chat + smart adder. Unset = AI hidden (Production today) | `lib/ai/` |
| `GITHUB_SUPPORT_REPO` / `GITHUB_SUPPORT_TOKEN` | Staff "עזרה" form → issues in the private support repo. Unset = Help link hidden. Setup: §9 "Support reports" | `lib/support/` |
| `TEST_LOGIN_ENABLED` | Enables the e2e test login route. Never on Production | `app/api/v1/auth/login` |
| `PLAYWRIGHT_BASE_URL` / `VERCEL_AUTOMATION_BYPASS_SECRET` | Run e2e against a deployment (bypass needed for protected previews). Revoke the bypass after testing | `playwright.config.ts` |

Never commit `.env.local`. The `.env.example` file is the canonical list of expected variables.

> ⚠️ **Never point integration tests at prod.** `DATABASE_URL` and `TEST_DATABASE_URL` must resolve to different Supabase projects. Vitest specs under `test/integration/` create events, academic years, invites, etc. without teardown — running them against prod pollutes the public viewer. If you need to clean up prior pollution, see `scripts/cleanup-e2e-pollution.sql` (dry-run by default; export `CONFIRM=1` to commit).

## 2. Supabase setup (one-time per tenant)

1. Create a new Supabase project.
2. In **Authentication → Email**, disable "Confirm email" for local dev OR set up SMTP for production.
3. Copy the project URL + anon key into `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Copy the service-role key into `SUPABASE_SERVICE_ROLE_KEY` (server-only — never expose).
5. Copy a Postgres URL into `DATABASE_URL`:
   - Prefer **Project Settings → Database → Connection pooling → URI** for local development and IPv4-only hosts. Supabase direct DB hosts are often IPv6-only.
   - Direct URLs from **Connection String → URI** are fine only when the runtime has IPv6 connectivity.

## 3. Migrations

Schema lives in `lib/db/schema.ts`. To apply schema changes:

```bash
pnpm db:generate        # writes a new .sql file to db/migrations/
pnpm db:migrate         # applies pending migrations against DATABASE_URL
```

Migration files are immutable once committed — add a new file rather than editing existing ones.

The initial migrations (`0001_init.sql..0010_*.sql`) also install the `school_isolation` RLS policy and the `authenticated` role that `withSchool` switches into. Re-running `db:migrate` on a fresh Supabase project bootstraps everything.

## 4. Seeding

```bash
pnpm seed              # demo school + admin + 6 grade editors + counselor + 11 event types
pnpm seed:perf         # adds 1 000 approved events spread across the active year
```

Seed is idempotent: re-running upserts the demo rows without duplicating.

Default credentials after `pnpm seed`:

| User | Email | Password |
|------|-------|----------|
| Admin | `admin@demo-school.test` | `ChangeMe123!` |
| Grade 7-12 editors | `grade7@demo-school.test` … `grade12@…` | `ChangeMe123!` |
| Counselor (event-type scope) | `counselor@demo-school.test` | `ChangeMe123!` |

Change these immediately in a non-dev environment.

## 5. Running tests

| Command | What it runs | Needs DB? |
|---------|--------------|-----------|
| `pnpm test:unit` | Vitest pure-function tests | no |
| `pnpm test:integration` | Vitest RLS + DB-bound tests | yes (`TEST_DATABASE_URL`) |
| `pnpm test` | Both projects | no (DB-bound suites skip if `TEST_DATABASE_URL` is unset) |
| `pnpm playwright` | Playwright e2e + axe a11y | partial (most suites skip without `DATABASE_URL`) |

For a true full run, start a dev server against a seeded test DB, then `pnpm playwright`. The `pnpm seed:perf` step is required for `test/e2e/perf.spec.ts`.

## 6. Local development

```bash
pnpm dev               # http://localhost:3000
```

Useful URLs once the demo seed is in place:

- `/` — redirects to login / the user's dashboard
- `/<token>` — Gantt view
- `/schedule?school=<token>` — read-only guest view
- `/<token>/agenda` — mobile agenda
- `/<token>/calendar` — printable yearly calendar

`<token>` is the school's secret link token (`schools.access_token`). The demo seed pins `demo-school` to the fixed token in `db/demo-school.ts` (`dedede…`, 64 chars); slugs such as `/demo-school` return 404.
- `/auth/login` — sign in
- `/dashboard` — editor home (after sign in; monthly view by default)
- `/admin/staff`, `/admin/event-types` — admin only
- `/platform/schools` — platform admins only

The preview launch config (`.claude/launch.json`, port 3100) expects a local Postgres on `localhost:54329`; without Docker/Postgres, verify in the browser on staging with the demo school instead.

## 7. Deployment (Vercel)

```bash
vercel deploy --prod
```

Required project settings:

1. **Environment variables** — paste each variable from `.env.example` into Vercel project settings (production + preview environments separately).
2. **Build command** — `pnpm build` (the default).
3. **Output** — Next.js (auto-detected). Middleware runs on Edge.
4. **Region** — pick a region close to the Supabase project to minimize round-trip latency for `withSchool` transactions.

### Environments

| Env | Git branch | URL | Supabase project |
|-----|-----------|-----|------------------|
| Production | `main` | `school-gantt.vercel.app` | `school-gantt-production` (`mfrtdirkknuvweaiqfzs`) |
| Staging | `staging` | `schoolsync-git-staging-edu-solutions.vercel.app` (Vercel login required) | `school-gantt-staging` (`wmapfuwpdyishfqtzwha`, eu-central-1) |
| Branch previews | any other | `schoolsync-git-<branch>-edu-solutions.vercel.app` | same as staging |

Vercel **Preview** env vars point at the staging project. `NEXT_PUBLIC_APP_URL` is deliberately unset on Preview, so links use the request origin.

**Promotion flow:** feature branch → PR into `staging` → verify on the staging URL → PR `staging` → `main`. A hotfix merged straight into `main` must be merged back into `staging`. Merge only when every check on the PR is green (auto-merge is disabled on the repo).

**After merging to `main`:** confirm Vercel created a production deployment for the commit. A push has been skipped before; if so, deploy that commit by hand and check the project's Git settings.

### Custom domain cutover (`app.edusolutions.co.il`)

Blocked until `edusolutions.co.il` DNS is live (`nslookup edusolutions.co.il 1.1.1.1` must resolve). The code needs no change: every link and email redirect is built from `NEXT_PUBLIC_APP_URL` (fallback: the request origin). The app sends no email of its own since PR #57; the only emails are Supabase Auth's (sign-up confirmation, password reset, the new admin's magic link).

1. **Vercel → school-gantt → Domains:** add `app.edusolutions.co.il` (Production). Create the CNAME Vercel shows at the DNS provider; wait for the certificate.
2. **Keep `school-gantt.vercel.app` serving, no redirect.** Staff and parents already have links and iCal subscriptions on it; calendar clients handle redirects poorly.
3. **Vercel env (Production):** `NEXT_PUBLIC_APP_URL=https://app.edusolutions.co.il`, then redeploy `main`.
4. **Supabase prod → Authentication → URL Configuration:** Site URL `https://app.edusolutions.co.il`; add `https://app.edusolutions.co.il/**` to Redirect URLs (keep the old origin's entry).
5. **Auth email sender:** Resend → add and verify `edusolutions.co.il` (SPF/DKIM records at the DNS provider). Supabase prod → Authentication → SMTP Settings: host `smtp.resend.com`, port 465, user `resend`, password = a Resend API key, sender `no-reply@edusolutions.co.il`, name `EduSolutions`. Without custom SMTP, Supabase's built-in sender is rate-limited to a few emails per hour.
6. **Google OAuth (Google Cloud console):** add `https://app.edusolutions.co.il` to Authorized JavaScript origins. The redirect URI stays the Supabase callback, so nothing else changes.
7. **Company site (EduSolutions repo):** set `NEXT_PUBLIC_GANTT_URL=https://app.edusolutions.co.il`.
8. **Check:** password reset from `/auth/login` arrives from `no-reply@edusolutions.co.il` and its link opens on the new domain; Google sign-in works; an old `school-gantt.vercel.app/<token>` link still opens.

**E2E against staging:** `PLAYWRIGHT_BASE_URL=<staging url> VERCEL_AUTOMATION_BYPASS_SECRET=<from .env.staging.local> pnpm playwright`. Generate the bypass in Vercel → Settings → Deployment Protection; it applies to the whole project, so revoke it afterwards.

**Plans:** Vercel Hobby and Supabase Free today. Hobby forbids commercial use; see `docs/COST_PLAN.md` (PR #55) for upgrade thresholds.

**Data refresh (manual):** `.github/workflows/refresh-staging-db.yml` copies prod's `public` schema plus `auth.users`/`auth.identities` into staging via `scripts/refresh-staging-db.sh` and re-applies staging-only migrations. It does not run on a schedule, so anything created on staging survives until the next refresh. Run it:

```bash
gh workflow run refresh-staging-db.yml --ref staging
```

Required GitHub secrets: `PROD_DATABASE_URL`, `STAGING_DATABASE_URL` (Supabase **session pooler** URIs — runners are IPv4-only). The script only reads from prod and refuses any target that isn't the staging project.

**Demo school on staging (optional):** staging is a copy of prod, so debug against the copied prod school directly. A refresh wipes any `demo-school` tenant. Seed it again only when you need the role-specific test logins (admin, grade editors, counselor, viewer). Point `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` at the **staging** project, then:

```bash
pnpm seed
```

`db/seed.ts` refuses any database or Supabase project that isn't local or staging. Demo logins are the seed accounts listed under "Default credentials after `pnpm seed`" above (forced password change on first login).

**Sales demo school:** `edusolutions-demo` ("תיכון נווה ים (הדגמה)") holds a realistic 2026–2027 year (`db/demo-events.ts`: holidays, trips, exams and bagrut, parent meetings, ceremonies, counseling, grades 7–12). Staging needs a Vercel login, so sales meetings use production:

1. On prod `/platform/schools`, provision slug `edusolutions-demo`, name `תיכון נווה ים (הדגמה)`, admin = a founder's email.
2. `gh workflow run seed-demo-events.yml --ref staging -f target=production -f slug=edusolutions-demo` (re-run any time to reset the demo after a meeting).
3. Copy its guest link from `/platform/schools`.

`scripts/seed-demo-events.ts` deletes and re-inserts only the events of `demo-school` or `edusolutions-demo`, and refuses every other slug. Staging already has an `edusolutions-demo` copy (seeded 2026-11-07); a staging refresh replaces it with prod's.

**Second school on staging:** for manual cross-school checks, provision one with `scripts/provision-school.ts` against staging (the onboarding rehearsal, see "Onboarding checklist for a new school"). Redo it after each refresh. Automated isolation coverage doesn't depend on staging: the integration suite uses its own two test schools, and `test/e2e/multi-school.spec.ts` creates its own `second-school`.

Running `pnpm test:integration` with `TEST_DATABASE_URL` pointed at staging leaves test rows on staging until the next refresh.

## 8. Monitoring & SLOs

The PRD targets and the corresponding observables:

| Target | Where to watch |
|--------|---------------|
| Gantt ≤ 2 s first paint with 1 k events | Vercel "Speed Insights" or Lighthouse run against `/[school]?cb=1` |
| iCal feed ≤ 500 ms response | Vercel function logs (`/ical/[token]`) p95 |
| Public view freshness ≤ 5 s after publish | Manual: publish → watch `/<token>/agenda` |
| Token revocation visible ≤ 60 s | `Cache-Control: max-age=60` on `/ical/[token]` |
| WCAG 2.1 AA — zero serious/critical | `pnpm playwright` running `test/e2e/a11y.spec.ts` |
| Auth lockout — 10 attempts / 15 min | `staff_users.locked_until` updates |

### Backups, uptime and error alerts

All three run on GitHub. **`ofekpol/schoolsync` is public** (Actions logs and artifacts are readable by any signed-in GitHub user), so anything that touches prod data lives in the private repo `ofekpol/schoolsync-support` instead. Collaborators there (Settings → Collaborators) see the issues and backups and get the emails if they Watch → All activity.

| What | Where | How | Alert |
|------|-------|-----|-------|
| **Backup + restore drill** | `schoolsync-support`: `.github/workflows/backup-prod-db.yml` + `scripts/backup-prod-db.sh` | Nightly 23:00 UTC. Dumps prod `public` + `auth.users`/`auth.identities`, restores `public` into a throwaway Postgres 17, checks every table came back and `schools`/`staff_users`/`events`/`event_types` are non-empty, then uploads the dumps **gpg-encrypted** as a 30-day artifact. | A failed run emails whoever last edited the workflow (GitHub's default for scheduled runs). |
| **Uptime** | `schoolsync`: `.github/workflows/uptime.yml` (runs from `main`; live since 2026-11-07) | Every 15 min: `GET /api/health` (app + `select 1`) and `/auth/login` on `school-gantt.vercel.app`, three tries 20 s apart. Touches no secrets or data. | Opens one public `uptime` issue while down (GitHub emails repo watchers) and closes it on recovery. |
| **Server errors** | App → `schoolsync-support` issues | `instrumentation.ts` `onRequestError` → `lib/support/error-report.ts` files an issue labelled `error` (same env as support reports, §9). One issue per fingerprint (route + message) while it's open; at most 10 new ones per server instance; school tokens and query strings are redacted. | GitHub emails the support repo's watchers. |

One-time setup:

1. Backup secrets on the private repo (never on `ofekpol/schoolsync`): `gh secret set PROD_DATABASE_URL --repo ofekpol/schoolsync-support` (session pooler URL), and `openssl rand -base64 32` → save it in your password manager → `gh secret set BACKUP_PASSPHRASE --repo ofekpol/schoolsync-support`. Without the passphrase the job fails on purpose rather than upload plain dumps. **Losing it makes every backup unreadable.**
2. Run the backup once by hand: `gh workflow run backup-prod-db.yml --repo ofekpol/schoolsync-support`.
3. Uptime is live (first run 2026-11-07). GitHub disables scheduled workflows in a **public** repo after 60 days without activity; re-enable uptime in the Actions tab if that happens.
4. Client-side (browser) errors are not reported; only server errors are.

**Restoring from a backup:** download the artifact (`gh run download <run-id> --repo ofekpol/schoolsync-support`), then `gpg --decrypt public.dump.gpg > public.dump` (same for `auth.dump`), and restore with the steps in `scripts/refresh-staging-db.sh` (`restore_staging`), pointed at the target project. Rehearse on staging first.

## 9. Runbooks

### Support reports (staff "עזרה" link)

Staff open `/support` from the header, pick תקלה / שאלה / הצעה and write a message. The app files it as an issue in a **private** GitHub repo, with school, name, email, role, page and browser attached, labelled `bug` / `question` / `idea`. GitHub emails the repo's watchers on every new issue, and the owner watches by default. Each staff member can send 10 reports per 24 h (counted in `audit_log`, action `support_report`). `@mentions` in staff text are defused so a report can't ping GitHub users.

One-time setup:

1. The private repo `ofekpol/schoolsync-support` exists with labels `bug`, `question`, `idea` and `error`. **Never point the app at `ofekpol/schoolsync`, which is public.**
2. GitHub → Settings → Developer settings → Fine-grained tokens: repository access = only `schoolsync-support`; permission Issues = Read and write. Expiry: up to a year, with a calendar reminder.
3. Vercel (Production and Preview): `GITHUB_SUPPORT_REPO=ofekpol/schoolsync-support`, `GITHUB_SUPPORT_TOKEN=<token>`. Redeploy.
4. Check the repo's Watch setting is "All activity" (or at least Issues), and that GitHub → Settings → Notifications sends email.
5. Reply to the staff member from your own email (their address is in the issue), then close the issue.


### "An editor can't sign in — claims password is right"

Check `staff_users.locked_until`. If set in the future, lockout is active (10 failed attempts in the prior 15 min). Either wait it out or zero the column:

```sql
UPDATE staff_users SET locked_until = NULL, login_attempts = 0 WHERE email = '...';
```

### "An editor published an event but it's not showing up publicly"

Public views poll `/api/v1/public/<token>/events/signature` every 5 s; responses carry a 5 s `Cache-Control`, so the new version is at most ~10 s away. Check the event is `status='approved'`, not `draft`, `canceled` or `deleted_at` set.

### "Google Calendar shows an event on the wrong / old date"

Check the stored row and the live feed (`/ical/<token>`) first. If both are right, the client holds a stale copy: the feed signals changes via `SEQUENCE` (`version + FEED_FORMAT_REVISION`) and `LAST-MODIFIED`. Google refreshes in up to ~a day; removing and re-adding the subscription forces it. If the feed output format changed, bump `FEED_FORMAT_REVISION` in `lib/ical/serializer.ts`.

### "Someone needs to revoke an iCal token in a hurry"

Through the API (`DELETE /api/v1/ical-subscriptions/<id>`, the owning staff user) or directly:

```sql
UPDATE ical_subscriptions SET revoked_at = NOW() WHERE token = '...';
```

The public feed `Cache-Control: max-age=60` means a Google Calendar refresh within ~1 min will see 404.

### "We need a new academic year"

There is no admin UI for this (`/admin/year` was removed). Insert the `academic_years` row and set `schools.active_academic_year_id` in the SQL editor of the target project. Public views derive their date range from the school's events.

Events from the previous year remain readable but read-only.

## 10. Security notes

- `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` grant unrestricted DB access — never expose in client bundles, never log.
- The `db` client (`lib/db/client.ts`) imports `supabaseAdmin` and bypasses RLS. ESLint bans importing `supabaseAdmin` outside `lib/db/` (overridden under `lib/db/**`, `db/seed.ts`, and `db/migrations/`).
- Every school-data query must run inside `db.withSchool(schoolId, fn)`. Two known exceptions live in `lib/db/schools.ts` (school link token lookup) and `lib/ical/subscriptions.ts` (iCal token lookup) — both are keyed on a cryptographically-scoped value, document the why inline, and never read another tenant's data.
- Publish/edit transitions go through `lib/events/approval.ts`; cancel-on-delete lives in `lib/events/crud.ts`. Never set `events.status` directly in a route handler.
- Deactivating staff bans their Supabase auth user. To backfill bans for already-deactivated staff (prod SQL editor):

  ```sql
  UPDATE auth.users u
  SET banned_until = now() + interval '876000 hours', updated_at = now()
  FROM staff_users s
  WHERE s.id = u.id AND s.status = 'deactivated'
  RETURNING u.id, u.banned_until;
  ```
- Never put a real school's access token or other secrets into chat, logs or a URL an agent builds. Test against the demo school on staging.

## 12. Provisioning a new school (production tenant)

For real (non-demo) schools, use `scripts/provision-school.ts` rather than the seed. The CLI creates the `schools` row, the 11 default `event_types`, and a Supabase Auth + `staff_users` admin record, then prints a one-time magic link to hand to the admin. No academic year is needed: the public views derive their date range from the school's events.

```bash
pnpm provision:school \
  --slug=kfar-galim \
  --name="כפר גלים" \
  --admin-email=admin@example.com \
  --admin-name="ישראל ישראלי"
```

Flags:

| Flag | Required | Notes |
|------|----------|-------|
| `--slug` | yes | Internal name; `^[a-z0-9-]+$`. Never part of a public URL (guessable) |
| `--name` | yes | Display name (Hebrew OK) |
| `--admin-email` | yes | First admin's real email. Must not already be staff in another school (one login = one school) |
| `--admin-name` | yes | First admin's full name |
| `--locale` | no | `he` (default) or `en` |
| `--timezone` | no | default `Asia/Jerusalem` |

Required env vars at run time: `DATABASE_URL` (prod pooler), `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`.

Behavior:

- Conflict on existing slug → exits 1 with `school with slug "..." already exists — refusing to clobber`.
- Admin Supabase Auth user is created **without a password** — first sign-in is via the magic link the CLI prints, delivered by hand (1 h expiry, Supabase default).
- After first sign-in the admin invites further staff via `/admin/staff` (the standard invite flow); the CLI never creates editors directly.

### From the deployed app (`/platform/schools`)

Platform admins can do the same without a local script: `/platform/schools` has a form (slug, name, admin email/name, language) that runs the same `provisionSchool()` and shows the magic link to pass on to the new admin. It also lists every school with its sign-up and guest links. Anyone else gets a 404.

Platform admins are rows in `platform_admins` (Supabase Auth user ids), not a role or env var, so adding one needs no redeploy. They don't need to be staff in any school. To add one (SQL editor of the target project; the user must have signed in once):

```sql
INSERT INTO platform_admins (auth_user_id)
SELECT id FROM auth.users WHERE email = '<email>'
ON CONFLICT DO NOTHING;
```

Remove with `DELETE FROM platform_admins WHERE auth_user_id = (SELECT id FROM auth.users WHERE email = '<email>');`.

### Onboarding checklist for a new school

Rehearse on staging first (point the env at staging); the next manual staging refresh wipes it.

1. Create the school on `/platform/schools`, or run `pnpm provision:school --slug=<slug> --name=... --admin-email=... --admin-name=...` with prod env loaded.
2. The admin signs in through the magic link (valid 1 hour; afterwards "שכחתם סיסמה?" or Google) and reviews `/admin/event-types`.
3. **Import the existing calendar:** the "ייבוא לוח" button next to "ייצוא" on the dashboard calendar (admin only; opens a dialog). Download the CSV template, fill it in Excel (one row per event; type = an event-type label; grades like `ז,ח` or `כל בית הספר`; empty times = all day), save as "CSV UTF-8", upload. The preview flags bad rows by line; nothing is written until the admin confirms, and a confirm publishes every row in one transaction (up to 500 per file).
4. Invite staff from `/admin/staff` (invite links carry role and grade/event-type scopes) or share the staff sign-up link below.
5. Give the school its links. The CLI prints them, and the school's admin can copy them any time from **School links** on `/admin/staff`. Both carry the school's secret link token (`schools.access_token`, 64 hex chars, random per school):
   - Staff sign-up: `https://<app>/auth/login?school=<token>`. Google or email sign-ups through it land in **that** school's pending list (`/admin/staff`) and need admin approval. Sign-ups without a valid token have no school and no admin sees them. Invites (`/admin/staff`) work regardless.
   - Guest view (read-only, no account): `https://<app>/schedule?school=<token>`. The full viewer is `https://<app>/<token>` (`/calendar`, `/agenda`).
   - A slug never opens a school: `/<slug>`, `?school=<slug>` and plain `/schedule` show nothing about any school. Share links only with that school's community — whoever holds a link sees that one school's calendar.
6. Smoke-check `/<token>`, `/<token>/calendar`, `/<token>/agenda` after the import.

**Look up a school's token** (prod SQL editor): `SELECT slug, access_token FROM schools WHERE slug = '<slug>';`

**Rotate a leaked link** (old links stop working at once; re-send the new ones):

```sql
UPDATE schools SET access_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE slug = '<slug>';
```

Staging refreshes copy `schools.access_token` from prod, so prod links also open the staging copy (staging sits behind Vercel login).

Production cutover (one-time, per new Supabase project):

1. Create the prod Supabase project; copy URL + anon + service-role keys + pooler `DATABASE_URL`.
2. Update Vercel **Production** env vars to point at the prod Supabase. Keep **Preview** scope pointed at the dev Supabase.
3. Apply migrations: `DATABASE_URL=<prod-pooler-url> pnpm db:migrate`.
4. Run `pnpm provision:school …` with prod env loaded.
5. `vercel --prod` to redeploy with the new env.

## 13. Versioning + releases

The repo is single-tenant per Vercel project — production state lives in the linked Supabase project. There is no separate version number. Schema migrations are forward-only.
