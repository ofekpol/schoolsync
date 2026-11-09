import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

const getEditorAllowedGradesMock = vi.fn();
const isEventTypeAllowedMock = vi.fn();
vi.mock("@/lib/events/queries", () => ({
  getEditorAllowedGrades: (...args: unknown[]) => getEditorAllowedGradesMock(...args),
  isEventTypeAllowed: (...args: unknown[]) => isEventTypeAllowedMock(...args),
}));

const createPublishedEventMock = vi.fn();
vi.mock("@/lib/events/crud", () => ({
  createPublishedEvent: (...args: unknown[]) => createPublishedEventMock(...args),
}));

const invalidatePublicViewerCacheMock = vi.fn();
vi.mock("@/lib/views/public-viewer-data", () => ({
  invalidatePublicViewerCache: (...args: unknown[]) => invalidatePublicViewerCacheMock(...args),
}));

import { POST } from "@/app/api/v1/events/publish/route";

const VALID_BODY = {
  title: "Quick event",
  eventTypeId: "00000000-0000-0000-0000-000000000001",
  grades: [9],
  startAt: "2031-02-03T08:00:00+02:00",
  endAt: "2031-02-03T09:00:00+02:00",
  allDay: false,
};

const ACTIVE_EDITOR = {
  id: "00000000-0000-0000-0000-0000000000e1",
  schoolId: "00000000-0000-0000-0000-00000000000a",
  role: "editor",
  status: "active",
  mustChangePassword: false,
  schoolSlug: "school-a",
};

describe("POST /api/v1/events/publish", () => {
  beforeEach(() => {
    getStaffUserMock.mockReset();
    getEditorAllowedGradesMock.mockReset();
    createPublishedEventMock.mockReset();
    invalidatePublicViewerCacheMock.mockReset();
    getEditorAllowedGradesMock.mockResolvedValue([9, 10]);
    isEventTypeAllowedMock.mockReset();
    isEventTypeAllowedMock.mockResolvedValue(true);
    createPublishedEventMock.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000123",
      version: 1,
      status: "approved",
    });
  });

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost/api/v1/events/publish", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when unauthenticated", async () => {
    getStaffUserMock.mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewers", async () => {
    getStaffUserMock.mockResolvedValue({ ...ACTIVE_EDITOR, role: "viewer" });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("returns 403 for inactive users", async () => {
    getStaffUserMock.mockResolvedValue({ ...ACTIVE_EDITOR, status: "deactivated" });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("returns 403 for users who must change password", async () => {
    getStaffUserMock.mockResolvedValue({ ...ACTIVE_EDITOR, mustChangePassword: true });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid payloads", async () => {
    getStaffUserMock.mockResolvedValue(ACTIVE_EDITOR);
    const { title: _, ...invalid } = VALID_BODY;
    const res = await POST(makeRequest(invalid));
    expect(res.status).toBe(400);
  });

  it("returns 403 when an editor selects an out-of-scope grade", async () => {
    getStaffUserMock.mockResolvedValue(ACTIVE_EDITOR);
    getEditorAllowedGradesMock.mockResolvedValue([10]);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("scope_violation");
    expect(body.grades).toEqual([9]);
  });

  it("returns 403 when an editor publishes an out-of-scope event type", async () => {
    getStaffUserMock.mockResolvedValue(ACTIVE_EDITOR);
    isEventTypeAllowedMock.mockResolvedValue(false);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("scope_violation");
    expect(body.eventTypeId).toBe(VALID_BODY.eventTypeId);
    expect(isEventTypeAllowedMock).toHaveBeenCalledWith(ACTIVE_EDITOR, VALID_BODY.eventTypeId);
    expect(createPublishedEventMock).not.toHaveBeenCalled();
  });

  it("checks event-type ownership for admins too", async () => {
    const admin = { ...ACTIVE_EDITOR, role: "admin" };
    getStaffUserMock.mockResolvedValue(admin);
    isEventTypeAllowedMock.mockResolvedValue(false);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(isEventTypeAllowedMock).toHaveBeenCalledWith(admin, VALID_BODY.eventTypeId);
    expect(createPublishedEventMock).not.toHaveBeenCalled();
  });

  it("creates a published event for valid editor requests", async () => {
    getStaffUserMock.mockResolvedValue(ACTIVE_EDITOR);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("approved");
    expect(createPublishedEventMock).toHaveBeenCalledWith(
      ACTIVE_EDITOR.schoolId,
      ACTIVE_EDITOR.id,
      VALID_BODY,
    );
    expect(invalidatePublicViewerCacheMock).toHaveBeenCalledWith(ACTIVE_EDITOR.schoolSlug);
  });

  it("creates events without requiring an active academic year", async () => {
    getStaffUserMock.mockResolvedValue(ACTIVE_EDITOR);

    const res = await POST(makeRequest({
      ...VALID_BODY,
      startAt: "2035-08-15T08:00:00+02:00",
      endAt: "2035-08-15T09:00:00+02:00",
    }));

    expect(res.status).toBe(201);
    expect(createPublishedEventMock).toHaveBeenCalled();
  });
});
