-- Demo schools: bound event dates. One event spanning centuries makes the
-- calendar views build tens of thousands of months (CPU/memory exhaustion from
-- public traffic). Same function as 0019 plus a date window; real schools unchanged.
-- Window: starts no earlier than 2 years ago, ends no later than 3 years ahead,
-- and lasts at most 366 days.
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
    IF NEW.start_at < now() - interval '2 years' OR NEW.end_at > now() + interval '3 years'
       OR NEW.end_at - NEW.start_at > interval '366 days' THEN
      RAISE EXCEPTION 'demo_date_range';
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
  PERFORM pg_advisory_xact_lock(hashtext('demo_quota:' || NEW.school_id::text));
  EXECUTE format('SELECT count(*) FROM %I WHERE school_id = $1', TG_TABLE_NAME)
    INTO row_count USING NEW.school_id;
  IF row_count >= row_cap THEN
    RAISE EXCEPTION 'demo_quota';
  END IF;
  RETURN NEW;
END $$;
