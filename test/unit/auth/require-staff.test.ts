import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { getStaffUser } from "@/lib/auth/session";
import { requireActiveStaff } from "@/lib/auth/require-staff";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getStaffUser: vi.fn() }));
vi.mock("@/lib/auth/demo-guard", () => ({ signedOutPath: vi.fn(async () => "/auth/login") }));

const activeUser = { id: "u1", status: "active", mustChangePassword: false, role: "editor" };

function mockUser(user: Record<string, unknown> | null): void {
  vi.mocked(getStaffUser).mockResolvedValue(user as Awaited<ReturnType<typeof getStaffUser>>);
}

describe("requireActiveStaff", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
  });

  it("returns an active user without redirecting", async () => {
    mockUser(activeUser);
    await expect(requireActiveStaff()).resolves.toBe(activeUser);
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    [null, "/auth/login"],
    [{ ...activeUser, status: "pending" }, "/auth/pending"],
    [{ ...activeUser, status: "deactivated" }, "/auth/deactivated"],
    [{ ...activeUser, mustChangePassword: true }, "/auth/change-password"],
  ])("redirects %o to %s", async (user, path) => {
    mockUser(user);
    await expect(requireActiveStaff()).rejects.toThrow(`REDIRECT:${path}`);
  });
});
