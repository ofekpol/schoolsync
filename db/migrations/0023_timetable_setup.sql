-- timeTable setup data: a board holds its own classes, subjects, teachers and lessons.
-- A lesson block with one class is an ordinary lesson; two or more classes is a Plata.
-- Blocks reference subjects, classes and teachers with NO ACTION, so deleting a board
-- cascades cleanly while deleting a subject, class or teacher that a block uses fails.

CREATE TABLE "tt_boards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "academic_year_id" uuid NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'setup' NOT NULL,
  "week" jsonb NOT NULL,
  "teacher_deadline" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tt_boards_status_check" CHECK ("status" IN ('setup', 'collecting', 'review', 'published'))
);
--> statement-breakpoint
ALTER TABLE "tt_boards" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_boards" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_boards" ADD CONSTRAINT "tt_boards_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_boards" ADD CONSTRAINT "tt_boards_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "tt_boards_school_name_key" ON "tt_boards" ("school_id", "name");
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "tt_boards" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "tt_classes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "board_id" uuid NOT NULL,
  "grade" integer NOT NULL,
  "number" integer NOT NULL,
  CONSTRAINT "tt_classes_grade_check" CHECK ("grade" BETWEEN 7 AND 12),
  CONSTRAINT "tt_classes_number_check" CHECK ("number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "tt_classes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_classes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_classes" ADD CONSTRAINT "tt_classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_classes" ADD CONSTRAINT "tt_classes_board_id_tt_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."tt_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "tt_classes_board_grade_number_key" ON "tt_classes" ("board_id", "grade", "number");
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "tt_classes" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "tt_subjects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "board_id" uuid NOT NULL,
  "name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tt_subjects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_subjects" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_subjects" ADD CONSTRAINT "tt_subjects_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_subjects" ADD CONSTRAINT "tt_subjects_board_id_tt_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."tt_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "tt_subjects_board_name_key" ON "tt_subjects" ("board_id", "name");
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "tt_subjects" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "tt_teachers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "board_id" uuid NOT NULL,
  "full_name" text NOT NULL,
  "staff_user_id" uuid,
  "free_day_entitled" boolean DEFAULT true NOT NULL,
  "external_ref" text
);
--> statement-breakpoint
ALTER TABLE "tt_teachers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_teachers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_teachers" ADD CONSTRAINT "tt_teachers_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_teachers" ADD CONSTRAINT "tt_teachers_board_id_tt_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."tt_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_teachers" ADD CONSTRAINT "tt_teachers_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "tt_teachers_board_staff_key" ON "tt_teachers" ("board_id", "staff_user_id") WHERE "staff_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "tt_teachers" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "tt_lesson_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "board_id" uuid NOT NULL,
  "subject_id" uuid NOT NULL,
  "weekly_periods" integer NOT NULL,
  "external_ref" text,
  CONSTRAINT "tt_lesson_blocks_weekly_periods_check" CHECK ("weekly_periods" BETWEEN 1 AND 12)
);
--> statement-breakpoint
ALTER TABLE "tt_lesson_blocks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_lesson_blocks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_lesson_blocks" ADD CONSTRAINT "tt_lesson_blocks_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_lesson_blocks" ADD CONSTRAINT "tt_lesson_blocks_board_id_tt_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."tt_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_lesson_blocks" ADD CONSTRAINT "tt_lesson_blocks_subject_id_tt_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."tt_subjects"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "tt_lesson_blocks_board_idx" ON "tt_lesson_blocks" ("board_id");
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "tt_lesson_blocks" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "tt_block_classes" (
  "block_id" uuid NOT NULL,
  "class_id" uuid NOT NULL,
  "school_id" uuid NOT NULL,
  CONSTRAINT "tt_block_classes_pk" PRIMARY KEY ("block_id", "class_id")
);
--> statement-breakpoint
ALTER TABLE "tt_block_classes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_block_classes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_block_classes" ADD CONSTRAINT "tt_block_classes_block_id_tt_lesson_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."tt_lesson_blocks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_block_classes" ADD CONSTRAINT "tt_block_classes_class_id_tt_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."tt_classes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_block_classes" ADD CONSTRAINT "tt_block_classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "tt_block_classes_class_idx" ON "tt_block_classes" ("class_id");
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "tt_block_classes" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "tt_block_teachers" (
  "block_id" uuid NOT NULL,
  "teacher_id" uuid NOT NULL,
  "school_id" uuid NOT NULL,
  CONSTRAINT "tt_block_teachers_pk" PRIMARY KEY ("block_id", "teacher_id")
);
--> statement-breakpoint
ALTER TABLE "tt_block_teachers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_block_teachers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tt_block_teachers" ADD CONSTRAINT "tt_block_teachers_block_id_tt_lesson_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."tt_lesson_blocks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_block_teachers" ADD CONSTRAINT "tt_block_teachers_teacher_id_tt_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."tt_teachers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tt_block_teachers" ADD CONSTRAINT "tt_block_teachers_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "tt_block_teachers_teacher_idx" ON "tt_block_teachers" ("teacher_id");
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "tt_block_teachers" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
