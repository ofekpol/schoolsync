import { z } from "zod";
import { TIME_OF_DAY_RE } from "@/lib/datetime";
import { MAX_PERIODS_PER_DAY } from "@/lib/rooms/week-schema";

export const MAX_ROOM_NAME = 60;
export const MAX_SLOT_LABEL = 60;
export const MAX_BOOKING_NOTE = 200;
export const MAX_ROOMS = 200;

export const RoomIdSchema = z.string().uuid();
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)));
export const PeriodSchema = z.number().int().min(1).max(MAX_PERIODS_PER_DAY);
export const DaySchema = z.number().int().min(0).max(6);
export const TimeSchema = z.string().regex(TIME_OF_DAY_RE);

export const RoomNameInputSchema = z.object({ name: z.string().trim().min(1).max(MAX_ROOM_NAME) });
export const RoomOrderSchema = z.object({ ids: z.array(RoomIdSchema).max(MAX_ROOMS) });

export const RoomSchema = z.object({ id: z.string().uuid(), name: z.string(), sortOrder: z.number().int() });
export type Room = z.infer<typeof RoomSchema>;
