import { describe, expect, it } from "vitest";
import { ServicesSchema, hasService, homePathFor } from "@/lib/services";

describe("services", () => {
  it("accepts known services and removes duplicates", () => {
    expect(ServicesSchema.parse(["gantt", "gantt"])).toEqual(["gantt"]);
  });
  it("rejects an empty list and unknown names", () => {
    expect(ServicesSchema.safeParse([]).success).toBe(false);
    expect(ServicesSchema.safeParse(["rooms"]).success).toBe(false);
    expect(ServicesSchema.safeParse(["timetable"]).success).toBe(false);
  });
  it("hasService", () => {
    expect(hasService({ services: ["gantt"] }, "gantt")).toBe(true);
    expect(hasService({ services: [] }, "gantt")).toBe(false);
  });
  it("homePathFor is the Gantt dashboard", () => {
    expect(homePathFor(["gantt"])).toBe("/dashboard");
  });
});
