import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonsTab } from "@/components/timetable/setup/LessonsTab";
import { PlataEditor } from "@/components/timetable/setup/PlataEditor";
import { AddFromStaffDialog } from "@/components/timetable/setup/AddFromStaffDialog";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string, values?: Record<string, unknown>) =>
    ns === "grades" ? "ז" : values ? `${key}:${JSON.stringify(values)}` : key,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [C1, C2, C3, MATH, ENG, T1, BOARD] = [1, 2, 3, 10, 11, 20, 99].map(uuid);
const classes = [C1, C2, C3].map((id, i) => ({ id, grade: 7, number: i + 1, name: null, kind: null }));
const subjects = [{ id: MATH, name: "מתמטיקה", groupGrades: [] }, { id: ENG, name: "אנגלית", groupGrades: [] }];
const teachers = [{ id: T1, fullName: "דנה", staffUserId: null, freeDayEntitled: false }];
const plata = { id: uuid(30), subjectId: ENG, weeklyPeriods: 30, classIds: [C1, C2], teacherIds: [], groupNames: {} };

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ block: {} }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

describe("LessonsTab", () => {
  const renderTab = () =>
    render(<LessonsTab boardId={BOARD} classes={classes} subjects={subjects} blocks={[plata]} teachers={teachers} slots={20} />);

  it("shows Plata cells read-only and flags a class over the week", () => {
    renderTab();
    expect(screen.getAllByText("lessons.inPlata")).toHaveLength(2);
    const over = screen.getAllByText(/lessons.totalOf/).filter((cell) => cell.className.includes("text-red-700"));
    expect(over).toHaveLength(2);
  });

  it("creates the class's lesson on Enter with the chosen teacher", async () => {
    renderTab();
    const periods = screen.getByLabelText(`lessons.cellLabel:{"subject":"מתמטיקה","class":"ז1"} · lessons.periods`);
    fireEvent.change(periods, { target: { value: "5" } });
    const teacher = screen.getAllByPlaceholderText("lessons.noTeacher")[0];
    fireEvent.change(teacher, { target: { value: "דנה" } });
    fireEvent.keyDown(teacher, { key: "Enter" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/v1/timetable/boards/${BOARD}/blocks`);
    expect(JSON.parse(init.body)).toEqual({ subjectId: MATH, weeklyPeriods: 5, classIds: [C1], teacherIds: [T1] });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("applies a subject's periods to every class of the grade in one call", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ updated: 0, created: 3 }), { status: 200 }));
    renderTab();
    fireEvent.change(screen.getByLabelText(`normLabel:{"subject":"מתמטיקה"}`), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: `applyNorm:{"subject":"מתמטיקה"}` }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/v1/timetable/boards/${BOARD}/grade-periods`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ grade: 7, subjectId: MATH, weeklyPeriods: 3 });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("marks only the class that differs from the grade's standard", () => {
    renderTab();
    // English: ז1 and ז2 in a 30-period Plata, ז3 empty: the standard is 30, ז3 differs.
    expect(screen.getAllByText(`differs:{"norm":30}`)).toHaveLength(1);
    expect(screen.queryAllByText(/differs:\{"norm":0\}/)).toHaveLength(0);
  });

  it("takes a class out of its Plata", async () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /lessons.detach:.*אנגלית.*ז1/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/v1/timetable/boards/${BOARD}/blocks/${plata.id}/detach`);
    expect(JSON.parse(init.body)).toEqual({ classId: C1 });
  });

  it("changes a Plata's periods from any of its cells", async () => {
    renderTab();
    const cell = screen.getByLabelText(`lessons.cellLabel:{"subject":"אנגלית","class":"ז2"} · lessons.plataPeriods`);
    fireEvent.change(cell, { target: { value: "4" } });
    fireEvent.keyDown(cell, { key: "Enter" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/v1/timetable/boards/${BOARD}/blocks/${plata.id}`);
    expect(JSON.parse(init.body)).toEqual({ subjectId: ENG, weeklyPeriods: 4, classIds: [C1, C2], teacherIds: [], groupNames: {} });
  });

  it("refuses a teacher name that is not on the board", async () => {
    renderTab();
    const teacher = screen.getAllByPlaceholderText("lessons.noTeacher")[0];
    fireEvent.change(teacher, { target: { value: "מישהו" } });
    fireEvent.keyDown(teacher, { key: "Enter" });
    expect(await screen.findByRole("alert")).toHaveTextContent("lessons.unknownTeacher");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("PlataEditor", () => {
  const grouped = subjects.map((s) => ({ ...s, groupGrades: [7] }));
  const none = () => [];

  it("asks for two classes before saving", () => {
    const onSave = vi.fn();
    render(<PlataEditor block={null} classes={classes} subjects={grouped} teachers={teachers} teachersFor={none} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("ז1"));
    fireEvent.click(screen.getByRole("button", { name: "plata.save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("plata.needTwoClasses");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the server's mixed_grades answer in words", async () => {
    const onSave = vi.fn().mockResolvedValue("mixedGrades");
    render(<PlataEditor block={null} classes={classes} subjects={grouped} teachers={teachers} teachersFor={none} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("ז1"));
    fireEvent.click(screen.getByLabelText("ז2"));
    fireEvent.click(screen.getByRole("button", { name: "plata.save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("errors.mixedGrades");
    expect(onSave).toHaveBeenCalledWith({ subjectId: MATH, weeklyPeriods: 1, classIds: [C1, C2], teacherIds: [], groupNames: {} });
  });

  it("offers only subjects taught in groups in the grade", () => {
    const onlyEnglish = [{ ...subjects[0], groupGrades: [] }, { ...subjects[1], groupGrades: [7] }];
    render(<PlataEditor block={null} classes={classes} subjects={onlyEnglish} teachers={teachers} teachersFor={none} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["ז", "אנגלית"]);
  });

  it("checks the subject's teachers and saves their group names", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    const teachersFor = (name: string) => (name === "מתמטיקה" ? [T1] : []);
    render(<PlataEditor block={null} classes={classes} subjects={grouped} teachers={teachers} teachersFor={teachersFor} onSave={onSave} onCancel={vi.fn()} />);
    expect(screen.getByText("plata.autoPicked")).toBeInTheDocument();
    const [name] = screen.getAllByPlaceholderText("plata.groupPlaceholder");
    fireEvent.change(name, { target: { value: " רמה 1 " } });
    fireEvent.click(screen.getByLabelText("ז1"));
    fireEvent.click(screen.getByLabelText("ז2"));
    fireEvent.click(screen.getByRole("button", { name: "plata.save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      subjectId: MATH, weeklyPeriods: 1, classIds: [C1, C2], teacherIds: [T1], groupNames: { [T1]: "רמה 1" },
    }));
  });
});

describe("AddFromStaffDialog", () => {
  const staff = [
    { id: uuid(40), fullName: "אבי", email: "a@s.test" },
    { id: uuid(41), fullName: "בתיה", email: "b@s.test" },
  ];
  const categories = [{ id: "c", name: "מקצוע", multiSelect: true, required: false, sortOrder: 1,
    options: [{ id: "opt-math", label: "מתמטיקה", sortOrder: 0 }] }];

  it("filters by label and adds everyone shown", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddFromStaffDialog staff={staff} categories={categories} labels={{ [uuid(41)]: ["opt-math"] }} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    fireEvent.change(screen.getByLabelText("filter"), { target: { value: "opt-math" } });
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(screen.getByLabelText(/selectShown/));
    fireEvent.click(screen.getByRole("button", { name: /^add/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([uuid(41)]));
  });
});
