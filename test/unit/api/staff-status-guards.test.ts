import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getStaffUser: () => getStaffUserMock() }));

const getEventForEditorMock = vi.fn();
const getEditorDashboardEventsMock = vi.fn();
vi.mock("@/lib/events/queries", () => ({
  getEventForEditor: (...args: unknown[]) => getEventForEditorMock(...args),
  getEditorDashboardEvents: (...args: unknown[]) => getEditorDashboardEventsMock(...args),
  getEditorAllowedGrades: vi.fn(),
  isEventTypeAllowed: vi.fn(),
}));
vi.mock("@/lib/events/crud", () => ({
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  deleteOrCancelEvent: vi.fn(),
  dismissCanceledEventForStaff: vi.fn(),
}));
vi.mock("@/lib/events/approval", () => ({ publishEvent: vi.fn() }));
vi.mock("@/lib/views/public-viewer-data", () => ({ invalidatePublicViewerCache: vi.fn() }));

const listSubscriptionsMock = vi.fn();
const createSubscriptionMock = vi.fn();
const createPersonalMock = vi.fn();
vi.mock("@/lib/ical/subscriptions", () => ({
  listSubscriptionsForStaff: (...args: unknown[]) => listSubscriptionsMock(...args),
  createSubscription: (...args: unknown[]) => createSubscriptionMock(...args),
  createPersonalCalendarSubscription: (...args: unknown[]) => createPersonalMock(...args),
}));

import { GET as listEvents } from "@/app/api/v1/events/route";
import { GET as getEvent } from "@/app/api/v1/events/[id]/route";
import { GET as listFeeds, POST as createFeed } from "@/app/api/v1/ical-subscriptions/route";
import { POST as createPersonalFeed } from "@/app/api/v1/ical-subscriptions/personal/route";

const DEACTIVATED_ADMIN = {
  id: "u1",
  schoolId: "s1",
  role: "admin",
  status: "deactivated",
  mustChangePassword: false,
};

function jsonRequest(): NextRequest {
  return new NextRequest("http://localhost/x", { method: "POST", body: "{}" });
}

const eventParams = { params: Promise.resolve({ id: "00000000-0000-4000-8000-0000000000e1" }) };

describe("routes refuse staff who are not active", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStaffUserMock.mockResolvedValue(DEACTIVATED_ADMIN);
  });

  it.each([
    ["GET /events", () => listEvents(), getEditorDashboardEventsMock],
    ["GET /events/[id]", () => getEvent(jsonRequest(), eventParams), getEventForEditorMock],
    ["GET /ical-subscriptions", () => listFeeds(), listSubscriptionsMock],
    ["POST /ical-subscriptions", () => createFeed(jsonRequest()), createSubscriptionMock],
    ["POST /ical-subscriptions/personal", () => createPersonalFeed(jsonRequest()), createPersonalMock],
  ])("%s returns 403 and reads nothing", async (_name, call, dataMock) => {
    const res = await call();
    expect(res.status).toBe(403);
    expect(dataMock).not.toHaveBeenCalled();
  });

  it("answers 404 for a malformed event id without querying", async () => {
    getStaffUserMock.mockResolvedValue({ ...DEACTIVATED_ADMIN, status: "active" });
    const res = await getEvent(jsonRequest(), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(res.status).toBe(404);
    expect(getEventForEditorMock).not.toHaveBeenCalled();
  });

  it("still serves an active admin", async () => {
    getStaffUserMock.mockResolvedValue({ ...DEACTIVATED_ADMIN, status: "active" });
    getEventForEditorMock.mockResolvedValue({ id: "e1" });
    const res = await getEvent(jsonRequest(), eventParams);
    expect(res.status).toBe(200);
  });
});

describe("demo personal feed reuse", () => {
  const DEMO_ADMIN = {
    ...DEACTIVATED_ADMIN,
    status: "active",
    demoExpiresAt: new Date(Date.now() + 3_600_000),
  };
  const live = (id: string, filterGrades: number[] = [], filterEventTypes: string[] = []) => ({
    id, token: `token-${id}`, filterGrades, filterEventTypes, createdAt: new Date(), revokedAt: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getStaffUserMock.mockResolvedValue(DEMO_ADMIN);
    createPersonalMock.mockResolvedValue({ id: "new", token: "token-new" });
  });

  it("reuses the live unfiltered feed, never a newer filtered one", async () => {
    listSubscriptionsMock.mockResolvedValue([live("filtered", [10]), live("complete")]);
    const res = await createPersonalFeed(jsonRequest());
    await expect(res.json()).resolves.toMatchObject({ id: "complete" });
    expect(createPersonalMock).not.toHaveBeenCalled();
  });

  it("creates a complete feed when only filtered ones exist", async () => {
    listSubscriptionsMock.mockResolvedValue([live("filtered", [], ["type-1"])]);
    const res = await createPersonalFeed(jsonRequest());
    await expect(res.json()).resolves.toMatchObject({ id: "new" });
  });
});
