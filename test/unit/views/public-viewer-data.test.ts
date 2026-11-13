import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTagMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
  unstable_cache: (fn: unknown) => fn,
}));

const resolveSchoolMock = vi.fn();
vi.mock("@/lib/db/schools", () => ({
  resolveGanttSchoolFromParam: (...args: unknown[]) => resolveSchoolMock(...args),
}));

const listEventTypesMock = vi.fn();
vi.mock("@/lib/events/queries", () => ({
  listEventTypes: (...args: unknown[]) => listEventTypesMock(...args),
}));

const getGradeColorsMock = vi.fn();
vi.mock("@/lib/db/grade-colors", () => ({
  getGradeColors: (...args: unknown[]) => getGradeColorsMock(...args),
}));

const getAgendaForSchoolMock = vi.fn();
const getAgendaSignatureForSchoolMock = vi.fn();
vi.mock("@/lib/views/agenda", () => ({
  getAgendaForSchool: (...args: unknown[]) => getAgendaForSchoolMock(...args),
  getAgendaSignatureForSchool: (...args: unknown[]) => getAgendaSignatureForSchoolMock(...args),
}));

import {
  getPublicViewerCacheTag,
  invalidatePublicViewerCache,
  loadPublicViewerData,
  loadPublicViewerEvents,
} from "@/lib/views/public-viewer-data";

describe("public viewer data cache", () => {
  beforeEach(() => {
    revalidateTagMock.mockReset();
    resolveSchoolMock.mockReset();
    listEventTypesMock.mockReset();
    getAgendaForSchoolMock.mockReset();
    getAgendaSignatureForSchoolMock.mockReset();
    getGradeColorsMock.mockReset();
  });

  it("uses a tenant-specific cache tag for public viewer data", () => {
    expect(getPublicViewerCacheTag("school-a")).toBe("public-viewer:school-a");
  });

  it("invalidates the tenant cache after event mutations", () => {
    invalidatePublicViewerCache("school-a");

    expect(revalidateTagMock).toHaveBeenCalledWith("public-viewer:school-a");
  });

  it("returns null without touching tenant data when the link token resolves no school", async () => {
    resolveSchoolMock.mockResolvedValue(null);

    expect(await loadPublicViewerData("test-a")).toBeNull();
    expect(await loadPublicViewerEvents("test-a")).toBeNull();
    expect(resolveSchoolMock).toHaveBeenCalledWith("test-a");
    expect(getAgendaForSchoolMock).not.toHaveBeenCalled();
    expect(listEventTypesMock).not.toHaveBeenCalled();
  });

  it("loads public events without requiring an active school year", async () => {
    resolveSchoolMock.mockResolvedValue({
      id: "school-1",
      slug: "school-a",
      name: "School A",
      locale: "he",
      timezone: "Asia/Jerusalem",
    });
    listEventTypesMock.mockResolvedValue([]);
    getGradeColorsMock.mockResolvedValue({ 9: "#CDEFD9" });
    getAgendaForSchoolMock.mockResolvedValue([{
      id: "event-1",
      title: "Summer event",
      startAt: new Date("2035-08-15T06:00:00.000Z"),
      endAt: new Date("2035-08-15T07:00:00.000Z"),
      allDay: false,
      description: null,
      location: null,
      eventTypeId: "type-1",
      eventTypeKey: "general",
      eventTypeLabelHe: "כללי",
      eventTypeColor: "#0ea5e9",
      eventTypeGlyph: "circle",
      grades: [9],
      status: "approved",
      isCanceled: false,
      isUpdated: false,
    }]);
    getAgendaSignatureForSchoolMock.mockResolvedValue("1:1:2035-08-15T07:00:00.000Z");

    const data = await loadPublicViewerData("school-a");

    expect(data?.year).toEqual({
      label: "2033-2038",
      startDate: "2033-01-01",
      endDate: "2038-12-31",
    });
    expect(data?.events).toHaveLength(1);
    expect(data?.eventSignature).toBe("1:1:2035-08-15T07:00:00.000Z");
    expect(data?.gradeColors).toEqual({ 9: "#CDEFD9" });
    expect(getGradeColorsMock).toHaveBeenCalledWith("school-1");
    expect(getAgendaForSchoolMock).toHaveBeenCalledWith("school-1", {});
    expect(getAgendaSignatureForSchoolMock).toHaveBeenCalledWith("school-1", {});
  });

  it("loads the event endpoint payload without loading the full viewer data", async () => {
    resolveSchoolMock.mockResolvedValue({ id: "school-1", slug: "school-a" });
    getAgendaForSchoolMock.mockResolvedValue([{
      id: "event-1",
      title: "Summer event",
      startAt: new Date("2035-08-15T06:00:00.000Z"),
      endAt: new Date("2035-08-15T07:00:00.000Z"),
      allDay: false,
      description: null,
      location: null,
      eventTypeId: "type-1",
      eventTypeKey: "general",
      eventTypeLabelHe: "כללי",
      eventTypeColor: "#0ea5e9",
      eventTypeGlyph: "circle",
      grades: [9],
      status: "approved",
      isCanceled: false,
      isUpdated: false,
    }]);

    const events = await loadPublicViewerEvents("school-a");

    expect(events).toHaveLength(1);
    expect(listEventTypesMock).not.toHaveBeenCalled();
    expect(getAgendaSignatureForSchoolMock).not.toHaveBeenCalled();
    expect(getAgendaForSchoolMock).toHaveBeenCalledWith("school-1", {});
  });
});
