import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlataEditor } from "@/components/timetable/setup/PlataEditor";
import { PlataTab } from "@/components/timetable/setup/PlataTab";
import { TeachersTab } from "@/components/timetable/setup/TeachersTab";
import { ConstraintForm } from "@/components/timetable/constraints/ConstraintForm";
import { DEFAULT_WEEK } from "@/lib/timetable/week";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string, values?: Record<string, unknown>) =>
    ns === "grades" ? "ז" : values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const classes = [1, 2].map((n) => ({ id: uuid(n), grade: 7, number: n }));
const subjects = [{ id: uuid(10), name: "אנגלית" }];
const manyTeachers = Array.from({ length: 16 }, (_, i) => ({ id: uuid(100 + i), fullName: `מורה ${i}`, staffUserId: null, freeDayEntitled: true }));
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ teacher: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlataEditor", () => {
  it("stops at the most teachers a Plata may have", () => {
    const onSave = vi.fn();
    render(<PlataEditor block={null} classes={classes} subjects={subjects} teachers={manyTeachers} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("ז1"));
    fireEvent.click(screen.getByLabelText("ז2"));
    for (const t of manyTeachers) fireEvent.click(screen.getByLabelText(t.fullName));
    fireEvent.click(screen.getByRole("button", { name: "plata.save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("plata.tooManyTeachers");
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("PlataTab", () => {
  it("asks before deleting a Plata", async () => {
    const block = { id: uuid(50), subjectId: uuid(10), weeklyPeriods: 3, classIds: [uuid(1), uuid(2)], teacherIds: [] };
    render(<PlataTab boardId={uuid(99)} classes={classes} subjects={subjects} blocks={[block]} teachers={[]} />);
    fireEvent.click(screen.getByRole("button", { name: `deleteNamed:${JSON.stringify({ name: "אנגלית" })}` }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "delete" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/timetable/boards/${uuid(99)}/blocks/${uuid(50)}`, expect.objectContaining({ method: "DELETE" })));
  });
});

describe("TeachersTab", () => {
  it("flips the free-day checkbox at once", () => {
    render(<TeachersTab boardId={uuid(99)} teachers={[manyTeachers[0]]} staff={[]} categories={[]} labels={{}} />);
    const box = screen.getByLabelText(`teachers.freeDayFor:${JSON.stringify({ name: "מורה 0" })}`) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(box.checked).toBe(false);
  });
});

describe("ConstraintForm", () => {
  it("groups the hard and soft radios", () => {
    render(<ConstraintForm type="class_no_gaps" initial={null} teachers={[]} categories={[]} labels={{}} week={DEFAULT_WEEK}
      onSave={vi.fn()} onCancel={vi.fn()} />);
    const [hard, soft] = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(hard.name).not.toBe("");
    expect(hard.name).toBe(soft.name);
  });
});
