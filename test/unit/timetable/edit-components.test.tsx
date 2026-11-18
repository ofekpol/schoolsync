import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrintSheets } from "@/components/timetable/edit/PrintSheets";
import { TimetableGrid } from "@/components/timetable/generate/TimetableGrid";
import { OptionCard } from "@/components/timetable/generate/OptionCard";
import type { SolutionGrid } from "@/lib/timetable/grid";
import type { SolutionSummary } from "@/lib/timetable/runs";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

const { replace, refresh, push } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push }),
  usePathname: () => "/timetable/b/generate/r/s",
}));

const api = vi.hoisted(() => ({ editPlacement: vi.fn(), evaluate: vi.fn(), publish: vi.fn(), regenerate: vi.fn() }));
vi.mock("@/components/timetable/edit/api", () => api);

const [BOARD, RUN, SOL] = ["b", "r", "s"];
const week = { days: [0, 1].map((day) => ({ day, periods: [1, 2].map((period) => ({ period, start: `0${7 + period}:00`, end: `0${8 + period}:00` })) })) };
const summary: SolutionSummary = { id: SOL, profile: "balanced", status: "ok", error: null, score: 1, violations: [], reportStale: false };
const makeGrid = (overrides: Partial<SolutionGrid> = {}): SolutionGrid => ({
  solution: { ...summary },
  week,
  lessons: [
    { blockId: "b1", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], day: 0, period: 1, pinned: false },
    { blockId: "b2", subjectId: "s2", classIds: ["c2"], teacherIds: ["t1"], day: 1, period: 1, pinned: false },
  ],
  unplaced: [{ blockId: "b3", subjectId: "s3", classIds: ["c1"], teacherIds: ["t2"], missing: 2 }],
  published: false,
  names: {
    classes: { c1: { grade: 7, number: 1 }, c2: { grade: 7, number: 2 } },
    teachers: { t1: "Dana", t2: "Eli" },
    subjects: { s1: "Math", s2: "Art", s3: "Bible" },
  },
  ...overrides,
});
const cardNames = { constraints: [], teacherNames: { t1: "Dana", t2: "Eli" }, classNames: {}, optionNames: {} };
const renderEditor = (grid = makeGrid()) =>
  render(<TimetableGrid boardId={BOARD} runId={RUN} grid={grid} view={{ kind: "class", id: "c1" }} editable cardNames={cardNames} />);
const cell = (day: number, period: number) => within(screen.getByTestId(`cell-${day}-${period}`));

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  [replace, refresh, push].forEach((fn) => fn.mockReset());
  api.editPlacement.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LessonEditor", () => {
  it("moves a selected lesson to a free cell at once", async () => {
    renderEditor();
    fireEvent.click(cell(0, 1).getByRole("button", { name: /Math/ }));
    expect(cell(0, 1).getByRole("button", { name: /Math/ })).toHaveAttribute("aria-pressed", "true");
    await act(async () => { fireEvent.click(cell(0, 2).getByRole("button", { name: "target.free" })); });
    expect(api.editPlacement).toHaveBeenCalledWith(BOARD, RUN, SOL,
      { action: "move", blockId: "b1", from: { day: 0, period: 1 }, to: { day: 0, period: 2 } });
    expect(screen.getByTestId("cell-0-2")).toHaveTextContent("Math");
    expect(screen.getByTestId("cell-0-1")).not.toHaveTextContent("Math");
    expect(screen.queryAllByRole("button", { name: "target.free" })).toHaveLength(0);
  });

  it("names the busy teacher on a target, and Escape cancels the selection", () => {
    renderEditor();
    fireEvent.click(cell(0, 1).getByRole("button", { name: /Math/ }));
    expect(cell(1, 1).getByRole("button", { name: 'target.clash:{"names":"Dana"}' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryAllByRole("button", { name: /target\./ })).toHaveLength(0);
  });

  it("rolls a rejected move back and shows the error", async () => {
    api.editPlacement.mockResolvedValue({ ok: false, error: "slot_taken" });
    renderEditor();
    fireEvent.click(cell(0, 1).getByRole("button", { name: /Math/ }));
    await act(async () => { fireEvent.click(cell(0, 2).getByRole("button", { name: "target.free" })); });
    expect(screen.getByTestId("cell-0-1")).toHaveTextContent("Math");
    expect(screen.getByTestId("cell-0-2")).not.toHaveTextContent("Math");
    expect(screen.getByRole("alert")).toHaveTextContent("error.slot_taken");
  });

  it("refreshes the grid when another tab moved the lesson", async () => {
    api.editPlacement.mockResolvedValue({ ok: false, error: "moved_elsewhere" });
    renderEditor();
    fireEvent.click(cell(0, 1).getByRole("button", { name: /Math/ }));
    await act(async () => { fireEvent.click(cell(0, 2).getByRole("button", { name: "target.free" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("error.moved_elsewhere");
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the moved_elsewhere message when the refreshed grid remounts the editor", async () => {
    api.editPlacement.mockResolvedValue({ ok: false, error: "moved_elsewhere" });
    const { rerender } = renderEditor();
    fireEvent.click(cell(0, 1).getByRole("button", { name: /Math/ }));
    await act(async () => { fireEvent.click(cell(0, 2).getByRole("button", { name: "target.free" })); });
    const fresh = makeGrid();
    const refreshed = { ...fresh, lessons: fresh.lessons.map((l) => (l.blockId === "b1" ? { ...l, period: 2 } : l)) };
    rerender(<TimetableGrid boardId={BOARD} runId={RUN} grid={refreshed} view={{ kind: "class", id: "c1" }} editable cardNames={cardNames} />);
    expect(screen.getByTestId("cell-0-2")).toHaveTextContent("Math");
    expect(screen.getByRole("alert")).toHaveTextContent("error.moved_elsewhere");
  });

  it("disables edit controls while a request is pending", async () => {
    let finish: (value: { ok: true }) => void = () => {};
    api.editPlacement.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderEditor();
    fireEvent.click(cell(0, 1).getByRole("button", { name: "pin" }));
    expect(cell(0, 1).getByRole("button", { name: /Math/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Bible/ })).toBeDisabled();
    expect(screen.getByRole("table").closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
    await act(async () => { finish({ ok: true }); });
    expect(cell(0, 1).getByRole("button", { name: /Math/ })).toBeEnabled();
  });

  it("offers no target in a cell that already holds the selected block", () => {
    const grid = makeGrid();
    renderEditor({ ...grid, lessons: [...grid.lessons, { ...grid.lessons[0], period: 2 }] });
    fireEvent.click(cell(0, 1).getByRole("button", { name: /Math/ }));
    expect(cell(0, 2).queryAllByRole("button", { name: /target\./ })).toHaveLength(0);
  });

  it("places a tray lesson with from: null and lowers its missing count", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Bible/ }));
    expect(screen.getByRole("button", { name: /Bible/ })).toHaveTextContent('missing:{"count":2}');
    await act(async () => { fireEvent.click(cell(1, 2).getByRole("button", { name: "target.free" })); });
    expect(api.editPlacement).toHaveBeenCalledWith(BOARD, RUN, SOL,
      { action: "move", blockId: "b3", from: null, to: { day: 1, period: 2 } });
    expect(screen.getByTestId("cell-1-2")).toHaveTextContent("Bible");
    expect(screen.getByRole("region", { name: "tray" })).toHaveTextContent('missing:{"count":1}');
  });

  it("sends a placed lesson back to the tray", async () => {
    renderEditor();
    await act(async () => { fireEvent.click(cell(0, 1).getByRole("button", { name: "toTray" })); });
    expect(api.editPlacement).toHaveBeenCalledWith(BOARD, RUN, SOL,
      { action: "move", blockId: "b1", from: { day: 0, period: 1 }, to: null });
    expect(screen.getByTestId("cell-0-1")).not.toHaveTextContent("Math");
    expect(screen.getByRole("region", { name: "tray" })).toHaveTextContent("Math");
  });

  it("pins a lesson", async () => {
    renderEditor();
    await act(async () => { fireEvent.click(cell(0, 1).getByRole("button", { name: "pin" })); });
    expect(api.editPlacement).toHaveBeenCalledWith(BOARD, RUN, SOL, { action: "pin", blockId: "b1", day: 0, period: 1, pinned: true });
    expect(screen.getByTestId("cell-0-1")).toHaveTextContent("pinned");
    expect(cell(0, 1).getByRole("button", { name: "unpin" })).toBeInTheDocument();
  });

  it("does not offer cells outside the week as targets", () => {
    const short = { days: [week.days[0], { day: 1, periods: [week.days[1].periods[0]] }] };
    renderEditor(makeGrid({ week: short }));
    fireEvent.click(cell(0, 1).getByRole("button", { name: /Math/ }));
    expect(cell(1, 2).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("EditToolbar", () => {
  it("checks a stale report and shows evaluate_unsupported", async () => {
    api.evaluate.mockResolvedValue({ ok: false, error: "evaluate_unsupported" });
    renderEditor(makeGrid({ solution: { ...summary, reportStale: true } }));
    expect(screen.getByText("reportStale")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "check" })); });
    expect(api.evaluate).toHaveBeenCalledWith(BOARD, RUN, SOL);
    expect(screen.getByRole("alert")).toHaveTextContent("error.evaluate_unsupported");
  });

  it("shows the new report after a check", async () => {
    const violation = { constraintId: null, type: "teacher_clash", hard: true, count: 2, teacherIds: [], classIds: [] };
    api.evaluate.mockResolvedValue({ ok: true, solution: { ...summary, violations: [violation] } });
    renderEditor(makeGrid({ solution: { ...summary, reportStale: true } }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "check" })); });
    expect(screen.getByText('violation.teacher_clash:{"count":2}')).toBeInTheDocument();
    expect(screen.getByText("reportFresh")).toBeInTheDocument();
  });

  it("publishes after confirm and shows the banner", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    api.publish.mockResolvedValue({ ok: true });
    renderEditor();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "publish" })); });
    expect(api.publish).toHaveBeenCalledWith(BOARD, RUN, SOL);
    expect(screen.getByText("publishedBanner")).toBeInTheDocument();
  });

  it("regenerates and goes to the generate page", async () => {
    api.regenerate.mockResolvedValue({ ok: true, runId: "new" });
    renderEditor();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "regenerate" })); });
    expect(api.regenerate).toHaveBeenCalledWith(BOARD, SOL);
    expect(push).toHaveBeenCalledWith(`/timetable/${BOARD}/generate`);
  });
});

describe("read-only grid and option card", () => {
  it("renders no buttons in cells when not editable", () => {
    render(<TimetableGrid boardId={BOARD} runId={RUN} grid={makeGrid()} view={{ kind: "class", id: "c1" }} editable={false} cardNames={cardNames} />);
    expect(screen.getByTestId("cell-0-1")).toHaveTextContent("Math");
    for (const td of screen.getAllByTestId(/^cell-/)) expect(within(td).queryAllByRole("button")).toHaveLength(0);
  });

  it("shows the pin_moved count, the published badge and a stale report", () => {
    const violation = { constraintId: null, type: "pin_moved", hard: true, count: 3, teacherIds: [], classIds: [] };
    render(<OptionCard boardId={BOARD} runId={RUN} publishedSolutionId={SOL} solution={{ ...summary, reportStale: true, violations: [violation] }} {...cardNames} />);
    expect(screen.getByText('violation.pin_moved:{"count":3}')).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.getByText("reportStale")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "open" })).toHaveAttribute("href", `/timetable/${BOARD}/generate/${RUN}/${SOL}`);
  });
});

describe("PrintSheets", () => {
  it("renders one table per class in grade/number order with its heading", () => {
    const grid = makeGrid({ names: { ...makeGrid().names, classes: { c2: { grade: 7, number: 2 }, c1: { grade: 7, number: 1 } } } });
    const { container } = render(<PrintSheets grid={grid} kind="class" />);
    expect(container.querySelectorAll("table")).toHaveLength(2);
    expect(container.querySelectorAll("section.print-timetable")).toHaveLength(2);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
    expect(headings[0]).toContain("1");
    expect(headings[1]).toContain("2");
  });

  it("shows clash and pin markers as text", () => {
    const grid = makeGrid({
      lessons: [
        { blockId: "b1", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], day: 0, period: 1, pinned: true },
        { blockId: "b2", subjectId: "s2", classIds: ["c1"], teacherIds: ["t2"], day: 0, period: 1, pinned: false },
      ],
    });
    render(<PrintSheets grid={grid} kind="class" />);
    const first = within(screen.getAllByTestId("cell-0-1")[0]);
    expect(first.getByText("clash")).toBeInTheDocument();
    expect(first.getByText("pinned")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
