import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeneratePanel } from "@/components/timetable/generate/GeneratePanel";
import type { Run } from "@/lib/timetable/runs";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/timetable/b/generate/r/s",
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
    id: uuid(60 + i), profile, status: "ok", error: null, score: 10 + i, violations: [], reportStale: false, ...overrides[i],
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

  it("shows the cards and the specific error when every profile failed", () => {
    const run = { ...doneRun(profiles.map(() => ({ status: "failed" as const, error: "solver_http_error" }))), status: "failed" as const, error: "all_profiles_failed" };
    render(<GeneratePanel {...baseProps} runs={[run]} />);
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getAllByText("error.solver_http_error")).toHaveLength(3);
    expect(screen.getByRole("alert")).toHaveTextContent("error.all_profiles_failed");
  });

  it("stops polling and shows timed_out when the run is stale and fetches keep failing", async () => {
    vi.setSystemTime(new Date("2026-11-18T08:00:00.000Z"));
    fetchMock.mockResolvedValue(respond(500, {}));
    const queued = { ...doneRun(), status: "running" as const, solutions: [] };
    render(<GeneratePanel {...baseProps} runs={[queued]} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(7 * 60_000); });
    expect(screen.getByRole("alert")).toHaveTextContent("error.timed_out");
    const calls = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(fetchMock.mock.calls.length).toBe(calls);
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

describe("TimetableGrid", () => {
  const week = { days: [0, 1].map((day) => ({ day, periods: [1, 2].map((period) => ({ period, start: `0${7 + period}:00`, end: `0${8 + period}:00` })) })) };
  const lesson = (day: number, period: number, o: Partial<{ subjectId: string | null; classIds: string[]; teacherIds: string[] }> = {}) =>
    ({ day, period, blockId: `b${day}${period}`, subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], ...o });
  const grid = {
    solution: { id: "s", profile: "balanced", status: "ok", error: null, score: 1, violations: [] },
    week,
    lessons: [
      lesson(0, 1),
      lesson(1, 2, { subjectId: null, classIds: [], teacherIds: ["t1"] }),
      lesson(0, 2, { subjectId: "gone", teacherIds: ["gone"] }),
      lesson(0, 2, { classIds: ["c1"], teacherIds: ["t2"] }),
    ],
    names: { classes: { c1: { grade: 7, number: 1 } }, teachers: { t1: "Dana", t2: "Eli" }, subjects: { s1: "Math" } },
  } as unknown as import("@/lib/timetable/grid").SolutionGrid;

  it("shows a class's lessons in their day and period cells, with clash and removed names", async () => {
    const { TimetableGrid } = await import("@/components/timetable/generate/TimetableGrid");
    render(<TimetableGrid boardId="b" grid={grid} view={{ kind: "class", id: "c1" }} />);
    const cell = (day: number, period: number) => screen.getByTestId(`cell-${day}-${period}`);
    expect(cell(0, 1)).toHaveTextContent("Math");
    expect(cell(0, 1)).toHaveTextContent("Dana");
    expect(cell(0, 2)).toHaveTextContent("clash");
    expect(cell(0, 2)).toHaveTextContent("removedSubject");
    expect(cell(0, 2)).toHaveTextContent("removedTeacher");
    expect(cell(1, 1)).toBeEmptyDOMElement();
    expect(screen.getByRole("link", { name: "backToOptions" })).toHaveAttribute("href", "/timetable/b/generate");
  });

  it("shows a teacher's week including a meeting, and replaces the URL on switch", async () => {
    const { TimetableGrid } = await import("@/components/timetable/generate/TimetableGrid");
    render(<TimetableGrid boardId="b" grid={grid} view={{ kind: "teacher", id: "t1" }} />);
    expect(screen.getByTestId("cell-1-2")).toHaveTextContent("meeting");
    expect(screen.getByTestId("cell-0-1")).toHaveTextContent("label_71");
    fireEvent.click(screen.getByRole("button", { name: "viewClass" }));
    expect(replace).toHaveBeenCalledWith("/timetable/b/generate/r/s?view=class&id=c1");
  });

  it("marks periods a short day does not have, even when a lesson sits there, and names removed classes", async () => {
    const { TimetableGrid } = await import("@/components/timetable/generate/TimetableGrid");
    const short = {
      ...grid,
      week: { days: [week.days[0], { day: 1, periods: [week.days[1].periods[0]] }] },
      lessons: [...grid.lessons, lesson(1, 2, { classIds: ["c1", "gone"], teacherIds: ["t1"] })],
    } as unknown as import("@/lib/timetable/grid").SolutionGrid;
    render(<TimetableGrid boardId="b" grid={short} view={{ kind: "teacher", id: "t1" }} />);
    expect(screen.getByTestId("cell-1-2")).toHaveTextContent("noPeriod");
    expect(screen.getByTestId("cell-0-2")).not.toHaveTextContent("noPeriod");
    expect(screen.getByTestId("cell-1-2")).toHaveTextContent("removedClass");
  });
});
