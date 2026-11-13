import { z } from "zod";

export const SERVICES = ["gantt", "timetable"] as const;
export type Service = (typeof SERVICES)[number];

/** At least one known service; duplicates removed. */
export const ServicesSchema = z
  .array(z.enum(SERVICES))
  .min(1)
  .transform((list) => [...new Set(list)]);

export function hasService(school: { services: readonly string[] }, service: Service): boolean {
  return school.services.includes(service);
}

export function homePathFor(services: readonly string[]): "/dashboard" | "/timetable" {
  return services.includes("gantt") ? "/dashboard" : "/timetable";
}
