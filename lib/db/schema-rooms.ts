import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Week } from "@/lib/rooms/week-schema";
import { academicYears, schoolIsolation, schools, staffUsers } from "./schema";

/** Rooms (migration 0030): the school week, rooms, weekly use, one-date releases, bookings. */
export const roomsWeek = pgTable(
  "rooms_week",
  {
    schoolId: uuid("school_id")
      .primaryKey()
      .references(() => schools.id, { onDelete: "cascade" }),
    week: jsonb().$type<Week>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  () => [schoolIsolation],
);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: text().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("rooms_school_name_active_key")
      .on(t.schoolId, t.name)
      .where(sql`${t.archivedAt} IS NULL`),
    check("rooms_name_check", sql`char_length(${t.name}) BETWEEN 1 AND 60`),
    schoolIsolation,
  ],
);

export const roomWeeklySlots = pgTable(
  "room_weekly_slots",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id, { onDelete: "cascade" }),
    day: smallint().notNull(),
    period: smallint().notNull(),
    label: text().notNull(),
    staffUserId: uuid("staff_user_id").references(() => staffUsers.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("room_weekly_slots_cell_key").on(t.roomId, t.academicYearId, t.day, t.period),
    check("room_weekly_slots_day_check", sql`${t.day} BETWEEN 0 AND 6`),
    check("room_weekly_slots_period_check", sql`${t.period} BETWEEN 1 AND 12`),
    check("room_weekly_slots_label_check", sql`char_length(${t.label}) BETWEEN 1 AND 60`),
    schoolIsolation,
  ],
);

export const roomSlotReleases = pgTable(
  "room_slot_releases",
  {
    slotId: uuid("slot_id")
      .notNull()
      .references(() => roomWeeklySlots.id, { onDelete: "cascade" }),
    date: date().notNull(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    releasedBy: uuid("released_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.slotId, t.date] }), schoolIsolation],
);

export const roomBookings = pgTable(
  "room_bookings",
  {
    id: uuid().primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").notNull(),
    date: date().notNull(),
    period: smallint().notNull(),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    note: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    canceledBy: uuid("canceled_by"),
  },
  (t) => [
    uniqueIndex("room_bookings_active_cell_key")
      .on(t.roomId, t.date, t.period)
      .where(sql`${t.canceledAt} IS NULL`),
    index("room_bookings_school_date_idx").on(t.schoolId, t.date),
    index("room_bookings_group_idx").on(t.groupId),
    check("room_bookings_period_check", sql`${t.period} BETWEEN 1 AND 12`),
    check("room_bookings_note_check", sql`${t.note} IS NULL OR char_length(${t.note}) <= 200`),
    schoolIsolation,
  ],
);
