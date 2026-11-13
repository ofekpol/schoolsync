import { describe, it, expect, vi, beforeEach } from "vitest";

const SCHOOL_ID = "00000000-0000-0000-0000-0000000000a1";

const listUsersMock = vi.fn();
const createUserMock = vi.fn();
const generateLinkMock = vi.fn();
const withSchoolMock = vi.fn();
const deleteWhereMock = vi.fn();
const insertValuesMock = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    insert: () => ({
      values: (...args: unknown[]) => {
        insertValuesMock(...args);
        return {
        onConflictDoNothing: () => ({
          returning: async () => [{ id: SCHOOL_ID, accessToken: "tok" }],
        }),
        };
      },
    }),
    delete: () => ({ where: (...args: unknown[]) => deleteWhereMock(...args) }),
  },
  supabaseAdmin: {
    auth: {
      admin: {
        listUsers: (...args: unknown[]) => listUsersMock(...args),
        createUser: (...args: unknown[]) => createUserMock(...args),
        generateLink: (...args: unknown[]) => generateLinkMock(...args),
      },
    },
  },
  withSchool: (...args: unknown[]) => withSchoolMock(...args),
}));

import { provisionSchool } from "@/lib/db/provision";

const INPUT = {
  slug: "new-school",
  name: "New School",
  locale: "he" as const,
  timezone: "Asia/Jerusalem",
  adminEmail: "admin@new-school.test",
  adminName: "New Admin",
};

const fakeTx = { insert: () => ({ values: async () => undefined }) };

function usersPage(count: number, emailAt?: { index: number; email: string; id: string }) {
  const users: Array<{ id: string; email: string; email_confirmed_at?: string | null }> = Array.from(
    { length: count },
    (_, i) => ({ id: `u${i}`, email: `u${i}@x.test` }),
  );
  if (emailAt) users[emailAt.index] = { id: emailAt.id, email: emailAt.email, email_confirmed_at: "2026-01-01T00:00:00Z" };
  return { data: { users }, error: null };
}

beforeEach(() => {
  vi.resetAllMocks();
  withSchoolMock.mockImplementation((_id: string, fn: (tx: unknown) => unknown) => fn(fakeTx));
  generateLinkMock.mockResolvedValue({
    data: { properties: { action_link: "https://example.test/magic" } },
    error: null,
  });
});

describe("provisionSchool", () => {
  it("stores the chosen services on the school row", async () => {
    listUsersMock.mockResolvedValueOnce(usersPage(1, { index: 0, email: INPUT.adminEmail, id: "a" }));
    await provisionSchool({ ...INPUT, services: ["gantt", "timetable"] }, "https://app.test");
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ services: ["gantt", "timetable"] }),
    );
  });

  it("defaults services to gantt only", async () => {
    listUsersMock.mockResolvedValueOnce(usersPage(1, { index: 0, email: INPUT.adminEmail, id: "a" }));
    await provisionSchool(INPUT, "https://app.test");
    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ services: ["gantt"] }));
  });

  it("finds an existing admin auth user beyond the first page of users", async () => {
    listUsersMock
      .mockResolvedValueOnce(usersPage(200))
      .mockResolvedValueOnce(usersPage(5, { index: 3, email: INPUT.adminEmail, id: "existing-id" }));

    const result = await provisionSchool(INPUT, "https://app.test");

    expect(result.adminAuthUserId).toBe("existing-id");
    expect(createUserMock).not.toHaveBeenCalled();
    expect(listUsersMock).toHaveBeenNthCalledWith(2, { page: 2, perPage: 200 });
  });

  it("refuses to reuse an unconfirmed auth user someone may have pre-registered", async () => {
    listUsersMock.mockResolvedValueOnce({
      data: { users: [{ id: "squatter", email: INPUT.adminEmail, email_confirmed_at: null }] },
      error: null,
    });

    await expect(provisionSchool(INPUT, "https://app.test")).rejects.toThrow(/unconfirmed/);

    expect(createUserMock).not.toHaveBeenCalled();
    expect(generateLinkMock).not.toHaveBeenCalled();
    expect(deleteWhereMock).toHaveBeenCalled();
  });

  it("creates the auth user when no page has the email", async () => {
    listUsersMock.mockResolvedValueOnce(usersPage(200)).mockResolvedValueOnce(usersPage(0));
    createUserMock.mockResolvedValue({ data: { user: { id: "new-id" } }, error: null });

    const result = await provisionSchool(INPUT, "https://app.test");

    expect(result.adminAuthUserId).toBe("new-id");
  });

  it("deletes the school row when setting up its event types or admin fails", async () => {
    listUsersMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(provisionSchool(INPUT, "https://app.test")).rejects.toThrow(/listUsers: boom/);

    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the school when only the magic link fails, and says so", async () => {
    listUsersMock.mockResolvedValueOnce(usersPage(1, { index: 0, email: INPUT.adminEmail, id: "a" }));
    generateLinkMock.mockResolvedValue({ data: null, error: { message: "rate limited" } });

    await expect(provisionSchool(INPUT, "https://app.test")).rejects.toThrow(/school was created/);

    expect(deleteWhereMock).not.toHaveBeenCalled();
  });
});
