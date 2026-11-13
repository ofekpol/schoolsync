import { describe, expect, it } from "vitest";
import { ServicesSchema, hasService, homePathFor } from "@/lib/services";

describe("services", () => {
  it("accepts known services and removes duplicates", () => {
    expect(ServicesSchema.parse(["gantt", "gantt", "timetable"])).toEqual(["gantt", "timetable"]);
  });
  it("rejects an empty list and unknown names", () => {
    expect(ServicesSchema.safeParse([]).success).toBe(false);
    expect(ServicesSchema.safeParse(["rooms"]).success).toBe(false);
  });
  it("hasService", () => {
    expect(hasService({ services: ["gantt"] }, "gantt")).toBe(true);
    expect(hasService({ services: ["gantt"] }, "timetable")).toBe(false);
  });
  it("homePathFor prefers the Gantt dashboard", () => {
    expect(homePathFor(["gantt", "timetable"])).toBe("/dashboard");
    expect(homePathFor(["timetable"])).toBe("/timetable");
  });
});
