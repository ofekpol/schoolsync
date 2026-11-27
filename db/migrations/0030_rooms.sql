-- Rooms (docs/superpowers/specs/2026-11-26-rooms-design.md): a school's week of periods, its rooms,
-- weekly room use per academic year, one-date releases of that use, and one-off bookings.

ALTER TABLE "schools" DROP CONSTRAINT "schools_services_check";
--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_services_check"
  CHECK ("services" <@ ARRAY['gantt','timetable','rooms']::text[] AND cardinality("services") >= 1);
--> statement-breakpoint

CREATE TABLE "rooms_week" (
  "school_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."schools"("id") ON DELETE cascade,
  "week" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rooms_week" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rooms_week" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "rooms_week" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "public"."schools"("id") ON DELETE cascade,
  "name" text NOT NULL CHECK (char_length("name") BETWEEN 1 AND 60),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rooms" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_school_name_active_key" ON "rooms" ("school_id", "name") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "rooms" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "room_weekly_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "public"."schools"("id") ON DELETE cascade,
  "room_id" uuid NOT NULL REFERENCES "public"."rooms"("id") ON DELETE cascade,
  "academic_year_id" uuid NOT NULL REFERENCES "public"."academic_years"("id") ON DELETE cascade,
  "day" smallint NOT NULL CHECK ("day" BETWEEN 0 AND 6),
  "period" smallint NOT NULL CHECK ("period" BETWEEN 1 AND 12),
  "label" text NOT NULL CHECK (char_length("label") BETWEEN 1 AND 60),
  "staff_user_id" uuid REFERENCES "public"."staff_users"("id") ON DELETE set null,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room_weekly_slots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "room_weekly_slots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE UNIQUE INDEX "room_weekly_slots_cell_key" ON "room_weekly_slots" ("room_id", "academic_year_id", "day", "period");
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "room_weekly_slots" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "room_slot_releases" (
  "slot_id" uuid NOT NULL REFERENCES "public"."room_weekly_slots"("id") ON DELETE cascade,
  "date" date NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "public"."schools"("id") ON DELETE cascade,
  "released_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("slot_id", "date")
);
--> statement-breakpoint
ALTER TABLE "room_slot_releases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "room_slot_releases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "room_slot_releases" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "room_bookings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "public"."schools"("id") ON DELETE cascade,
  "room_id" uuid NOT NULL REFERENCES "public"."rooms"("id") ON DELETE cascade,
  "group_id" uuid NOT NULL,
  "date" date NOT NULL,
  "period" smallint NOT NULL CHECK ("period" BETWEEN 1 AND 12),
  "staff_user_id" uuid NOT NULL REFERENCES "public"."staff_users"("id") ON DELETE cascade,
  "note" text CHECK ("note" IS NULL OR char_length("note") <= 200),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "canceled_at" timestamp with time zone,
  "canceled_by" uuid
);
--> statement-breakpoint
ALTER TABLE "room_bookings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "room_bookings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE UNIQUE INDEX "room_bookings_active_cell_key" ON "room_bookings" ("room_id", "date", "period") WHERE "canceled_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "room_bookings_school_date_idx" ON "room_bookings" ("school_id", "date");
--> statement-breakpoint
CREATE INDEX "room_bookings_group_idx" ON "room_bookings" ("group_id");
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "room_bookings" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
