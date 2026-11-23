import { z } from "zod";

export const SERVICES = ["gantt"] as const;
export type Service = (typeof SERVICES)[number];

/** At least one known service; duplicates removed. */
export const ServicesSchema = z
  .array(z.enum(SERVICES))
  .min(1)
  .transform((list) => [...new Set(list)]);

export function hasService(school: { services: readonly string[] }, service: Service): boolean {
  return school.services.includes(service);
}

/** The school's landing page. Only the Gantt exists today (timetable is parked on `feature/timetable`). */
export function homePathFor(_services: readonly string[]): "/dashboard" {
  return "/dashboard";
}
