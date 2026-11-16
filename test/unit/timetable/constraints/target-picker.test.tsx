import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TargetPicker } from "@/components/timetable/constraints/TargetPicker";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
}));

const teachers = [
  { id: "t1", fullName: "דנה", staffUserId: "s1" },
  { id: "t2", fullName: "יוסי", staffUserId: "s2" },
  { id: "t3", fullName: "ממלא מקום", staffUserId: null },
];
const categories = [{ id: "c", name: "מקצוע", multiSelect: true, required: false, sortOrder: 1,
  options: [{ id: "math", label: "מתמטיקה", sortOrder: 0 }] }];
const labels = { s1: ["math"], s9: ["math"] };

describe("TargetPicker", () => {
  afterEach(cleanup);

  it("shows how many teachers a label reaches and how many have no login", () => {
    render(<TargetPicker teachers={teachers} categories={categories} labels={labels}
      value={{ kind: "label", optionId: "math" }} onChange={vi.fn()} />);
    expect(screen.getByText(`target.reach:${JSON.stringify({ count: 1 })}`)).toBeTruthy();
    expect(screen.getByText(`target.unlinked:${JSON.stringify({ count: 1 })}`)).toBeTruthy();
    expect(screen.getByText("ממלא מקום")).toBeTruthy();
  });

  it("picks teachers from the list", () => {
    const onChange = vi.fn();
    const { rerender } = render(<TargetPicker teachers={teachers} categories={categories} labels={labels}
      value={{ kind: "teachers", teacherIds: [] }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("דנה"));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "teachers", teacherIds: ["t1"] });
    rerender(<TargetPicker teachers={teachers} categories={categories} labels={labels}
      value={{ kind: "teachers", teacherIds: ["t1"] }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("יוסי"));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "teachers", teacherIds: ["t1", "t2"] });
  });
});
