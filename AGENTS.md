# School Gantt Chart System

Multi-tenant school event calendar. Each school is a tenant isolated by Postgres RLS.
Staff editors create events in a single-page event form (`components/wizard/WizardShell.tsx`) → publish directly → appears on the public views. No admin approval required.

## Company and landing site

- The app is the first product of **EduSolutions** ("מערכות חכמות לבתי ספר"), founded by Ofek and partner Maor Mesika (a platform admin on staging).
- Marketing site: https://edusolutions-site.vercel.app/ — source in `C:\Users\ofekp\Projects\Personal\EduSolutions` (separate repo). Its "כניסה למערכת" button goes to `NEXT_PUBLIC_GANTT_URL` (set in that repo).
- The site promises: Gantt, printable calendar, mobile view and calendar sync; Hebrew-first; contact form; "המוצר הבא / בקרוב" placeholder card.
- Go-forward checklist (site + app, one list): Claude Doc "EduSolutions — What's next", https://claude.ai/artifact/XeeDn355VSgnX3Z4PgGe5H (read/tick via the Claude Docs connector).

## Tech Stack

- Next.js 15 (App Router) + React 19 + TypeScript 5 (strict)
- Tailwind CSS + shadcn/ui + Hebrew RTL layout
- Supabase (Postgres + Auth + Row-Level Security)
- Drizzle ORM + `pg` (service-role client only inside `lib/db/`)
- `next-intl` (Hebrew + English, `he` default)
- Hand-written RFC 5545 iCal serializer (`lib/ical/serializer.ts`)
- Groq via `ai` SDK (staff AI chat + smart adder; hidden when `GROQ_API_KEY` is unset)
- Zod (all API boundary validation)
- Vitest (unit + integration) + Playwright (e2e)

## Commands

```bash
pnpm dev              # Dev server (localhost:3000); predev checks the DB is reachable
pnpm build            # prebuild applies migrations (scripts/migrate.ts), then next build
pnpm lint             # ESLint
pnpm tsc              # Type check (tsc --noEmit)
pnpm test             # Vitest unit + integration (DB suites skip when DB unreachable)
pnpm test:unit        # Unit only, no DB
pnpm test:coverage    # Vitest with coverage report
pnpm playwright       # Playwright e2e; set PLAYWRIGHT_BASE_URL to target a deployment
pnpm provision:school # Create a school + first admin (see OPERATIONS.md §12)
npx knip              # Find unreferenced files/exports
```

## Architecture

```
app/
  (viewer)/[school]/         — Full public viewer: Gantt (index), /calendar, /agenda. `[school]` is the school's secret access token, NOT the slug
  (public)/schedule/         — Read-only guest view: /schedule?school=<token>; no token = "link required" screen
  (public)/page.tsx          — `/` redirects to login
  (staff)/                   — /dashboard (monthly/weekly calendar), /events/new (event form)
  (admin)/admin/             — /staff (staff, invites, pending sign-ups, school links, grade colors), /event-types
  (platform)/platform/schools — Platform admins: provision schools, list every school's links
  api/v1/                    — REST route handlers (public/, events/, admin/, ai/, auth/, ical-subscriptions/, export/ics, platform/)
  ical/[token]/route.ts      — text/calendar feed (unauthenticated, token-gated)
  auth/                      — /login, /register, /confirm, /callback, /pending, /deactivated, /change-password
  invite/[token]/            — Invite redemption page
lib/
  db/                        — Drizzle schema, RLS client wrapper, invites, staff, schools, provision, platform-admins, ban-deactivated
  auth/                      — session.ts, admin.ts, platform-admin.ts, public-request.ts (middleware allowlist), scopes.ts
  events/                    — Domain logic: approval (state machine), crud, queries, revisions
  ai/                        — chat/ (staff chat tools), adder/ (smart adder: parse + conflict check), model.ts, quota.ts
  ical/                      — VEVENT serializer + subscriptions
  views/                     — Event → Gantt / calendar / agenda projections
  datetime.ts                — Timezone helpers (Asia/Jerusalem)
  validations/               — Zod schemas
components/                  — Shared UI; Gantt/, dashboard/, admin/, ai/, wizard/, FilterBar, etc.
db/
  migrations/                — One .sql file per schema change (0000–0018 so far)
  seed.ts                    — Demo school (fixed token in db/demo-school.ts) + admin + 6 grade editors + counselor + 11 event types
messages/                    — he.json (primary), en.json
test/
  unit/ integration/ e2e/    — Vitest unit, real-Postgres integration (RLS), Playwright
scripts/                     — Dev/ops scripts (migrate, check-db, provision-school, refresh-staging-db.sh)
```

## Multi-Tenancy (Critical)

Every query that touches school data **must** run inside `db.withSchool(schoolId, fn)`.
This helper opens a transaction, `SET LOCAL ROLE authenticated` and sets `app.school_id` so Postgres RLS policies activate.

```ts
// CORRECT
const events = await db.withSchool(schoolId, () => db.query.events.findMany(...));

// WRONG — bypasses RLS, leaks cross-school data
const events = await supabaseAdmin.from('events').select('*');
```

`supabaseAdmin` (service-role client) lives in `lib/db/` only. An ESLint rule bans importing it outside `lib/db/`.

The `schools` table is **not readable inside `withSchool`** (migration 0010 revokes it from `authenticated`). Read school rows (name, active year, token lookup) through helpers in `lib/db/schools.ts`, outside the transaction. CI revokes the same tables as prod, so a violation fails integration tests.

## School links (guest access)

- Each school has a random 64-hex `schools.access_token` (migration 0017). It is the only key to the public surface: `/<token>`, `/schedule?school=<token>`, `/api/v1/public/<token>/events`, the guest `.ics` export, and staff sign-up `/auth/login?school=<token>`.
- Slugs open nothing (`/kfar-galim` → not-found page; status is 200 because the viewer streams a loading state first, so e2e specs assert on visible content, not status).
- Admins copy links from "School links" on `/admin/staff`; platform admins see all schools' links on `/platform/schools`.
- Never read a real school's token into a transcript or URL you create. Test with the demo school (its token is public in `db/demo-school.ts`) on staging.

## Event State Machine

All status transitions go through `lib/events/approval.ts`. Never set `events.status` directly.

```text
draft → approved  (editor publishes — "פרסם אירוע")
approved → approved (editor edits in-place via PATCH or re-publish)
approved → canceled (DELETE of a published event — stays visible as canceled; lib/events/crud.ts)
```

The `pending` and `rejected` enum values exist in the DB schema but are **never produced**.
Publish/edit transitions write a row to `event_revisions`:

- `decision='published'` — new draft → approved
- `decision='edited'` — PATCH or re-publish of approved event

Deleting a draft hides it (`deleted_at`, soft delete); deleting a published event sets `status='canceled'` (migration 0006). Every mutation bumps `events.version`.

## Auth

Email + password via Supabase Auth, plus Google OAuth. No custom session cookies.

Google OAuth requires the Google provider enabled in the Supabase dashboard (Client ID/Secret) with `/auth/callback` registered as a redirect URL. Sign-ups through a school link land in that school's `pending_registrations` and need admin activation; they do not auto-create an active `staff_users` row.

**Roles:** `editor` | `admin` | `viewer` (stored in `staff_users.role`). **Platform admins** are rows in `platform_admins` (auth user ids), separate from school roles; they reach `/platform/schools`.

Invite flow:

1. Admin creates invite via `lib/db/invites.ts` (token, role, grade/event-type scopes; multi-use, no expiry, admin revokes via `revoked_at`)
2. Invitee opens `/invite/[token]` → registers at `/auth/register` → confirms via `/auth/confirm`
3. On confirm: `staff_users` row created, scopes applied

Admins can also create staff directly from `/admin/staff`.

Key files:

- `lib/auth/session.ts` — `getSession()` (validates JWT via `getUser()`, never `getSession()`) and `getStaffUser()`
- Editor scope is enforced inline in the event routes (`app/api/v1/events/**`, returning `scope_violation`); there is no shared scope helper.
- `lib/db/invites.ts` — invite CRUD; `getInviteByToken` uses service-role (school unknown pre-validation)

Rules:

- Admins bypass all scope checks
- Viewers can read but cannot edit (403)
- Deactivating staff bans their Supabase auth user (`lib/db/ban-deactivated.ts`); handlers must also check `status='active'`. Never bind accounts by email alone.
- Lockout: 10 failed attempts / 15 min window (tracked in `staff_users.locked_until`)
- Public routes (viewer pages, `/schedule`, iCal): unauthenticated, token-gated

## Views and polling

- Default view is **monthly** everywhere: dashboard (weekly via `?view=weekly` or a `?week=` link), `/schedule` (weekly when the link has `?week=`), and the public Gantt (`?zoom=` overrides).
- Public views poll `/api/v1/public/<token>/events/signature` every 5 s. Each poll re-renders the page, so effects must not depend on object identity (e.g. compare `date.getTime()`, not `Date` objects) — this caused the weekly view to snap back to the current week.

## iCal

- `DTSTAMP`/`LAST-MODIFIED` come from the event's `updated_at`; `SEQUENCE` = `version + FEED_FORMAT_REVISION` (`lib/ical/serializer.ts`). Without these, Google Calendar keeps stale copies.
- Any change to the feed output must bump `FEED_FORMAT_REVISION`; `test/unit/ical/serializer-change-signals.test.ts` fingerprints the output and fails otherwise.

## RTL / i18n

- `<html dir="rtl" lang="he">` set in root layout
- CSS: use logical properties (`start`/`end`) — never hardcode `left`/`right` in layout/position styles
- All user-visible strings through `next-intl` `t()` — no string literals in JSX
- Dates formatted via `lib/datetime.ts` using `Asia/Jerusalem` timezone — never raw `new Date()` in display code

## Key Files

| File | Purpose |
| ---- | ------- |
| `lib/db/schema.ts` | Drizzle schema — **do not modify without a new migration** |
| `lib/db/client.ts` | RLS wrapper + pg pool (`max: 10` per instance) — only import inside `lib/db/` |
| `lib/db/schools.ts` | School + token lookups that must run outside `withSchool` |
| `lib/events/approval.ts` | State machine — all status transitions here |
| `app/api/v1/events/**` | Where editor scope is actually enforced — regression = privilege escalation |
| `lib/db/invites.ts` | Invite lifecycle — create, validate, mark used |
| `lib/db/provision.ts` | School provisioning (CLI + `/platform/schools`) |
| `lib/ical/serializer.ts` | iCal output + `FEED_FORMAT_REVISION` |
| `db/migrations/` | Never edit existing files; add a new file per change |
| `db/seed.ts` | Demo school bootstrap (refuses non-local/non-staging DBs) |
| `messages/he.json` | Primary locale strings |

## Data Model (short form)

```text
schools           id, slug, name, locale, timezone, active_academic_year_id, access_token
academic_years    id, school_id, label, start_date, end_date
staff_users       id, school_id, auth_id, email, full_name, role ∈ {editor,admin,viewer}, status ∈ {pending,active,deactivated}, locked_until, must_change_password
staff_invites     id, school_id, token, role, grade_scopes[], event_type_scopes[], revoked_at, used_at, used_by, created_by
pending_registrations  id, school_id, auth user, email, ...  (sign-ups awaiting admin activation)
platform_admins   auth_user_id
editor_scopes     id, staff_user_id, scope_kind ∈ {grade,event_type}, scope_value
event_types       id, school_id, key, label_he, label_en, color_hex, glyph, sort_order
school_grade_colors  school_id, grade, color_hex (migration 0014)
staff_event_dismissals  per-staff dismissed events (migration 0008)
events            id, school_id, status ∈ {draft,approved,canceled} (+ unused pending,rejected), version, deleted_at, updated_at, ...
event_grades      event_id, grade  (composite PK)
event_revisions   id, event_id, snapshot JSONB, submitted_by, decided_by, decision ∈ {published,edited}, reason
ical_subscriptions id, staff_user_id, token, filter_grades, filter_event_types, revoked_at
audit_log         id, school_id, actor_staff_id, action, target_table, target_id, payload, at
```

## Environment Variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL                    # runtime: Supabase transaction pooler (port 6543) — session pooler exhausts at 15 clients
TEST_DATABASE_URL
NEXT_PUBLIC_APP_URL             # unset on Preview: links use the request origin
GROQ_API_KEY                    # staff AI features; unset = AI hidden (unset on Production today)
AI_MODEL                        # optional Groq model override
TEST_LOGIN_ENABLED              # e2e-only test login route; never on Production
PLAYWRIGHT_BASE_URL             # run e2e against a deployment
VERCEL_AUTOMATION_BYPASS_SECRET # e2e against protected previews; revoke after use
```

Never commit these. Never ask for or paste secret values in chat — have the user set them (e.g. `gh secret set NAME`, Vercel dashboard, `.env.staging.local`).

## Environments

| Env | Branch | URL | Supabase |
|-----|--------|-----|----------|
| Production | `main` | `school-gantt.vercel.app` (public) | `mfrtdirkknuvweaiqfzs` |
| Staging | `staging` | `schoolsync-git-staging-edu-solutions.vercel.app` (Vercel login) | `wmapfuwpdyishfqtzwha` |
| Previews | any other | `schoolsync-git-<branch>-edu-solutions.vercel.app` | staging |

- Vercel project: `schoolsync` in team `edu-solutions` (prod domain `school-gantt.vercel.app` is attached to it). Old `school-gantt-git-*-ofekpols-projects` URLs are a stale project — don't test there.
- Vercel is on Hobby, Supabase on Free (see `docs/COST_PLAN.md` on `feature/cost-plan` / PR #55 for upgrade thresholds).
- Vercel has skipped a push to `main` before: after merging, confirm a production deployment exists for the commit; redeploy by hand if not.
- Production has one real school (Kfar Galim). Do browser checks on staging with the demo school.
- Details, refresh workflow and runbooks: `OPERATIONS.md`.

## Code Style

- Strict TypeScript — no `any`
- Zod schema at every API boundary (request in + response out)
- `snake_case` DB columns → `camelCase` frontend types; transform at the API route layer
- `"use client"` only when hooks or browser APIs are used — Server Components by default
- `cn()` from `lib/utils.ts` for className merging
- Icons from `lucide-react` only
- Parameterized queries only — no SQL string interpolation
- Functions < 50 lines, files < 400 lines

## Conventions

- API routes validate with Zod on both request and response shapes
- `withSchool(schoolId, fn)` wraps every school-scoped DB query — no exceptions
- Server Components fetch data directly; Client Components receive data as props or call `/api/v1/` routes
- New migrations go in `db/migrations/` as plain `.sql` files — never edit existing ones
- i18n keys in `messages/he.json` first, `en.json` mirror — no hardcoded strings in JSX
- Tests that touch the DB use real Postgres (no mocks); skip gracefully when DB unreachable
- Integration tests: cover RLS positive access + cross-school denial for every new table
- One-time dev/ops scripts go in `scripts/` (tracked in git)

## Git Workflow

- Never commit directly to `main`
- Branch naming: `feature/<desc>`, `fix/<desc>`, `phase/<n>-<desc>`
- For every new feature: create a new branch (`git checkout -b feature/<desc>`) from `staging`, work on it, then merge into `staging` and verify on the staging deployment; promote with `staging` → `main` (see OPERATIONS.md §7 "Environments")
- Hotfixes merged straight into `main` must be merged back into `staging`
- Merge PRs with a merge commit, only after **all** checks on that PR are green (including the PR's own "Lint, Typecheck, Test, E2E" run). Auto-merge is disabled on the repo.
- Verify `pnpm build` passes before merging
- Keep commits atomic per logical change

## How Codex Should Work

- **Small task (bug fix, single file, typo):** Just do it.
- **Medium task (new component, new API route):** Make a reasonable call; flag assumptions in response.
- **Large task (new feature, new flow, auth change):** Ask 1-2 scoping questions first.
- **Testing:** Write tests for non-trivial domain logic and API routes; skip tests for simple UI wiring.
- **Production writes** (SQL on prod, bans, platform-admin inserts): give the user the SQL for the prod Supabase SQL editor rather than running it.
- **End of task:** One line — what changed, what's next. No summary of the diff.

## Testing Targets

- Unit + integration: Vitest, ≥ 80% coverage on new code
- Integration: real Postgres — RLS positive access + cross-school denial + school-link isolation
- E2E: event form + publish flow, all public views, school links, iCal subscribe + revoke (via API; `/profile` was removed)
- Perf: Gantt ≤ 2 s with 1 k events; iCal ≤ 500 ms (staging measured ~420–540 ms from Israel, mostly network)

## Non-Functional Bars (hard)

- Gantt: ≤ 2 s first paint with 1 k events
- iCal feed: ≤ 500 ms response
- Public view freshness: ≤ 5 s after editor publishes (polling + 5 s `Cache-Control`)
- WCAG 2.1 AA — axe-core zero serious/critical issues
- Color + glyph encoding (color-blind safe)
- Print-legible on A3/A4 monochrome (`@media print`)

## Project

School Gantt Chart System

Multi-tenant school event calendar where each school is an isolated tenant (Postgres RLS). Staff editors create events and publish directly (no admin approval) → events appear on synchronized public views (Gantt chart, printable yearly calendar, mobile agenda, per-user iCal feed). Unauthenticated viewers (students, parents, teachers) browse through their school's secret link without accounts.

Core Value: An editor can publish an event and it appears publicly across all views within 5 seconds.

### Constraints

- **Tech Stack:** Next.js 15 App Router + React 19 + TypeScript 5 strict; Tailwind + shadcn/ui; Supabase (Postgres + Auth + RLS); Drizzle ORM + `pg`; `next-intl`; Zod; Vitest + Playwright
- **RTL:** CSS logical properties only (`start`/`end`) — never hardcode `left`/`right` in layout/position styles
- **DB safety:** Every query touching school data must use `db.withSchool(schoolId, fn)`. ESLint rule bans raw service client outside `lib/db/`
- **Security:** Parameterized SQL only; no SQL string interpolation; `supabaseAdmin` only inside `lib/db/`
- **Auth lockout:** 10 failed attempts / 15 min window
- **Performance:** Gantt ≤ 2 s first paint (1k events); iCal ≤ 500 ms; public view freshness ≤ 5 s after publish
- **Coverage:** ≥ 80% on new code; integration tests use real Postgres (no mocks)
- **Code style:** Functions < 50 lines; files < 400 lines; no `any`; `snake_case` DB → `camelCase` frontend transformed at API layer
