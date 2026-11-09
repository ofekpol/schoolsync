-- Public demo sandbox (docs/superpowers/specs/2026-11-09-demo-sandbox-design.md).
-- A school is a demo iff demo_expires_at IS NOT NULL. Demos are throwaway
-- tenants created from /demo and deleted after expiry.
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "demo_expires_at" timestamptz;
CREATE INDEX IF NOT EXISTS "schools_demo_expires_at_idx"
  ON "schools" ("demo_expires_at") WHERE "demo_expires_at" IS NOT NULL;

-- Creation ledger for the abuse limits. Not tenant data: no school_id, no
-- policies; only the server's pg pool (bypassrls) touches it. Rows are kept
-- for 24 h even when their demo is deleted, so "start over" still counts.
CREATE TABLE IF NOT EXISTS "demo_creations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ip_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "demo_creations_created_at_idx" ON "demo_creations" ("created_at");
CREATE INDEX IF NOT EXISTS "demo_creations_ip_created_idx" ON "demo_creations" ("ip_hash", "created_at");
ALTER TABLE "demo_creations" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "demo_creations" FROM "anon"';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "demo_creations" FROM "authenticated"';
  END IF;
END $$;

-- Per-demo growth caps and text limits, enforced for every writer inside its
-- own transaction. Real schools return immediately after one PK lookup.
-- SECURITY DEFINER: `authenticated` cannot read `schools` (migration 0010).
-- Errors use SQLSTATE P0001 with message 'demo_quota' or 'demo_text_too_long';
-- lib/demo/limits.ts maps them to HTTP responses.
CREATE OR REPLACE FUNCTION "demo_enforce_limits"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  is_demo boolean;
  row_cap integer;
  row_count integer;
BEGIN
  SELECT demo_expires_at IS NOT NULL INTO is_demo FROM schools WHERE id = NEW.school_id;
  IF NOT coalesce(is_demo, false) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'events' THEN
    IF length(NEW.title) > 200 OR length(coalesce(NEW.location, '')) > 200
       OR length(coalesce(NEW.description, '')) > 1000 THEN
      RAISE EXCEPTION 'demo_text_too_long';
    END IF;
  ELSIF TG_TABLE_NAME = 'event_types' THEN
    IF length(NEW.label_he) > 60 OR length(NEW.label_en) > 60 THEN
      RAISE EXCEPTION 'demo_text_too_long';
    END IF;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  row_cap := CASE TG_TABLE_NAME
    WHEN 'events' THEN 500
    WHEN 'event_revisions' THEN 1000
    WHEN 'event_types' THEN 50
    WHEN 'ical_subscriptions' THEN 10
  END;
  -- Serialize inserts per demo school so concurrent writers cannot overshoot.
  PERFORM pg_advisory_xact_lock(hashtext('demo_quota:' || NEW.school_id::text));
  EXECUTE format('SELECT count(*) FROM %I WHERE school_id = $1', TG_TABLE_NAME)
    INTO row_count USING NEW.school_id;
  IF row_count >= row_cap THEN
    RAISE EXCEPTION 'demo_quota';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "events_demo_limits" ON "events";
CREATE TRIGGER "events_demo_limits" BEFORE INSERT OR UPDATE ON "events"
  FOR EACH ROW EXECUTE FUNCTION "demo_enforce_limits"();
DROP TRIGGER IF EXISTS "event_revisions_demo_limits" ON "event_revisions";
CREATE TRIGGER "event_revisions_demo_limits" BEFORE INSERT ON "event_revisions"
  FOR EACH ROW EXECUTE FUNCTION "demo_enforce_limits"();
DROP TRIGGER IF EXISTS "event_types_demo_limits" ON "event_types";
CREATE TRIGGER "event_types_demo_limits" BEFORE INSERT OR UPDATE ON "event_types"
  FOR EACH ROW EXECUTE FUNCTION "demo_enforce_limits"();
DROP TRIGGER IF EXISTS "ical_subscriptions_demo_limits" ON "ical_subscriptions";
CREATE TRIGGER "ical_subscriptions_demo_limits" BEFORE INSERT ON "ical_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION "demo_enforce_limits"();
