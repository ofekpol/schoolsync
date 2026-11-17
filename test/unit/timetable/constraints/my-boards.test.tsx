import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyBoards } from "@/components/timetable/constraints/MyBoards";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const board = {
  boardId: uuid(1), boardName: "תשפ״ח", teacherId: uuid(2), deadline: "2026-12-01T10:00:00.000Z", open: true,
  freeDayEntitled: true, freeDay: null, answeredAt: null, byManagement: false, days: [0, 1, 2, 3, 4, 5],
};
const fetchMock = vi.fn();

describe("MyBoards", () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("says so when there is nothing to answer", () => {
    render(<MyBoards boards={[]} />);
    expect(screen.getByText("empty")).toBeTruthy();
  });

  it("saves the teacher's free day for the board", async () => {
    render(<MyBoards boards={[board]} />);
    fireEvent.change(screen.getByLabelText("freeDay"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/v1/timetable/me/${uuid(1)}`);
    expect(JSON.parse(init.body)).toEqual({ freeDay: 5 });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("is read-only after the deadline and for a teacher who is not entitled", () => {
    render(<MyBoards boards={[{ ...board, open: false, freeDay: 0, answeredAt: "2026-11-20T08:00:00.000Z" }]} />);
    expect(screen.getByText("closed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "save" })).toBeNull();
    cleanup();
    render(<MyBoards boards={[{ ...board, freeDayEntitled: false }]} />);
    expect((screen.getByLabelText("freeDay") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText("notEntitled")).toBeTruthy();
  });
});
