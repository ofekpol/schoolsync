import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["editor", "admin", "viewer"]);
export const staffStatusEnum = pgEnum("staff_status", ["pending", "active", "deactivated"]);
export const eventStatusEnum = pgEnum("event_status", [
  "draft",
  "pending",
  "approved",
  "rejected",
  "canceled",
]);
export const scopeKindEnum = pgEnum("scope_kind", ["grade", "event_type"]);

// ─── RLS helper ───────────────────────────────────────────────────────────────

const schoolIsolation = pgPolicy("school_isolation", {
  as: "permissive",
  for: "all",
  using: sql`school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid`,
  withCheck: sql`school_id = NULLIF(current_setting('app.school_id', TRUE), '')::uuid`,
});

// ─── Tables ───────────────────────────────────────────────────────────────────

/** Tenant root — no RLS (schools table is the tenant anchor). */
export const schools = pgTable("schools", {
  id: uuid().defaultRandom().primaryKey(),
  slug: varchar({ length: 64 }).notNull().unique(),
  name: text().notNull(),
  locale: varchar({ length: 8 }).notNull().default("he"),
  timezone: varchar({ length: 64 }).notNull().default("Asia/Jerusalem"),
  /** Secret school link token (migration 0017) — the only key to public views and `?school=` sign-ups. */
  accessToken: text("access_token")
    .notNull()
    .unique("schools_access_token_key")
    .default(sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`),
  /** Nullable FK to academic_years; set after year is inserted to avoid circular. */
  activeAcademicYearId: uuid("active_academic_year_id"),
  /** Set only on public demo schools (migration 0019); a school is a demo iff this is non-null. */
  demoExpiresAt: timestamp("demo_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Demo creation ledger for abuse limits (migration 0019). Not tenant data; service pool only. */
export const demoCreations = pgTable("demo_creations", {
  id: uuid().defaultRandom().primaryKey(),
  ipHash: text("ip_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const academicYears = pgTable(
  "academic_years",
  {
    id: uuid().defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    label: text().notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [schoolIsolation, uniqueIndex("academic_years_school_id_label_key").on(t.schoolId, t.label)],
);

/**
 * Staff users — id mirrors auth.users.id (no defaultRandom; set explicitly during seed).
 * Pitfall 6: loginAttempts is required for AUTH-03 10-attempt lockout.
 */
export const staffUsers = pgTable(
  "staff_users",
  {
    id: uuid().primaryKey(), // NO defaultRandom — receives auth.users.id from seed
    schoolId: uuid("school_id").references(() => schools.id),
    email: varchar({ length: 255 }).notNull().unique(),
    fullName: text("full_name").notNull(),
    role: roleEnum().notNull().default("editor"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    loginAttempts: integer("login_attempts").notNull().default(0),
    status: staffStatusEnum().notNull().default("active"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  },
  () => [schoolIsolation],
);

export const editorScopes = pgTable(
  "editor_scopes",
  {
    id: uuid().defaultRandom().primaryKey(),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    scopeKind: scopeKindEnum("scope_kind").notNull(),
    scopeValue: varchar("scope_value", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    schoolIsolation,
    uniqueIndex("editor_scopes_unique_idx").on(
      t.staffUserId,
      t.scopeKind,
      t.scopeValue,
    ),
    index("editor_scopes_staff_user_idx").on(t.staffUserId),
  ],
);

export const staffInvites = pgTable(
  "staff_invites",
  {
    id: uuid().defaultRandom().primaryKey(),
    token: uuid().defaultRandom().notNull().unique(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    role: roleEnum().notNull().default("editor"),
    gradeScopes: integer("grade_scopes").array().notNull().default(sql`'{}'::integer[]`),
    eventTypeScopes: text("event_type_scopes").array().notNull().default(sql`'{}'::text[]`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    multiUse: boolean("multi_use").notNull().default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedBy: uuid("used_by").references(() => staffUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    schoolIsolation,
    index("staff_invites_school_idx").on(t.schoolId),
  ],
);

export const eventTypes = pgTable(
  "event_types",
  {
    id: uuid().defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    key: varchar({ length: 64 }).notNull(),
    labelHe: text("label_he").notNull(),
    labelEn: text("label_en").notNull(),
    colorHex: varchar("color_hex", { length: 7 }).notNull(),
    glyph: varchar({ length: 8 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    schoolIsolation,
    uniqueIndex("event_types_school_key_idx").on(t.schoolId, t.key),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid().defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    eventTypeId: uuid("event_type_id")
      .notNull()
      .references(() => eventTypes.id),
    title: text().notNull(),
    description: text(),
    location: text(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    status: eventStatusEnum().notNull().default("draft"),
    version: integer().notNull().default(1),
    /** Self-referential FK for revision-of-approved events. */
    parentEventId: uuid("parent_event_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => staffUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    schoolIsolation,
    index("events_school_status_idx").on(t.schoolId, t.status),
    index("events_school_start_idx").on(t.schoolId, t.startAt),
    index("events_public_filter_idx").on(t.schoolId, t.status, t.deletedAt, t.startAt),
  ],
);

/** Composite PK; school_id denormalized for RLS. */
export const eventGrades = pgTable(
  "event_grades",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    grade: integer().notNull(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.grade] }),
    schoolIsolation,
    index("event_grades_school_grade_event_idx").on(t.schoolId, t.grade, t.eventId),
  ],
);

export const eventRevisions = pgTable(
  "event_revisions",
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    snapshot: jsonb().notNull(),
    submittedBy: uuid("submitted_by").references(() => staffUsers.id),
    decidedBy: uuid("decided_by").references(() => staffUsers.id),
    decision: varchar({ length: 16 }),
    reason: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    schoolIsolation,
    index("event_revisions_event_created_idx").on(t.eventId, t.createdAt),
    index("event_revisions_event_decision_idx").on(t.eventId, t.decision),
  ],
);

/** Per-school grade color overrides; grades without a row use DEFAULT_GRADE_COLORS. */
export const schoolGradeColors = pgTable(
  "school_grade_colors",
  {
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    grade: integer().notNull(),
    colorHex: varchar("color_hex", { length: 7 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ name: "school_grade_colors_pk", columns: [t.schoolId, t.grade] }),
    check("school_grade_colors_grade_check", sql`${t.grade} BETWEEN 7 AND 12`),
    check("school_grade_colors_hex_check", sql`${t.colorHex} ~ '^#[0-9A-Fa-f]{6}$'`),
    schoolIsolation,
  ],
);

export const staffEventDismissals = pgTable(
  "staff_event_dismissals",
  {
    id: uuid().defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    schoolIsolation,
    uniqueIndex("staff_event_dismissals_staff_event_idx").on(t.staffUserId, t.eventId),
    index("staff_event_dismissals_school_staff_idx").on(t.schoolId, t.staffUserId),
    index("staff_event_dismissals_event_idx").on(t.eventId),
  ],
);

export const icalSubscriptions = pgTable(
  "ical_subscriptions",
  {
    id: uuid().defaultRandom().primaryKey(),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    token: varchar({ length: 64 }).notNull().unique(),
    filterGrades: integer("filter_grades").array().notNull().default(sql`'{}'::integer[]`),
    filterEventTypes: uuid("filter_event_types").array().notNull().default(sql`'{}'::uuid[]`),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  () => [schoolIsolation],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    actorStaffId: uuid("actor_staff_id").references(() => staffUsers.id),
    action: varchar({ length: 64 }).notNull(),
    targetTable: varchar("target_table", { length: 64 }).notNull(),
    targetId: uuid("target_id"),
    payload: jsonb(),
    at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    schoolIsolation,
    index("audit_log_school_at_idx").on(t.schoolId, t.at),
  ],
);

export const pendingRegistrations = pgTable("pending_registrations", {
  id: uuid().defaultRandom().primaryKey(),
  authUserId: uuid("auth_user_id").notNull().unique(),
  // NULL = signed up without a school link; invisible to every admin.
  schoolId: uuid("school_id").references(() => schools.id, { onDelete: "cascade" }),
  email: varchar({ length: 255 }).notNull().unique(),
  fullName: text("full_name").notNull().default(""),
  googleAvatarUrl: text("google_avatar_url"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: uuid("reviewed_by").references(() => staffUsers.id),
  reviewOutcome: varchar("review_outcome", { length: 16 }),
});

// Supabase Auth users allowed to provision schools (/platform/schools). Not tenant data.
export const platformAdmins = pgTable("platform_admins", {
  authUserId: uuid("auth_user_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
