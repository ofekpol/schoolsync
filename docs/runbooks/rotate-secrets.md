# Runbook: Rotate Secrets

How to rotate sensitive credentials without downtime.

Applies to: `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (Supabase DB password).

---

## When to rotate

- Scheduled: every 90 days
- Unscheduled (immediate): suspected leak, ex-team-member offboarding, accidental commit to git, accidental paste to chat/log

## Pre-flight

- [ ] Confirm Vercel CLI is installed and logged in: `npx vercel whoami`
- [ ] Confirm project is linked: `cat .vercel/project.json`
- [ ] Open a second terminal to tail logs: `npx vercel logs --follow`

---

## Rotate `SUPABASE_SERVICE_ROLE_KEY`

1. **Generate new key**
   - Supabase Dashboard → Project Settings → API → Service Role → "Generate new"
   - Copy new key (you will not see it again)
   - **Do NOT revoke the old key yet.** Both keys are valid until you revoke.

2. **Push new key to Vercel (Production)**
   ```bash
   printf '%s' "<new-key>" | npx vercel env add SUPABASE_SERVICE_ROLE_KEY production --sensitive --force
   ```
   `--force` overwrites the existing variable.

3. **Redeploy production** (env changes do not auto-redeploy)
   ```bash
   npx vercel --prod --yes
   ```

4. **Verify new key works**
   - Hit any admin endpoint that needs service role (e.g. `/api/v1/admin/staff`)
   - Tail logs for `JWT expired` or `Invalid API key` errors
   - If errors: roll back env var to old key, redeploy, investigate before retrying

5. **Revoke old key in Supabase Dashboard**
   - Same place as step 1, click "Revoke" on the old key
   - At this point the old key is dead — there is no rollback

6. **Update local `.env.local`** for every developer who has a copy

---

## Rotate `DATABASE_URL` password

Higher risk — wrong order causes app downtime.

1. **Reset Supabase database password**
   - Supabase Dashboard → Project Settings → Database → Reset Password
   - Copy new connection string (Connection Pooling → Transaction)

2. **Push new URL to Vercel**
   ```bash
   printf '%s' "<new-connection-string>" | npx vercel env add DATABASE_URL production --sensitive --force
   ```

3. **Redeploy**
   ```bash
   npx vercel --prod --yes
   ```

4. **Verify** — hit `/dashboard` → if it loads, DB connection works. Old password is invalid the moment you reset it; there is no "both valid" overlap window like with API keys.

5. **Update `.env.local` for all developers** — same password is used for local + prod.

---

## Post-rotation

- [ ] Document the rotation in `docs/audit-log.md` (date, what, who, why)
- [ ] If rotation was due to leak: revoke any sessions in Supabase Auth → Users → "Sign out all sessions"
- [ ] If the leaked key was in git: rewrite history with `git filter-repo` or rotate again and warn that the old key existed in commit `<sha>`. **Force-push to main only with team coordination.**

## What this runbook does NOT cover

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — rotating this requires updating every cached frontend asset; treat as a major incident
- Supabase JWT secret — full session-invalidation event; coordinate with team
