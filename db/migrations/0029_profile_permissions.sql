-- Profile permissions: an admin-assigned category's options may carry powers.
-- Staff cannot set admin-assigned labels on themselves; free categories still grant nothing.

ALTER TABLE "profile_categories" ADD COLUMN IF NOT EXISTS "admin_assigned" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "profile_category_options" ADD COLUMN IF NOT EXISTS "permissions" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "profile_category_options" ADD CONSTRAINT "profile_category_options_permissions_check"
  CHECK ("permissions" <@ ARRAY['rooms.book','rooms.manage']::text[]);
