import { describe, it, expect, vi, beforeEach } from "vitest";
// Every school here has the Gantt service; the guard itself is tested in service-guard.test.ts.
vi.mock("@/lib/auth/service-guard", () => ({ serviceDisabledResponse: async () => null }));
import { NextRequest } from "next/server";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

const isEventTypeAllowedMock = vi.fn();
const getEventForEditorMock = vi.fn();
vi.mock("@/lib/events/queries", () => ({
  getEditorAllowedGrades: async () => [7, 8, 9, 10, 11, 12],
  getEditorDashboardEvents: async () => [],
  getEventForEditor: (...args: unknown[]) => getEventForEditorMock(...args),
  isEventTypeAllowed: (...args: unknown[]) => isEventTypeAllowedMock(...args),
}));

const createDraftMock = vi.fn();
const updateDraftMock = vi.fn();
vi.mock("@/lib/events/crud", () => ({
  createDraft: (...args: unknown[]) => createDraftMock(...args),
  updateDraft: (...args: unknown[]) => updateDraftMock(...args),
  deleteOrCancelEvent: vi.fn(),
  dismissCanceledEventForStaff: vi.fn(),
}));

const publishEventMock = vi.fn();
vi.mock("@/lib/events/approval", () => ({
  publishEvent: (...args: unknown[]) => publishEventMock(...args),
}));

vi.mock("@/lib/views/public-viewer-data", () => ({
  invalidatePublicViewerCache: vi.fn(),
}));

import { POST as createEvent } from "@/app/api/v1/events/route";
import { PATCH as patchEvent } from "@/app/api/v1/events/[id]/route";
import { POST as submitEvent } from "@/app/api/v1/events/[id]/submit/route";

const EVENT_ID = "00000000-0000-0000-0000-000000000123";
const TYPE_ID = "00000000-0000-0000-0000-000000000001";
const EDITOR = {
  id: "00000000-0000-0000-0000-0000000000e1",
  schoolId: "00000000-0000-0000-0000-00000000000a",
  schoolSlug: "school-a",
  role: "editor",
  status: "active",
  mustChangePassword: false,
};
const context = { params: Promise.resolve({ id: EVENT_ID }) };

function request(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/v1/events", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getStaffUserMock.mockResolvedValue(EDITOR);
  isEventTypeAllowedMock.mockResolvedValue(false);
  getEventForEditorMock.mockResolvedValue({ event: { eventTypeId: TYPE_ID }, grades: [] });
  updateDraftMock.mockResolvedValue({ status: "ok" });
});

describe("event-type scope on event write routes", () => {
  it("POST /events rejects an out-of-scope type before creating a draft", async () => {
    const res = await createEvent(request("POST", { eventTypeId: TYPE_ID }));
    expect(res.status).toBe(403);
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("PATCH /events/:id rejects changing to an out-of-scope type", async () => {
    const res = await patchEvent(request("PATCH", { eventTypeId: TYPE_ID }), context);
    expect(res.status).toBe(403);
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it("submit rejects a stored draft whose type is out of scope, even with an empty body", async () => {
    const res = await submitEvent(request("POST"), context);
    expect(res.status).toBe(403);
    expect(isEventTypeAllowedMock).toHaveBeenCalledWith(EDITOR, TYPE_ID);
    expect(publishEventMock).not.toHaveBeenCalled();
  });

  it("submit publishes when the stored type is in scope", async () => {
    isEventTypeAllowedMock.mockResolvedValue(true);
    const res = await submitEvent(request("POST"), context);
    expect(res.status).toBe(200);
    expect(publishEventMock).toHaveBeenCalledWith(EDITOR.schoolId, EVENT_ID, EDITOR.id);
  });

  it("submit returns 404 for a draft the editor does not own", async () => {
    getEventForEditorMock.mockResolvedValue(null);
    const res = await submitEvent(request("POST"), context);
    expect(res.status).toBe(404);
    expect(publishEventMock).not.toHaveBeenCalled();
  });
});
