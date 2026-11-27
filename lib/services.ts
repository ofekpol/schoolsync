import { z } from "zod";

export const SERVICES = ["gantt", "rooms"] as const;
export type Service = (typeof SERVICES)[number];

/** At least one known service; duplicates removed. */
export const ServicesSchema = z
  .array(z.enum(SERVICES))
  .min(1)
  .transform((list) => [...new Set(list)]);

export function hasService(school: { services: readonly string[] }, service: Service): boolean {
  return school.services.includes(service);
}

/** The school's landing page: the Gantt, or rooms for a rooms-only school (timetable is parked on `feature/timetable`). */
export function homePathFor(services: readonly string[]): "/dashboard" | "/rooms" {
  return !services.includes("gantt") && services.includes("rooms") ? "/rooms" : "/dashboard";
}
