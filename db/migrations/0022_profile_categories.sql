-- Profile categories: free descriptive labels a school defines and its staff pick.
-- Labels never grant access; roles and editor scopes still decide that.

CREATE TABLE "profile_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "name" text NOT NULL,
  "multi_select" boolean DEFAULT true NOT NULL,
  "required" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "profile_categories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "profile_categories" ADD CONSTRAINT "profile_categories_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "profile_categories_school_name_active_key" ON "profile_categories" ("school_id", "name") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "profile_categories" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "profile_category_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "label" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "profile_category_options" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "profile_category_options" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "profile_category_options" ADD CONSTRAINT "profile_category_options_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profile_category_options" ADD CONSTRAINT "profile_category_options_category_id_profile_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."profile_categories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "profile_category_options_category_label_active_key" ON "profile_category_options" ("category_id", "label") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "profile_category_options" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

CREATE TABLE "staff_profile_options" (
  "staff_user_id" uuid NOT NULL,
  "option_id" uuid NOT NULL,
  "school_id" uuid NOT NULL,
  CONSTRAINT "staff_profile_options_pk" PRIMARY KEY ("staff_user_id", "option_id")
);
--> statement-breakpoint
ALTER TABLE "staff_profile_options" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "staff_profile_options" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "staff_profile_options" ADD CONSTRAINT "staff_profile_options_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_profile_options" ADD CONSTRAINT "staff_profile_options_option_id_profile_category_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."profile_category_options"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_profile_options" ADD CONSTRAINT "staff_profile_options_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "staff_profile_options_school_option_idx" ON "staff_profile_options" ("school_id", "option_id");
--> statement-breakpoint
CREATE POLICY "school_isolation" ON "staff_profile_options" AS PERMISSIVE FOR ALL TO public USING (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid) WITH CHECK (school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid);
--> statement-breakpoint

ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "profile_completed_at" timestamp with time zone;
