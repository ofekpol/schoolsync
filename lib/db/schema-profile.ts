import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { schoolIsolation, schools, staffUsers } from "./schema";

/**
 * Profile categories (migration 0022): descriptive labels only.
 * No permission check may read these tables.
 */
export const profileCategories = pgTable(
  "profile_categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: text().notNull(),
    multiSelect: boolean("multi_select").notNull().default(true),
    required: boolean().notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("profile_categories_school_name_active_key")
      .on(t.schoolId, t.name)
      .where(sql`${t.archivedAt} IS NULL`),
    schoolIsolation,
  ],
);

export const profileCategoryOptions = pgTable(
  "profile_category_options",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => profileCategories.id, { onDelete: "cascade" }),
    label: text().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("profile_category_options_category_label_active_key")
      .on(t.categoryId, t.label)
      .where(sql`${t.archivedAt} IS NULL`),
    schoolIsolation,
  ],
);

export const staffProfileOptions = pgTable(
  "staff_profile_options",
  {
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => profileCategoryOptions.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ name: "staff_profile_options_pk", columns: [t.staffUserId, t.optionId] }),
    index("staff_profile_options_school_option_idx").on(t.schoolId, t.optionId),
    schoolIsolation,
  ],
);
