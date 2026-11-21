import { describe, expect, it } from "vitest";
import { className } from "@/components/timetable/setup/className";

describe("className", () => {
  it("joins the grade label and the class number", () => {
    expect(className({ grade: 7, number: 1 }, () => "ז")).toBe("ז1");
    expect(className({ grade: 11, number: 3, name: null }, (g) => (g === 11 ? "יא" : "?"))).toBe("יא3");
  });

  it("prefers the class's own name", () => {
    expect(className({ grade: 7, number: 4, name: "ז מב\"ר" }, () => "ז")).toBe("ז מב\"ר");
  });
});
