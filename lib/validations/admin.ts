import { z } from "zod";
import { GRADE_COLOR_OPTIONS } from "@/lib/grade-colors";

/**
 * Zod validation schemas for /api/v1/admin/* routes.
 * All admin-facing inputs are validated at the API boundary before reaching domain helpers.
 */

export const StaffUserCreateSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(255),
  role: z.enum(["editor", "admin", "viewer"]),
  gradeScopes: z.array(z.number().int().min(7).max(12)).optional(),
  eventTypeScopes: z.array(z.string().min(1).max(64)).optional(),
});

export const StaffUserUpdateSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  role: z.enum(["editor", "admin", "viewer"]).optional(),
  deactivated: z.boolean().optional(),
  gradeScopes: z.array(z.number().int().min(7).max(12)).optional(),
  eventTypeScopes: z.array(z.string().min(1).max(64)).optional(),
});

export const StaffInviteCreateSchema = z.object({
  role: z.enum(["editor", "admin", "viewer"]),
  gradeScopes: z.array(z.number().int().min(7).max(12)).optional(),
  eventTypeScopes: z.array(z.string().min(1).max(64)).optional(),
  multiUse: z.boolean().optional().default(false),
});

export const ApprovePendingSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    pendingId: z.string().uuid(),
    role: z.enum(["editor", "admin", "viewer"]),
    fullName: z.string().min(1).max(255),
    gradeScopes: z.array(z.number().int().min(7).max(12)).optional(),
    eventTypeScopes: z.array(z.string().min(1).max(64)).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    pendingId: z.string().uuid(),
  }),
]);

/** Editable fields of an event type. The key is internal and never edited. */
export const EventTypeUpdateSchema = z.object({
  labelHe: z.string().trim().min(1).max(80),
  labelEn: z.string().trim().min(1).max(80),
  /** Hex color in #RRGGBB format */
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be #RRGGBB"),
  /** Single glyph or short string for the event type icon */
  glyph: z.string().trim().min(1).max(8),
});

/** Create input. `key` is optional: when omitted it is derived from labelEn. */
export const EventTypeSchema = EventTypeUpdateSchema.extend({
  key: z.string().trim().min(1).max(64).optional(),
});

/** New display order: every event type id of the school, first to last. */
export const EventTypeOrderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

const GradeColorEntrySchema = z.object({
  grade: z.number().int().min(7).max(12),
  colorHex: z.enum(GRADE_COLOR_OPTIONS),
});

/** PUT /api/v1/admin/grade-colors — colors must come from the curated palette. */
export const GradeColorsUpdateSchema = z.object({
  colors: z
    .array(GradeColorEntrySchema)
    .min(1)
    .max(6)
    .refine((rows) => new Set(rows.map((row) => row.grade)).size === rows.length, {
      message: "Duplicate grade",
    }),
});

export const GradeColorsResponseSchema = z.object({
  colors: z.record(z.string(), z.string().regex(/^#[0-9A-Fa-f]{6}$/)),
});
