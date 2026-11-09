import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const withSchoolMock = vi.fn();
vi.mock("@/lib/db/client", () => ({
  withSchool: (...args: unknown[]) => withSchoolMock(...args),
}));

// ─── SUT (imported after mocks are registered) ────────────────────────────────

import {
  createDraft,
  deleteOrCancelEvent,
  dismissCanceledEventForStaff,
  replaceEventGrades,
  updateDraft,
} from "@/lib/events/crud";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a minimal Drizzle-like tx mock whose query chains resolve to the
 * supplied row arrays.  Every method ignores its arguments so the same chain
 * works for any table or condition expression.
 *
 * .select().from().where().limit()          → selectRows
 * .update().set().where()                   → awaitable (resolves to updateRows)
 * .update().set().where().returning()       → updateRows
 * .insert().values()                        → awaitable (resolves to insertRows)
 * .insert().values().returning()            → insertRows
 * .delete().where()                         → awaitable (resolves to [])
 */
function makeTx({
  selectRows = [] as unknown[],
  updateRows = [] as unknown[],
  insertRows = [] as unknown[],
} = {}) {
  const selectChain = {
    from: (..._: unknown[]) => selectChain,
    where: (..._: unknown[]) => selectChain,
    limit: (..._: unknown[]) => Promise.resolve(selectRows),
  };

  // Must be both directly awaitable AND have .returning()
  const updateWhereResult = Object.assign(Promise.resolve(updateRows), {
    returning: (..._: unknown[]) => Promise.resolve(updateRows),
  });

  const insertValuesResult = Object.assign(Promise.resolve(insertRows), {
    returning: (..._: unknown[]) => Promise.resolve(insertRows),
  });

  return {
    select: (..._: unknown[]) => selectChain,
    update: (..._: unknown[]) => ({
      set: (..._: unknown[]) => ({
        where: (..._: unknown[]) => updateWhereResult,
      }),
    }),
    insert: (..._: unknown[]) => ({
      values: (..._: unknown[]) => insertValuesResult,
    }),
    delete: (..._: unknown[]) => ({
      where: (..._: unknown[]) => Promise.resolve([]),
    }),
  };
}

type MockTx = ReturnType<typeof makeTx>;
type TxCallback = (tx: MockTx) => Promise<unknown>;

/** Wires withSchoolMock so every call invokes its callback with tx. */
function useTx(tx: MockTx) {
  withSchoolMock.mockImplementation(
    async (_schoolId: unknown, fn: TxCallback) => fn(tx),
  );
}

// ─── Test constants ───────────────────────────────────────────────────────────

const SCHOOL = "00000000-0000-0000-0000-000000000001";
const EVENT = "00000000-0000-0000-0000-000000000002";
const USER = "00000000-0000-0000-0000-000000000003";
const OTHER_USER = "00000000-0000-0000-0000-000000000004";
const EVENT_TYPE = "00000000-0000-0000-0000-000000000005";

beforeEach(() => {
  withSchoolMock.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// createDraft
// ─────────────────────────────────────────────────────────────────────────────

describe("createDraft: creates a draft event row", () => {
  it("returns the id and version=1 from the insert", async () => {
    useTx(makeTx({ insertRows: [{ id: EVENT, version: 1 }] }));
    expect(await createDraft(SCHOOL, USER, EVENT_TYPE)).toEqual({
      id: EVENT,
      version: 1,
    });
  });

  it("sets schoolId from the caller's schoolId argument", async () => {
    useTx(makeTx({ insertRows: [{ id: EVENT, version: 1 }] }));
    await createDraft(SCHOOL, USER, EVENT_TYPE);
    expect(withSchoolMock).toHaveBeenCalledWith(SCHOOL, expect.any(Function));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateDraft
// ─────────────────────────────────────────────────────────────────────────────

describe("updateDraft: ownership, concurrency, and revision logic", () => {
  it("returns not_found when the event row does not exist", async () => {
    useTx(makeTx({ selectRows: [] }));
    const r = await updateDraft(SCHOOL, EVENT, USER, false, { title: "x" }, null);
    expect(r.status).toBe("not_found");
  });

  it("returns not_found when a non-admin editor does not own the event", async () => {
    useTx(
      makeTx({
        selectRows: [{ version: 1, createdBy: OTHER_USER, status: "draft" }],
      }),
    );
    const r = await updateDraft(SCHOOL, EVENT, USER, false, { title: "hack" }, null);
    expect(r.status).toBe("not_found");
  });

  it("allows an admin to edit an event they did not create", async () => {
    useTx(
      makeTx({
        selectRows: [{ version: 1, createdBy: OTHER_USER, status: "draft" }],
        updateRows: [{ version: 2 }],
      }),
    );
    const r = await updateDraft(SCHOOL, EVENT, USER, true, { title: "admin edit" }, null);
    expect(r.status).toBe("ok");
  });

  it("returns conflict when expectedVersion does not match the stored version", async () => {
    useTx(
      makeTx({
        selectRows: [{ version: 3, createdBy: USER, status: "draft" }],
      }),
    );
    const r = await updateDraft(SCHOOL, EVENT, USER, false, { title: "x" }, 1);
    expect(r.status).toBe("conflict");
  });

  it("skips the version check when expectedVersion is null", async () => {
    useTx(
      makeTx({
        selectRows: [{ version: 5, createdBy: USER, status: "draft" }],
        updateRows: [{ version: 6 }],
      }),
    );
    const r = await updateDraft(SCHOOL, EVENT, USER, false, { title: "x" }, null);
    expect(r.status).toBe("ok");
  });

  it("returns ok with the new version on a successful update", async () => {
    useTx(
      makeTx({
        selectRows: [{ version: 1, createdBy: USER, status: "draft" }],
        updateRows: [{ version: 2 }],
      }),
    );
    const r = await updateDraft(SCHOOL, EVENT, USER, false, { title: "new title" }, 1);
    expect(r).toEqual({ status: "ok", version: 2 });
  });

  it("inserts an 'edited' revision when updating an already-approved event", async () => {
    const insertValuesSpy = vi.fn().mockReturnValue(
      Object.assign(Promise.resolve([]), {
        returning: () => Promise.resolve([]),
      }),
    );

    const approvedRow = {
      version: 1,
      createdBy: USER,
      status: "approved",
      title: "old title",
      description: null,
      location: null,
      startAt: new Date(),
      endAt: new Date(),
      allDay: false,
      eventTypeId: EVENT_TYPE,
    };

    withSchoolMock.mockImplementation(
      async (_: unknown, fn: TxCallback) =>
        fn(
          // Cast: only the select/update/insert paths are exercised here
          {
            select: () => ({
              from: () => ({
                where: () => ({ limit: () => Promise.resolve([approvedRow]) }),
              }),
            }),
            update: () => ({
              set: () => ({
                where: () =>
                  Object.assign(Promise.resolve([{ version: 2 }]), {
                    returning: () => Promise.resolve([{ version: 2 }]),
                  }),
              }),
            }),
            insert: () => ({ values: insertValuesSpy }),
          } as unknown as MockTx,
        ),
    );

    await updateDraft(SCHOOL, EVENT, USER, false, { title: "updated" }, null);

    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: EVENT,
        decision: "edited",
        submittedBy: USER,
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteOrCancelEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("deleteOrCancelEvent: draft delete vs published cancel", () => {
  it("soft-deletes draft events", async () => {
    useTx(
      makeTx({
        selectRows: [{ id: EVENT, createdBy: USER, status: "draft" }],
      }),
    );
    expect(await deleteOrCancelEvent(SCHOOL, EVENT, USER, false)).toEqual({ status: "deleted" });
  });

  it("marks approved events as canceled and writes a revision", async () => {
    const valuesSpy = vi.fn().mockReturnValue(
      Object.assign(Promise.resolve([]), {
        returning: () => Promise.resolve([]),
      }),
    );

    withSchoolMock.mockImplementation(
      async (_: unknown, fn: TxCallback) =>
        fn({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () =>
                  Promise.resolve([
                    {
                      id: EVENT,
                      createdBy: USER,
                      status: "approved",
                      version: 2,
                    },
                  ]),
              }),
            }),
          }),
          update: () => ({
            set: () => ({
              where: () => Promise.resolve([]),
            }),
          }),
          insert: () => ({ values: valuesSpy }),
        } as unknown as MockTx),
    );

    expect(await deleteOrCancelEvent(SCHOOL, EVENT, USER, false)).toEqual({ status: "canceled" });
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: EVENT,
        decision: "canceled",
        submittedBy: USER,
        decidedBy: USER,
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// dismissCanceledEventForStaff
// ─────────────────────────────────────────────────────────────────────────────

describe("dismissCanceledEventForStaff: personal canceled-event hiding", () => {
  it("returns not_found when the event is not canceled", async () => {
    useTx(
      makeTx({
        selectRows: [{ id: EVENT, status: "approved" }],
      }),
    );

    expect(await dismissCanceledEventForStaff(SCHOOL, EVENT, USER)).toEqual({
      status: "not_found",
    });
  });

  it("records a dismissal for a canceled event without changing the event row", async () => {
    const updateSpy = vi.fn();
    const valuesSpy = vi.fn().mockReturnValue({
      onConflictDoNothing: () => Promise.resolve([]),
    });

    withSchoolMock.mockImplementation(
      async (_: unknown, fn: TxCallback) =>
        fn({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([{ id: EVENT, status: "canceled" }]),
              }),
            }),
          }),
          update: updateSpy,
          insert: () => ({
            values: valuesSpy,
          }),
        } as unknown as MockTx),
    );

    expect(await dismissCanceledEventForStaff(SCHOOL, EVENT, USER)).toEqual({
      status: "dismissed",
    });
    expect(updateSpy).not.toHaveBeenCalled();
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: EVENT,
        schoolId: SCHOOL,
        staffUserId: USER,
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// replaceEventGrades
// ─────────────────────────────────────────────────────────────────────────────

describe("replaceEventGrades: atomic grade replacement", () => {
  it("does not call insert when grades array is empty", async () => {
    const insertSpy = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    });
    withSchoolMock.mockImplementation(
      async (_: unknown, fn: TxCallback) =>
        fn({
          delete: () => ({ where: () => Promise.resolve([]) }),
          insert: insertSpy,
        } as unknown as MockTx),
    );

    await replaceEventGrades(SCHOOL, EVENT, []);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("inserts one row per grade with the correct shape", async () => {
    const valuesSpy = vi.fn().mockResolvedValue([]);
    withSchoolMock.mockImplementation(
      async (_: unknown, fn: TxCallback) =>
        fn({
          delete: () => ({ where: () => Promise.resolve([]) }),
          insert: () => ({ values: valuesSpy }),
        } as unknown as MockTx),
    );

    await replaceEventGrades(SCHOOL, EVENT, [7, 8, 9]);
    expect(valuesSpy).toHaveBeenCalledWith([
      { eventId: EVENT, grade: 7, schoolId: SCHOOL },
      { eventId: EVENT, grade: 8, schoolId: SCHOOL },
      { eventId: EVENT, grade: 9, schoolId: SCHOOL },
    ]);
  });
});
