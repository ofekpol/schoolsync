import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getStaffUserMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getStaffUser: (...args: unknown[]) => getStaffUserMock(...args),
}));

const listMock = vi.fn();
const approveMock = vi.fn();
const rejectMock = vi.fn();
vi.mock("@/lib/db/pending", () => ({
  listPendingRegistrations: (...args: unknown[]) => listMock(...args),
  approvePendingRegistration: (...args: unknown[]) => approveMock(...args),
  rejectPendingRegistration: (...args: unknown[]) => rejectMock(...args),
}));

import { GET, POST } from "@/app/api/v1/admin/staff/pending/route";

const SCHOOL_B = "00000000-0000-0000-0000-00000000000b";
const PENDING_ID = "00000000-0000-0000-0000-000000000002";
const ADMIN_B = {
  id: "00000000-0000-0000-0000-0000000000b1",
  schoolId: SCHOOL_B,
  role: "admin",
  status: "active",
  mustChangePassword: false,
  email: "admin@b.test",
  fullName: "Admin B",
};

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/v1/admin/staff/pending", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("/api/v1/admin/staff/pending school scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStaffUserMock.mockResolvedValue(ADMIN_B);
  });

  it("GET lists only the admin's own school", async () => {
    listMock.mockResolvedValue([]);
    await GET();
    expect(listMock).toHaveBeenCalledWith(SCHOOL_B);
  });

  it("reject passes the admin's school and maps not-found to 404", async () => {
    rejectMock.mockRejectedValue(new Error("pending_registration_not_found"));
    const res = await post({ action: "reject", pendingId: PENDING_ID });
    expect(rejectMock).toHaveBeenCalledWith(
      expect.objectContaining({ pendingId: PENDING_ID, schoolId: SCHOOL_B }),
    );
    expect(res.status).toBe(404);
  });

  it("approve maps not-found to 404", async () => {
    approveMock.mockRejectedValue(new Error("pending_registration_not_found"));
    const res = await post({
      action: "approve",
      pendingId: PENDING_ID,
      role: "editor",
      fullName: "Someone",
    });
    expect(res.status).toBe(404);
  });
});
