import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {}, supabaseAdmin: {}, withSchool: vi.fn() }));

import { DEMO_EVENTS_YEAR, demoEventRange, demoEvents } from "@/db/demo-events";
import { DEFAULT_EVENT_TYPES } from "@/lib/db/provision";
import { assertDemoSlug } from "@/scripts/seed-demo-events";

const TYPE_KEYS = new Set<string>(DEFAULT_EVENT_TYPES.map((type) => type.key));

describe("demo events", () => {
  const events = demoEvents();

  it("fills a realistic year", () => {
    expect(events.length).toBeGreaterThan(60);
  });

  it("uses only default event types and grades 7–12", () => {
    for (const event of events) {
      expect(TYPE_KEYS.has(event.typeKey), event.title).toBe(true);
      expect(event.grades.length).toBeGreaterThan(0);
      for (const grade of event.grades) expect(grade).toBeGreaterThanOrEqual(7);
    }
  });

  it("stays inside the school year and never ends before it starts", () => {
    for (const event of events) {
      expect(event.startDate >= DEMO_EVENTS_YEAR.startDate, event.title).toBe(true);
      expect((event.endDate ?? event.startDate) <= DEMO_EVENTS_YEAR.endDate, event.title).toBe(true);
      const { startAt, endAt } = demoEventRange(event);
      expect(endAt.getTime()).toBeGreaterThan(startAt.getTime());
    }
  });

  it("schedules no timed school activity on a Saturday", () => {
    for (const event of events.filter((e) => e.time !== undefined)) {
      expect(new Date(`${event.startDate}T12:00:00Z`).getUTCDay(), `${event.title} ${event.startDate}`).not.toBe(6);
    }
  });
});

describe("assertDemoSlug", () => {
  it("allows only the demo schools", () => {
    expect(() => assertDemoSlug("demo-school")).not.toThrow();
    expect(() => assertDemoSlug("edusolutions-demo")).not.toThrow();
    expect(() => assertDemoSlug("kfar-galim")).toThrow(/refusing/);
  });
});
