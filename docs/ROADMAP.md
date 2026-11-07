# Roadmap and open items

Go-forward checklist for EduSolutions and the School Gantt app. Started 2026-11-06 from the landing-site review; carries the open items left by recent sessions. Tick items here as they land.

## 1. School entry page (top priority)

Today the company site's "כניסה למערכת" button goes to `NEXT_PUBLIC_GANTT_URL`, the app's `/` redirects to login, and `/schedule` without `?school=<token>` only shows "link required". A parent arriving from the site can't reach their school.

- [ ] Decide discovery: public school directory (opt-in per school), search box, or a friendly per-school page (e.g. `/s/<slug>`) that still relies on the secret token.
- [ ] Build the entry page in the app; point the site's button (or a second "parents and students" button) at it.
- [x] Replace the bare "link required" screen with a short explanation of the app (#58).

## 2. Landing site go-live (EduSolutions repo)

- [ ] Buy the domain, connect it in Vercel; serve the app on a subdomain (e.g. `app.<domain>`).
- [ ] Verify the domain in Resend; set `RESEND_API_KEY`, `CONTACT_FROM`, `CONTACT_TO` (until then the contact form only logs).
- [ ] Set `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_INDEXABLE=true` (search engines are blocked until then).
- [ ] Fill `content/legal.ts` (company name, ח.פ., accessibility coordinator, contact email, last-checked date).
- [ ] Add a real Gantt screenshot using demo data only.
- [ ] Decide the team section (`content/team.ts` referenced in its README but missing).
- [ ] Fill `content/proof.ts` once pilot schools exist.
- [ ] Both founders review the Hebrew copy; send a test message through the form.

## 3. App as a sold product

- [x] Accessibility statement and privacy policy inside the app (#59). Still to do: fill the `[להשלמה]` placeholders in `lib/legal.ts`.
- [ ] Privacy / data-processing agreement for schools (Privacy Protection Law, Ministry of Education vendor requirements) — confirm with someone qualified.
- [ ] Demo school with realistic data for sales meetings. Code is done (#61, `seed-demo-events.yml`); still to do: provision `edusolutions-demo` on prod and run the workflow (OPERATIONS.md).
- [x] Onboarding: provisioning (`/platform/schools`), first admin invite, CSV calendar import from the dashboard's "ייבוא לוח" dialog (#62, #69). Not yet tested by hand: creating a school on `/platform/schools` (staging has no `platform_admins` row).
- [x] Support channel and an "I found a bug" path for staff (#63). Still to do: set `GITHUB_SUPPORT_REPO` / `GITHUB_SUPPORT_TOKEN` in Vercel (token scoped to `schoolsync-support` only).

## 4. Production operations

- [ ] Upgrade before the first paying school: Vercel Pro (Hobby forbids commercial use), Supabase Pro (backups, no auto-pause). Cost tiers: `docs/COST_PLAN.md` (PR #55, open).
- [ ] Merge PR #55's CDN caching for public poll endpoints (`s-maxage=5`).
- [ ] Production `DATABASE_URL` on the transaction pooler (staging already switched; session pooler hit `EMAXCONNSESSION`).
- [ ] Turn on Supabase leaked-password protection.
- [ ] Confirm the 2 deactivated prod staff are banned and platform admins exist on prod (SQL in OPERATIONS.md §12).
- [ ] Revoke the Vercel automation bypass secret if still active (it was exposed in a transcript).
- [ ] Check Vercel Git settings — a push to `main` once created no deployment.
- [x] Backups/restore drill, error monitoring, uptime alerts (#65; OPERATIONS.md §8). Still to do: backup secrets on `schoolsync-support`; error alerts need the support env vars above.
- [ ] Before enabling AI on prod: fix the AI quota race, then add `GROQ_API_KEY`.
- [ ] Manual production checks never done: Google sign-in, real admin sign-in, `/platform/schools`, print and mobile layouts, personal iCal feeds.

## 5. Code health

- [x] Builds no longer fetch Google Fonts; fonts are self-hosted in `app/fonts/` via `next/font/local` (#66).

- [ ] `lib/auth/scopes.ts` and `softDelete` are only used by tests; either wire routes through `assertEditorScope` or delete them and test the routes' inline `scope_violation` checks.
- [ ] Stale local branch `fix/calendar-outside-day-contrast` (`b89985e`, early version of the monthly-default change) — don't merge; delete.
- [ ] Flaky `test/unit/staff-loading.test.tsx` (times out under full-suite load).

## 6. Business

- [ ] Pricing model and pilot terms (e.g. free for a semester).
- [ ] First 2–3 pilot schools.
- [ ] Decide the next product for the site's "המוצר הבא / בקרוב" card, or remove the card.
