# Runbook: Database Migrations

How to ship a schema change to production without losing data.

---

## Policy

- **Never auto-apply migrations from CI.** Every prod migration runs manually after PR review.
- **Never edit a migration file once merged to main.** Add a new migration to fix.
- **Every migration ships with rollback notes** in the PR description.
- **One migration per logical change.** Don't bundle unrelated DDL.

---

## Authoring a migration

1. Write a new plain `.sql` file in `db/migrations/`, named with the next number (`NNNN_short_description.sql`). `scripts/migrate.ts` applies every `.sql` file there in name order and records it in `app_migrations`; there is no generator.
2. Update the Drizzle schema in `lib/db/schema.ts` by hand so it matches the SQL.
3. Review the SQL — is it safe on a table with data (e.g. `DROP COLUMN` with no backfill)? Common precautions:
   - Add `IF NOT EXISTS` / `IF EXISTS` for idempotency
   - Split a destructive change into expand → migrate → contract phases
   - Add explicit `USING` clause for type-narrowing alters
4. Test locally:
   ```bash
   pnpm db:migrate
   pnpm test
   ```
5. Update RLS policies if the migration touches a school-scoped table — verify `withSchool` isolation still holds in `test/integration/rls.test.ts`

---

## Before merging the PR

Reviewer checklist:

- [ ] Migration filename is monotonic (greater than every existing file in `db/migrations/`)
- [ ] No edits to previously-merged migration files
- [ ] Destructive operations (`DROP COLUMN`, `DROP TABLE`, type narrowing) include rollback steps in PR description
- [ ] If table is school-scoped, RLS policy is updated and a test asserts cross-school denial
- [ ] PR description includes: estimated row count affected, locking behavior, expected duration

---

## Applying to production

1. **Backup first**
   - Supabase Dashboard → Database → Backups → "Create backup"
   - Note the backup ID
   - For long migrations: consider PITR window timing

2. **Dry-run on staging** (if a staging Supabase project exists)
   - Apply migration
   - Run smoke test
   - Compare row counts before/after

3. **Apply to prod**
   - Open Supabase Dashboard → SQL Editor
   - Paste migration SQL
   - Run during a low-traffic window (school-hours-quiet times)
   - **Do not run `pnpm db:migrate` against prod from a dev machine** — use Dashboard so the SQL is logged centrally

4. **Verify**
   - Check `schema_migrations` table reflects the new migration
   - Hit affected endpoints in prod
   - Check `npx vercel logs --follow` for errors over the next 5 minutes

5. **Document** in `docs/audit-log.md`

---

## Rollback

If the migration breaks prod:

1. **Stop new writes** (if possible) — disable affected routes via feature flag
2. **Restore from backup** taken in step 1 above
   - Supabase Dashboard → Database → Backups → "Restore"
   - This is a full DB restore — coordinate with team, expect 1-10 min downtime
3. **Revert the migration commit in code** so the next deploy doesn't try to reapply
4. **Post-mortem** in `docs/audit-log.md`

---

## Destructive changes — expand-migrate-contract pattern

For `DROP COLUMN` or breaking type changes:

1. **Expand** (PR #1) — add the new column/table alongside the old. App writes to both.
2. **Migrate** (PR #2 + data backfill script) — copy data from old → new. App reads from new, writes to both.
3. **Contract** (PR #3, after observation period of at least 7 days) — drop the old column. App reads + writes only the new.

Never collapse these into one migration. Recovery from a broken expand-contract is hard; recovery from a broken atomic destructive migration is a backup restore.
