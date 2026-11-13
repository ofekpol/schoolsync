import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requirePlatformAdminMock = vi.fn();
vi.mock("@/lib/auth/platform-admin", () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdminMock(...args),
}));

const updateSchoolServicesMock = vi.fn();
vi.mock("@/lib/db/schools", () => ({
  updateSchoolServices: (...args: unknown[]) => updateSchoolServicesMock(...args),
}));

import { PATCH } from "@/app/api/v1/platform/schools/[id]/route";

const SCHOOL_ID = "00000000-0000-0000-0000-0000000000c1";

function call(body: unknown, id = SCHOOL_ID) {
  const request = new NextRequest(`http://localhost/api/v1/platform/schools/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return PATCH(request, { params: Promise.resolve({ id }) });
}

describe("PATCH /api/v1/platform/schools/[id]", () => {
  beforeEach(() => {
    requirePlatformAdminMock.mockReset();
    requirePlatformAdminMock.mockResolvedValue({ id: "platform-admin" });
    updateSchoolServicesMock.mockReset();
  });

  it("returns 403 when the caller is not a platform admin", async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new Response("Forbidden", { status: 403 }));
    expect((await call({ services: ["gantt"] })).status).toBe(403);
    expect(updateSchoolServicesMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty or unknown services list or a bad id", async () => {
    expect((await call({ services: [] })).status).toBe(400);
    expect((await call({ services: ["rooms"] })).status).toBe(400);
    expect((await call({ services: ["gantt"] }, "not-a-uuid")).status).toBe(400);
    expect(updateSchoolServicesMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the school does not exist", async () => {
    updateSchoolServicesMock.mockResolvedValue(false);
    expect((await call({ services: ["gantt"] })).status).toBe(404);
  });

  it("updates the services and returns them", async () => {
    updateSchoolServicesMock.mockResolvedValue(true);
    const res = await call({ services: ["gantt", "timetable"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ services: ["gantt", "timetable"] });
    expect(updateSchoolServicesMock).toHaveBeenCalledWith(SCHOOL_ID, ["gantt", "timetable"]);
  });
});
