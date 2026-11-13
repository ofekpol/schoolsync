import { beforeEach, describe, expect, it, vi } from "vitest";

const getSubscriptionByTokenMock = vi.fn();
vi.mock("@/lib/ical/subscriptions", () => ({
  getSubscriptionByToken: (...args: unknown[]) => getSubscriptionByTokenMock(...args),
}));

const getSchoolByIdMock = vi.fn();
vi.mock("@/lib/db/schools", () => ({
  getSchoolById: (...args: unknown[]) => getSchoolByIdMock(...args),
}));

const listEventTypesMock = vi.fn();
vi.mock("@/lib/events/queries", () => ({
  listEventTypes: (...args: unknown[]) => listEventTypesMock(...args),
}));

const getAgendaForSchoolMock = vi.fn();
vi.mock("@/lib/views/agenda", () => ({
  getAgendaForSchool: (...args: unknown[]) => getAgendaForSchoolMock(...args),
}));

const serializeCalendarMock = vi.fn();
vi.mock("@/lib/ical/serializer", () => ({
  serializeCalendar: (...args: unknown[]) => serializeCalendarMock(...args),
}));

import { GET } from "@/app/ical/[token]/route";

const SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  getSubscriptionByTokenMock.mockReset();
  listEventTypesMock.mockReset();
  getAgendaForSchoolMock.mockReset();
  serializeCalendarMock.mockReset();

  getSubscriptionByTokenMock.mockResolvedValue({
    id: "sub-1",
    schoolId: SCHOOL_ID,
    staffUserId: "staff-1",
    filterGrades: [],
    filterEventTypes: [],
    revokedAt: null,
  });
  getSchoolByIdMock.mockResolvedValue({ slug: "kfar-galim", name: "כפר גלים", services: ["gantt"] });
  listEventTypesMock.mockResolvedValue([]);
  serializeCalendarMock.mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
});

describe("GET /ical/[token]", () => {
  it("returns 404 once the school no longer has the Gantt service", async () => {
    getSchoolByIdMock.mockResolvedValue({ slug: "kfar-galim", name: "כפר גלים", services: ["timetable"] });
    const res = await GET(new Request("http://x/ical/t") as never, { params: Promise.resolve({ token: "t" }) });
    expect(res.status).toBe(404);
    expect(getAgendaForSchoolMock).not.toHaveBeenCalled();
  });

  it("includes canceled events marked as STATUS:CANCELLED so Google reflects the cancellation", async () => {
    getAgendaForSchoolMock.mockResolvedValue([
      agendaEvent({ id: "approved-1", title: "Visible lesson", isCanceled: false }),
      agendaEvent({ id: "canceled-1", title: "test", isCanceled: true }),
    ]);

    const res = await GET(
      new Request("http://localhost/ical/token-123") as never,
      { params: Promise.resolve({ token: "token-123" }) },
    );

    expect(res.status).toBe(200);
    expect(serializeCalendarMock).toHaveBeenCalledWith({
      schoolName: "כפר גלים",
      schoolSlug: "kfar-galim",
      events: [
        expect.objectContaining({
          id: "approved-1",
          title: "Visible lesson",
          canceled: false,
        }),
        expect.objectContaining({
          id: "canceled-1",
          title: "test",
          canceled: true,
        }),
      ],
    });
  });

  it("passes the row edit stamp and version through for DTSTAMP/SEQUENCE", async () => {
    getAgendaForSchoolMock.mockResolvedValue([
      agendaEvent({ id: "edited-1", title: "Edited", isCanceled: false }),
    ]);

    await GET(
      new Request("http://localhost/ical/token-123") as never,
      { params: Promise.resolve({ token: "token-123" }) },
    );

    expect(serializeCalendarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        events: [
          expect.objectContaining({
            updatedAt: new Date("2026-07-01T09:30:00.000Z"),
            version: 4,
          }),
        ],
      }),
    );
  });
});

function agendaEvent(overrides: { id: string; title: string; isCanceled: boolean }) {
  return {
    id: overrides.id,
    title: overrides.title,
    description: null,
    location: null,
    startAt: new Date("2026-06-08T06:00:00.000Z"),
    endAt: new Date("2026-06-08T07:00:00.000Z"),
    allDay: false,
    eventTypeId: "type-1",
    eventTypeKey: "general",
    eventTypeLabelHe: "כללי",
    eventTypeColor: "#f59e0b",
    eventTypeGlyph: "tag",
    grades: [7],
    status: overrides.isCanceled ? "canceled" : "approved",
    isCanceled: overrides.isCanceled,
    isUpdated: false,
    updatedAt: new Date("2026-07-01T09:30:00.000Z"),
    version: 4,
  };
}
