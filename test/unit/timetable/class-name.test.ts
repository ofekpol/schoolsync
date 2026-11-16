import { describe, expect, it } from "vitest";
import { className } from "@/components/timetable/setup/className";

describe("className", () => {
  it("joins the grade label and the class number", () => {
    expect(className(7, 1, () => "ז")).toBe("ז1");
    expect(className(11, 3, (g) => (g === 11 ? "יא" : "?"))).toBe("יא3");
  });
});
