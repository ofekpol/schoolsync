import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const withSchoolMock = vi.fn();

vi.mock("@/lib/db/client", () => ({
  withSchool: (...args: unknown[]) => withSchoolMock(...args),
}));

// ─── SUT ─────────────────────────────────────────────────────────────────────

import {
  getDefaultEventType,
  getDraftForResume,
  getEditorAllowedGrades,
  getEditorDashboardEvents,
  getEventForEditor,
  isEventTypeAllowed,
  listEventTypes,
} from "@/lib/events/queries";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a Drizzle-like query chain that resolves to `rows` at any terminal
 * call: .where(), .orderBy(), or .limit().  Every intermediate method returns
 * `this` so arbitrary chain lengths work.
 */
function makeSelectChain(rows: unknown[]): Record<string, unknown> {
  const p = Promise.resolve(rows);
  const chain: Record<string, unknown> = {
    // Make the chain directly awaitable
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej),
    catch: (rej: (e: unknown) => unknown) => p.catch(rej),
    // All intermediate methods return the same chain
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    // .limit() returns a plain Promise (common terminal in single-row fetches)
    limit: () => p,
  };
  return chain;
}

/**
 * Creates a tx-like object whose successive select() calls return chains
 * backed by `resultsPerSelect[0]`, `resultsPerSelect[1]`, etc.
 * Falls back to the last entry when calls exceed the array length.
 */
function makeTx(resultsPerSelect: unknown[][] = [[]]) {
  let callIndex = 0;
  return {
    select: () => {
      const rows = resultsPerSelect[callIndex] ?? resultsPerSelect[resultsPerSelect.length - 1] ?? [];
      callIndex++;
      return makeSelectChain(rows);
    },
  };
}

type TxLike = ReturnType<typeof makeTx>;
type TxCallback = (tx: TxLike) => Promise<unknown>;

/** Wires withSchoolMock to invoke each callback with `tx`. */
function useTx(tx: TxLike) {
  withSchoolMock.mockImplementation(async (_: unknown, fn: TxCallback) => fn(tx));
}

// ─── Test constants ───────────────────────────────────────────────────────────

const SCHOOL = "00000000-0000-0000-0000-000000000001";
const USER = "00000000-0000-0000-0000-000000000002";
const OTHER_USER = "00000000-0000-0000-0000-000000000003";
const EVENT_ID = "00000000-0000-0000-0000-000000000004";

beforeEach(() => {
  withSchoolMock.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// getEditorAllowedGrades
// ─────────────────────────────────────────────────────────────────────────────

describe("getEditorAllowedGrades: default and scoped grade sets", () => {
  it("returns all grades 7–12 when the editor has no grade scopes", async () => {
    useTx(makeTx([[]])); // empty scope rows
    expect(await getEditorAllowedGrades(SCHOOL, USER)).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it("returns only the grades from existing scope rows", async () => {
    useTx(makeTx([[{ scopeValue: "9" }, { scopeValue: "11" }]]));
    expect(await getEditorAllowedGrades(SCHOOL, USER)).toEqual([9, 11]);
  });

  it("converts scopeValue strings to numbers", async () => {
    useTx(makeTx([[{ scopeValue: "10" }, { scopeValue: "12" }]]));
    const grades = await getEditorAllowedGrades(SCHOOL, USER);
    expect(grades.every((g) => typeof g === "number")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getEventForEditor
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_EVENT_ROW = {
  id: EVENT_ID,
  title: "Trip",
  description: null,
  location: null,
  startAt: new Date("2026-10-01T07:00:00Z"),
  endAt: new Date("2026-10-01T14:00:00Z"),
  allDay: false,
  status: "draft" as const,
  version: 1,
  eventTypeId: "et-1",
  createdBy: USER,
  updatedAt: new Date(),
};

describe("getEventForEditor: ownership, admin bypass, grades", () => {
  it("returns null when the event does not exist", async () => {
    useTx(makeTx([[]])); // empty first select → event not found
    expect(await getEventForEditor(SCHOOL, EVENT_ID, USER, false)).toBeNull();
  });

  it("returns null when a non-admin caller is not the event owner", async () => {
    const row = { ...MOCK_EVENT_ROW, createdBy: OTHER_USER };
    useTx(makeTx([[row], []]));
    expect(await getEventForEditor(SCHOOL, EVENT_ID, USER, false)).toBeNull();
  });

  it("owner receives EventWithGrades including the grades array", async () => {
    useTx(makeTx([[MOCK_EVENT_ROW], [{ grade: 7 }, { grade: 8 }]]));
    const result = await getEventForEditor(SCHOOL, EVENT_ID, USER, false);
    expect(result).not.toBeNull();
    expect(result?.event.id).toBe(EVENT_ID);
    expect(result?.grades.sort()).toEqual([7, 8]);
  });

  it("admin receives the event even when they are not the owner", async () => {
    const row = { ...MOCK_EVENT_ROW, createdBy: OTHER_USER };
    useTx(makeTx([[row], []]));
    const result = await getEventForEditor(SCHOOL, EVENT_ID, USER, true /* isAdmin */);
    expect(result).not.toBeNull();
    expect(result?.event.id).toBe(EVENT_ID);
  });

  it("returns empty grades array when no grades are assigned", async () => {
    useTx(makeTx([[MOCK_EVENT_ROW], []])); // second select returns no grade rows
    const result = await getEventForEditor(SCHOOL, EVENT_ID, USER, false);
    expect(result?.grades).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDraftForResume
// ─────────────────────────────────────────────────────────────────────────────

describe("getDraftForResume: returns owned draft or null", () => {
  it("returns null when the event is not found", async () => {
    useTx(makeTx([[]]));
    expect(await getDraftForResume(SCHOOL, EVENT_ID, USER)).toBeNull();
  });

  it("returns the row when found", async () => {
    const row = { id: EVENT_ID, title: "Draft trip", status: "draft" };
    useTx(makeTx([[row]]));
    expect(await getDraftForResume(SCHOOL, EVENT_ID, USER)).toEqual(row);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDefaultEventType
// ─────────────────────────────────────────────────────────────────────────────

describe("getDefaultEventType: returns first event type or null", () => {
  it("returns null when the school has no event types", async () => {
    useTx(makeTx([[]]));
    expect(await getDefaultEventType(SCHOOL)).toBeNull();
  });

  it("returns the first event type when one exists", async () => {
    const et = { id: "et-1" };
    useTx(makeTx([[et]]));
    expect(await getDefaultEventType(SCHOOL)).toEqual(et);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getEditorDashboardEvents  /  listEventTypes  (pass-through queries)
// ─────────────────────────────────────────────────────────────────────────────

describe("getEditorDashboardEvents: returns the query result", () => {
  it("returns the events array produced by the DB query", async () => {
    const rows = [
      { id: "e1", title: "A", status: "draft", updatedAt: new Date(), startAt: null, endAt: null, eventTypeId: "et-1" },
      { id: "e2", title: "B", status: "approved", updatedAt: new Date(), startAt: null, endAt: null, eventTypeId: "et-1" },
    ];
    useTx(makeTx([rows]));
    const result = await getEditorDashboardEvents(SCHOOL, USER);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});

describe("listEventTypes: returns ordered event-type palette", () => {
  it("returns the event types in the order the query provides", async () => {
    const types = [
      { id: "et-1", key: "trip", labelHe: "טיול", labelEn: "Trip", colorHex: "#f00", glyph: "T", sortOrder: 0 },
      { id: "et-2", key: "exam", labelHe: "מבחן", labelEn: "Exam", colorHex: "#00f", glyph: "E", sortOrder: 1 },
    ];
    useTx(makeTx([types]));
    const result = await listEventTypes(SCHOOL);
    expect(result).toEqual(types);
  });
});

describe("isEventTypeAllowed", () => {
  it("allows admins for their own school's type without reading scopes", async () => {
    const tx = makeTx([[{ key: "trip" }], [{ scopeValue: "exam" }]]);
    const selectSpy = vi.spyOn(tx, "select");
    useTx(tx);
    const allowed = await isEventTypeAllowed({ id: "a", schoolId: SCHOOL, role: "admin" }, "t");
    expect(allowed).toBe(true);
    expect(withSchoolMock).toHaveBeenCalledWith(SCHOOL, expect.any(Function));
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses another school's type for admins too (RLS hides it)", async () => {
    useTx(makeTx([[]]));
    const allowed = await isEventTypeAllowed({ id: "a", schoolId: SCHOOL, role: "admin" }, "t");
    expect(allowed).toBe(false);
  });

  it("denies users without a school", async () => {
    const allowed = await isEventTypeAllowed({ id: "e", schoolId: null, role: "editor" }, "t");
    expect(allowed).toBe(false);
  });
});
