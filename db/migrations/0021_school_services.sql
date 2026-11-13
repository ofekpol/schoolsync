-- Which products a school has (docs/superpowers/specs/2026-11-13-timetable-design.md).
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "services" text[] NOT NULL DEFAULT '{gantt}';
--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_services_check"
  CHECK ("services" <@ ARRAY['gantt','timetable']::text[] AND cardinality("services") >= 1);
