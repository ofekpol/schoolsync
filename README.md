# School Gantt Chart System

Multi-tenant school event calendar. Multi-tenant school event calendar, the first product of EduSolutions ([site](https://edusolutions-site.vercel.app/)). Staff editors create and publish events directly (no approval queue) → events appear on the public views (Gantt, agenda, printable calendar, iCal). Guests open a school through its secret link. Each school is isolated via Postgres RLS. Hebrew RTL by default, English toggle available.

## Quickstart

```bash
cp .env.example .env.local       # fill in Supabase + DB urls
pnpm install
pnpm db:migrate                  # apply schema
pnpm seed                        # demo school + admin + 6 grade editors
pnpm dev                         # http://localhost:3000
```

Then sign in at `/auth/login` with `admin@demo-school.test / ChangeMe123!` (created by the seed).

## Daily commands

```bash
pnpm dev                 # local server
pnpm tsc                 # TypeScript strict (no emit)
pnpm lint                # ESLint
pnpm test                # Vitest unit + integration
pnpm test:unit           # unit tests only (no DB needed)
pnpm test:integration    # integration tests (TEST_DATABASE_URL required)
pnpm playwright          # Playwright e2e (chromium); PLAYWRIGHT_BASE_URL targets a deployment
pnpm provision:school    # create a school + first admin
pnpm build               # production build
pnpm seed:perf           # populate 1 000 events for perf benchmarks
```

## Stack

Next.js 15 (App Router) · React 19 · TypeScript 5 strict · Tailwind CSS · shadcn/ui · Supabase (Postgres + Auth + RLS) · Drizzle ORM · `next-intl` · Hand-written RFC 5545 iCal serializer · Zod · Vitest · Playwright · `@axe-core/playwright`.

## Architecture

```
app/
  (viewer)/[school]/       — full public viewer (Gantt, /calendar, /agenda); [school] = secret school token
  (public)/schedule/       — read-only guest view (?school=<token>)
  (staff)/                 — /dashboard (monthly/weekly calendar), /events/new (event form)
  (admin)/admin/           — /staff (staff, invites, sign-ups, school links), /event-types
  (platform)/platform/     — /schools: provision schools (platform admins)
  api/v1/                  — REST route handlers (events, public, admin, ai, ical-subscriptions, export)
  ical/[token]/route.ts    — token-gated iCal feed
lib/
  db/                      — Drizzle schema, withSchool RLS wrapper, schools/staff/invites/provision
  auth/                    — session, admin + platform-admin guards, editor scopes
  events/                  — publish state machine, CRUD, queries, revisions
  ai/                      — staff chat + smart adder (Groq)
  ical/                    — VEVENT serializer + subscriptions
  views/                   — agenda, gantt, calendar pure projections
  validations/             — Zod schemas
db/
  migrations/              — one .sql file per schema change
  seed.ts                  — demo school (1 admin + 6 grade editors + counselor + 11 event types)
  seed-perf.ts             — 1 000-event perf seed
messages/{he,en}.json      — UI strings (he primary)
test/{unit,integration,e2e}/
```

See [CLAUDE.md](./CLAUDE.md) for canonical conventions.

## Progress

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundation — scaffold, RTL toolchain, CI | ✅ |
| 1 | Database, RLS, Auth — schema, withSchool, lockout | ✅ |
| 2 | Event CRUD + 7-step wizard with draft autosave | ✅ |
| 3 | Approval workflow + revisions (later replaced by direct publish) | ✅ |
| 4 | Public surface: FilterBar + mobile agenda | ✅ |
| 5 | Gantt view (Sept–Jul timeline, zoom presets) | ✅ |
| 6 | Printable yearly calendar + monochrome fallback | ✅ |
| 7 | iCal feed + per-staff subscriptions | ✅ |
| 8 | Polish — a11y, i18n, perf, e2e, docs | ✅ |

## Quality bars

- **Performance** — Gantt ≤ 2 s first paint with 1 k events · iCal ≤ 500 ms · public view freshness ≤ 5 s after publish
- **Accessibility** — WCAG 2.1 AA · axe-core "no serious/critical" across all four public views · 44 px tap targets · keyboard-only wizard · color + glyph encoding (color-blind safe)
- **i18n** — Hebrew default, English toggle persists in `NEXT_LOCALE` cookie · all UI strings flow through `next-intl`
- **Print** — `@media print` produces an 11-page A4 PDF · monochrome fallback (glyph + dashed border) keeps chips legible
- **Multi-tenancy** — Every query touching school data runs inside `db.withSchool(schoolId, fn)` · ESLint bans `supabaseAdmin` outside `lib/db/`
- **Coverage** — ≥ 80 % on new code · integration tests use real Postgres · e2e covers every PRD §14 acceptance criterion

## Key constraints

- Publish/edit transitions go through [lib/events/approval.ts](lib/events/approval.ts) — never set `events.status` directly
- CSS logical properties only (`start`/`end`) — never hardcode `left`/`right`
- Parameterized SQL only — no string interpolation
- Functions < 50 lines · files < 400 lines · no `any`

## Operations

See [OPERATIONS.md](./OPERATIONS.md) for Supabase setup, migrations, seeding, deployment, and runbooks.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR (not on docs-only changes, and not again after the merge), as three parallel jobs:

1. "Lint, Typecheck": `pnpm lint`, `pnpm tsc`
2. "Unit + integration tests": `pnpm test`
3. "Build, E2E": `pnpm build`, `pnpm playwright` (chromium, with axe a11y gates)

Flow: feature branch → PR into `staging` → verify on staging → PR `staging` → `main`. Never push directly to `main`; merge only when every check is green. Open work: [docs/ROADMAP.md](docs/ROADMAP.md).
