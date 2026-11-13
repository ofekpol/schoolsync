import { describe, it, expect, vi, beforeEach } from "vitest";
// Every school here has the Gantt service; the guard itself is tested in service-guard.test.ts.
vi.mock("@/lib/auth/service-guard", () => ({ serviceDisabledResponse: async () => null }));
import { NextRequest } from "next/server";
import { IMPORT_HEADERS } from "@/lib/import/calendar-import";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getStaffUser: (...args: unknown[]) => getStaffUserMock(...args) }));
vi.mock("@/lib/admin/event-types", () => ({
  listEventTypes: async () => [{ id: "00000000-0000-4000-8000-000000000001", key: "trip", labelHe: "טיול", labelEn: "Trip" }],
}));
const createMock = vi.fn();
vi.mock("@/lib/events/crud", () => ({ createPublishedEvents: (...args: unknown[]) => createMock(...args) }));
vi.mock("@/lib/views/public-viewer-data", () => ({ invalidatePublicViewerCache: vi.fn() }));

import { POST } from "@/app/api/v1/admin/import/route";

const ADMIN = { id: "00000000-0000-0000-0000-0000000000a1", schoolId: "00000000-0000-0000-0000-00000000000a", schoolSlug: "a", role: "admin", status: "active" };
const GOOD = `${IMPORT_HEADERS.join(",")}\nטיול,טיול,27/10/2026,,,,ז,,`;
const BAD = `${GOOD}\nx,מסיבה,27/10/2026,,,,,,`;

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/v1/admin/import", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
}

describe("POST /api/v1/admin/import", () => {
  beforeEach(() => {
    createMock.mockReset();
    getStaffUserMock.mockResolvedValue(ADMIN);
  });

  it("is admin only", async () => {
    getStaffUserMock.mockResolvedValue({ ...ADMIN, role: "editor" });
    expect((await post({ csv: GOOD, commit: true })).status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("previews without writing", async () => {
    const res = await post({ csv: GOOD, commit: false });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(body.imported).toBe(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("commits every row when all are valid", async () => {
    const res = await post({ csv: GOOD, commit: true });
    expect(res.status).toBe(201);
    expect((await res.json()).imported).toBe(1);
    expect(createMock).toHaveBeenCalledWith(ADMIN.schoolId, ADMIN.id, [expect.objectContaining({ title: "טיול", grades: [7] })]);
  });

  it("writes nothing when any row has an error", async () => {
    const res = await post({ csv: BAD, commit: true });
    const body = await res.json();
    expect(body.imported).toBe(0);
    expect(body.rows[1].error).toBe("unknown_type");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 422 for a malformed body", async () => {
    expect((await post({ csv: "" })).status).toBe(422);
  });
});
