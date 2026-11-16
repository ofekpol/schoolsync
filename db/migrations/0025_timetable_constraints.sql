-- timeTable constraints (plan 6). params hold what was entered (a target may be a
-- profile label); the export turns it into teacher ids. One free day per teacher.
-- tt_teacher_responses records who answered the collection round.

CREATE TABLE "tt_constraints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "board_id" uuid NOT NULL,
  "type" text NOT NULL,
  "hardness" text NOT NULL,
  "weight" integer NOT NULL,
  "params" jsonb NOT NULL,
  "source" text NOT NULL,
  "teacher_id" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tt_constraints_hardness_check" CHECK ("hardness" IN ('hard', 'soft')),
  CONSTRAINT "tt_constraints_source_check" CHECK ("source" IN ('teacher', 'management')),
  CONSTRAINT "tt_constraints_weight_check" CHECK ("weight" BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "tt_constraints" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_constraints" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_constraints" ADD CONSTRAINT "tt_constraints_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_constraints" ADD CONSTRAINT "tt_constraints_board_id_tt_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."tt_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_constraints" ADD CONSTRAINT "tt_constraints_teacher_id_tt_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."tt_teachers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_constraints" ADD CONSTRAINT "tt_constraints_created_by_staff_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "tt_constraints_board_idx" ON "tt_constraints" ("board_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tt_constraints_free_day_key" ON "tt_constraints" ("board_id", "teacher_id") WHERE "type" = 'teacher_free_day';
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "tt_constraints" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "tt_teacher_responses" (
  "board_id" uuid NOT NULL,
  "teacher_id" uuid NOT NULL,
  "school_id" uuid NOT NULL,
  "answered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "by_management" boolean NOT NULL,
  "answered_by" uuid,
  CONSTRAINT "tt_teacher_responses_pk" PRIMARY KEY ("board_id", "teacher_id")
);
--> statement-breakpoint
ALTER TABLE "tt_teacher_responses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_teacher_responses" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_teacher_responses" ADD CONSTRAINT "tt_teacher_responses_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_teacher_responses" ADD CONSTRAINT "tt_teacher_responses_board_id_tt_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."tt_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_teacher_responses" ADD CONSTRAINT "tt_teacher_responses_teacher_id_tt_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."tt_teachers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_teacher_responses" ADD CONSTRAINT "tt_teacher_responses_answered_by_staff_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "tt_teacher_responses" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
