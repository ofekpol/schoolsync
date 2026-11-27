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

export const SlotInputSchema = z.object({
  day: DaySchema,
  period: PeriodSchema,
  label: z.string().trim().min(1).max(MAX_SLOT_LABEL),
  staffUserId: z.string().uuid().nullable().optional(),
});

export const WeeklySlotSchema = z.object({
  id: z.string().uuid(),
  day: z.number().int(),
  period: z.number().int(),
  label: z.string(),
  staffUserId: z.string().uuid().nullable(),
  staffName: z.string().nullable(),
  releasedDates: z.array(z.string()),
});
export const SlotsResponseSchema = z.object({ slots: z.array(WeeklySlotSchema) });

export const BookingInputSchema = z.object({
  roomId: RoomIdSchema,
  date: DateSchema,
  periods: z
    .array(PeriodSchema)
    .min(1)
    .max(MAX_PERIODS_PER_DAY)
    .transform((periods) => [...periods].sort((a, b) => a - b))
    .refine((periods) => periods.every((p, i) => i === 0 || p === periods[i - 1] + 1), {
      message: "periods_not_consecutive",
    }),
  note: z.string().trim().max(MAX_BOOKING_NOTE).nullable().optional(),
});

export const MyBookingSchema = z.object({
  groupId: z.string().uuid(),
  roomId: z.string().uuid(),
  roomName: z.string(),
  date: z.string(),
  periods: z.array(z.number().int()),
  note: z.string().nullable(),
});
export const MyBookingsResponseSchema = z.object({ bookings: z.array(MyBookingSchema) });

const CellSchema = z.discriminatedUnion("state", [
  z.object({ period: z.number().int(), state: z.literal("free") }),
  z.object({
    period: z.number().int(),
    state: z.literal("weekly"),
    slotId: z.string().uuid(),
    label: z.string(),
    staffName: z.string().nullable(),
  }),
  z.object({
    period: z.number().int(),
    state: z.literal("booked"),
    groupId: z.string().uuid(),
    staffName: z.string(),
    note: z.string().nullable(),
    mine: z.boolean(),
  }),
]);

export const DayViewSchema = z.object({
  date: z.string(),
  periods: z.array(z.object({ period: z.number().int(), start: z.string(), end: z.string() })),
  rooms: z.array(z.object({ id: z.string().uuid(), name: z.string(), cells: z.array(CellSchema) })),
});

/** `?date=&periods=3,4&free=1&q=&mine=1` from the URL (API and the /rooms page). */
export const DayQuerySchema = z.object({
  date: DateSchema.optional(),
  periods: z
    .string()
    .regex(/^\d{1,2}(,\d{1,2})*$/)
    .transform((s) => s.split(",").map(Number))
    .pipe(z.array(PeriodSchema))
    .optional(),
  free: z.literal("1").optional(),
  q: z.string().trim().max(MAX_ROOM_NAME).optional(),
  mine: z.literal("1").optional(),
});
