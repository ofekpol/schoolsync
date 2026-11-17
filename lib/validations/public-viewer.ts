import { z } from "zod";
import { GradeSchema } from "@/lib/validations/grade";

export const PublicViewerEventSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  eventTypeId: z.string(),
  eventTypeKey: z.string(),
  eventTypeLabelHe: z.string(),
  eventTypeColor: z.string(),
  eventTypeGlyph: z.string(),
  grades: z.array(GradeSchema),
  status: z.enum(["approved", "canceled"]),
  isCanceled: z.boolean(),
  isUpdated: z.boolean(),
});

export const PublicViewerEventsResponseSchema = z.object({
  events: z.array(PublicViewerEventSchema),
});

export const PublicViewerEventSignatureResponseSchema = z.object({
  signature: z.string(),
});
