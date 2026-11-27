import { describe, expect, it } from "vitest";
import { ServicesSchema, hasService, homePathFor } from "@/lib/services";

describe("services", () => {
  it("accepts known services and removes duplicates", () => {
    expect(ServicesSchema.parse(["gantt", "gantt"])).toEqual(["gantt"]);
  });
  it("rejects an empty list and unknown names", () => {
    expect(ServicesSchema.safeParse([]).success).toBe(false);
    expect(ServicesSchema.safeParse(["chess"]).success).toBe(false);
    expect(ServicesSchema.safeParse(["timetable"]).success).toBe(false);
  });
  it("hasService", () => {
    expect(hasService({ services: ["gantt"] }, "gantt")).toBe(true);
    expect(hasService({ services: [] }, "gantt")).toBe(false);
  });
  it("accepts rooms beside the Gantt", () => {
    expect(ServicesSchema.parse(["gantt", "rooms"])).toEqual(["gantt", "rooms"]);
  });
  it("homePathFor is the Gantt dashboard, or rooms for a rooms-only school", () => {
    expect(homePathFor(["gantt"])).toBe("/dashboard");
    expect(homePathFor(["gantt", "rooms"])).toBe("/dashboard");
    expect(homePathFor(["rooms"])).toBe("/rooms");
  });
});
