import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeneratePanel } from "@/components/timetable/generate/GeneratePanel";
import type { Run } from "@/lib/timetable/runs";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [BOARD, RUN] = [uuid(99), uuid(50)];
const profiles = ["teachers", "classes", "balanced"] as const;

const doneRun = (overrides: Partial<Run["solutions"][number]>[] = []): Run => ({
  id: RUN,
  status: "done",
  error: null,
  createdAt: "2026-11-18T08:00:00.000Z",
  finishedAt: "2026-11-18T08:01:00.000Z",
  solutions: profiles.map((profile, i) => ({
    id: uuid(60 + i), profile, status: "ok", error: null, score: 10 + i, violations: [], ...overrides[i],
  })),
});

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn();
const baseProps = { boardId: BOARD, problemCount: 0, runs: [] as Run[], constraints: [], teacherNames: {}, classNames: {}, optionNames: {} };

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GeneratePanel", () => {
  it("disables Generate and links to setup while the board has problems", () => {
    render(<GeneratePanel {...baseProps} problemCount={2} />);
    expect(screen.getByRole("button", { name: "generate" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "fixProblems" })).toHaveAttribute("href", `/timetable/${BOARD}/setup`);
  });

  it("starts a run, polls until done and shows three cards in profile order", async () => {
    fetchMock
      .mockResolvedValueOnce(respond(202, { runId: RUN }))
      .mockResolvedValueOnce(respond(200, { run: { ...doneRun(), status: "running", solutions: [] } }))
      .mockResolvedValueOnce(respond(200, { run: doneRun() }));
    render(<GeneratePanel {...baseProps} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "generate" })); });
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/v1/timetable/boards/${BOARD}/runs`);
    expect(screen.getByText("running")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    const titles = screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"));
    expect(titles).toEqual(["profile.teachers", "profile.classes", "profile.balanced"]);
    expect(screen.getAllByRole("link", { name: "open" })[0]).toHaveAttribute("href", `/timetable/${BOARD}/generate/${RUN}/${uuid(60)}`);
    const calls = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("renders an unplaced violation with its count", () => {
    const violation = { constraintId: null, type: "unplaced", hard: true, count: 4, teacherIds: [], classIds: [] };
    render(<GeneratePanel {...baseProps} runs={[doneRun([{ violations: [violation] }])]} />);
    expect(screen.getByText('violation.unplaced:{"count":4}')).toBeInTheDocument();
  });

  it("shows profileFailed with the error key for a failed profile", () => {
    render(<GeneratePanel {...baseProps} runs={[doneRun([{ status: "failed", error: "timed_out" }])]} />);
    expect(screen.getByText("profileFailed")).toBeInTheDocument();
    expect(screen.getByText("error.timed_out")).toBeInTheDocument();
  });

  it("shows run_in_progress when the server answers 409", async () => {
    fetchMock.mockResolvedValueOnce(respond(409, { error: "run_in_progress" }));
    render(<GeneratePanel {...baseProps} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "generate" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("error.run_in_progress");
  });

  it("stops polling on unmount", async () => {
    fetchMock.mockResolvedValueOnce(respond(202, { runId: RUN })).mockResolvedValue(respond(200, { run: { ...doneRun(), status: "running", solutions: [] } }));
    const { unmount } = render(<GeneratePanel {...baseProps} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "generate" })); });
    unmount();
    const calls = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
