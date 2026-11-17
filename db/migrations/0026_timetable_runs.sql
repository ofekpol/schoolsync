-- timeTable generation (plan 7). A run is one request to the solver; it yields up
-- to three solutions (one per profile), each a set of placements. A board's
-- published solution is chosen from them. tt_placements.block_id has no FK: a
-- meeting block's id is its constraint's id, not a lesson block id.

CREATE TABLE "tt_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "board_id" uuid NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "error" text,
  "input" jsonb NOT NULL,
  "requested_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  CONSTRAINT "tt_runs_status_check" CHECK ("status" IN ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "tt_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_runs" ADD CONSTRAINT "tt_runs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_runs" ADD CONSTRAINT "tt_runs_board_id_tt_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."tt_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_runs" ADD CONSTRAINT "tt_runs_requested_by_staff_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "tt_runs_board_created_idx" ON "tt_runs" ("board_id", "created_at");
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "tt_runs" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "tt_solutions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "board_id" uuid NOT NULL,
  "profile" text NOT NULL,
  "status" text NOT NULL,
  "error" text,
  "score" double precision DEFAULT 0 NOT NULL,
  "violations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tt_solutions_profile_check" CHECK ("profile" IN ('teachers', 'classes', 'balanced')),
  CONSTRAINT "tt_solutions_status_check" CHECK ("status" IN ('ok', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "tt_solutions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_solutions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_solutions" ADD CONSTRAINT "tt_solutions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_solutions" ADD CONSTRAINT "tt_solutions_run_id_tt_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."tt_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_solutions" ADD CONSTRAINT "tt_solutions_board_id_tt_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."tt_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "tt_solutions_run_profile_key" ON "tt_solutions" ("run_id", "profile");
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "tt_solutions" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "tt_placements" (
  "school_id" uuid NOT NULL,
  "solution_id" uuid NOT NULL,
  "block_id" uuid NOT NULL,
  "day" integer NOT NULL,
  "period" integer NOT NULL,
  "pinned" boolean DEFAULT false NOT NULL,
  CONSTRAINT "tt_placements_pk" PRIMARY KEY ("solution_id", "block_id", "day", "period"),
  CONSTRAINT "tt_placements_day_check" CHECK ("day" BETWEEN 0 AND 6),
  CONSTRAINT "tt_placements_period_check" CHECK ("period" >= 1)
);
--> statement-breakpoint
ALTER TABLE "tt_placements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_placements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_placements" ADD CONSTRAINT "tt_placements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_placements" ADD CONSTRAINT "tt_placements_solution_id_tt_solutions_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."tt_solutions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "tt_placements" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

ALTER TABLE "tt_boards" ADD COLUMN "published_solution_id" uuid;
--> statement-breakpoint
ALTER TABLE "tt_boards" ADD CONSTRAINT "tt_boards_published_solution_id_tt_solutions_id_fk" FOREIGN KEY ("published_solution_id") REFERENCES "public"."tt_solutions"("id") ON DELETE set null ON UPDATE no action;
