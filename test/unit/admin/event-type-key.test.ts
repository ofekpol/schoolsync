import { describe, expect, it } from "vitest";
import { slugifyEventTypeKey, uniqueEventTypeKey } from "@/lib/admin/event-type-key";

describe("event type keys", () => {
  it("slugifies the English label", () => {
    expect(slugifyEventTypeKey("Parent Meeting")).toBe("parent_meeting");
    expect(slugifyEventTypeKey("  Café / Trip!! ")).toBe("cafe_trip");
  });

  it("falls back when the label has no latin characters", () => {
    expect(slugifyEventTypeKey("טיול")).toBe("type");
  });

  it("caps the length so a suffix still fits in 64 chars", () => {
    expect(slugifyEventTypeKey("a".repeat(100))).toHaveLength(56);
  });

  it("adds the first free numeric suffix", () => {
    expect(uniqueEventTypeKey("trip", new Set())).toBe("trip");
    expect(uniqueEventTypeKey("trip", new Set(["trip", "trip_2"]))).toBe("trip_3");
  });
});
