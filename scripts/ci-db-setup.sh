#!/usr/bin/env bash
# Prepares the CI Postgres service like Supabase: `authenticated` role, migrations, prod grants.
set -euo pipefail

# Supabase ships the `authenticated` role; vanilla Postgres does not. withSchool() needs it.
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
SQL

# Grants again: migrations created the tables after the role was provisioned.
for f in db/migrations/*.sql; do
  echo "▶ $f"
  psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
-- Match prod: 0010, 0018 and 0019 revoke these, so withSchool code can't read them.
REVOKE ALL ON TABLE schools, pending_registrations, platform_admins, demo_creations FROM authenticated;
SQL
