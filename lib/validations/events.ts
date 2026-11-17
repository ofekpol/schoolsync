import { z } from "zod";
import { GradeSchema } from "@/lib/validations/grade";

/**
 * All-optional schema for draft create/PATCH/publish requests — partial saves
 * are allowed, so never require every field here.
 */
export const EventDraftSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  location: z.string().max(255).optional(),
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).optional(),
  allDay: z.boolean().optional(),
  eventTypeId: z.string().uuid().optional(),
  grades: z.array(GradeSchema).optional(),
});

export type EventDraftInput = z.infer<typeof EventDraftSchema>;

/**
 * Strict schema for one-step quick publish from the dashboard: every field
 * needed to show the event publicly is required; description, location and
 * allDay are optional.
 */
export const EventQuickPublishSchema = z.object({
  title: z.string().min(1).max(255),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  eventTypeId: z.string().uuid(),
  grades: z.array(GradeSchema).min(1),
  description: z.string().optional(),
  location: z.string().max(255).optional(),
  allDay: z.boolean().optional(),
});

export type EventQuickPublishInput = z.infer<typeof EventQuickPublishSchema>;

/**
 * Filters captured when a staff user creates an iCal subscription.
 * Empty arrays mean "no filter on this axis" (i.e. include all).
 */
export const ICalSubscriptionSchema = z.object({
  grades: z.array(GradeSchema).max(6).optional(),
  eventTypes: z.array(z.string().uuid()).max(50).optional(),
});
