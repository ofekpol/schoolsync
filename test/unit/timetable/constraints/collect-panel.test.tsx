import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectPanel } from "@/components/timetable/constraints/CollectPanel";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [BOARD, T1, T2, T3] = [1, 2, 3, 4].map(uuid);
const teachers = [
  { id: T1, fullName: "דנה", freeDayEntitled: true },
  { id: T2, fullName: "יוסי", freeDayEntitled: true },
  { id: T3, fullName: "רות", freeDayEntitled: true },
];
const responses = [
  { teacherId: T1, answeredAt: "2026-11-15T08:00:00.000Z", byManagement: true, freeDay: 5 },
  { teacherId: T2, answeredAt: "2026-11-15T09:00:00.000Z", byManagement: false, freeDay: null },
  { teacherId: T3, answeredAt: null, byManagement: false, freeDay: null },
];
const fetchMock = vi.fn();

function renderPanel() {
  render(<CollectPanel boardId={BOARD} state={{ status: "collecting", teacherDeadline: "2026-12-01T10:00:00.000Z" }}
    responses={responses} teachers={teachers} days={[0, 1, 2, 3, 4, 5]} />);
}

describe("CollectPanel", () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("counts who answered and filters to the ones who did not", () => {
    renderPanel();
    expect(screen.getByText(`count:${JSON.stringify({ answered: 2, total: 3 })}`)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("filter"), { target: { value: "missing" } });
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(2); // header + one teacher
    expect(within(rows[1]).getByText("רות")).toBeTruthy();
  });

  it("fills in a free day for a teacher and refreshes", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: `fillInFor:${JSON.stringify({ name: "רות" })}` }));
    fireEvent.change(screen.getByLabelText("day"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/v1/timetable/boards/${BOARD}/collect/${T3}`);
    expect(JSON.parse(init.body)).toEqual({ freeDay: 5 });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("does not send a deadline in the past", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("deadlineDate"), { target: { value: "2020-01-01" } });
    fireEvent.change(screen.getByLabelText("deadlineTime"), { target: { value: "08:00" } });
    fireEvent.click(screen.getByRole("button", { name: "update" }));
    expect(screen.getByRole("alert")).toHaveTextContent("errors.deadlinePast");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
