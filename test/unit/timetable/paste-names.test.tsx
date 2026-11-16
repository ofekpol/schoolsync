import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasteNamesDialog } from "@/components/timetable/setup/PasteNamesDialog";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function open(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(<PasteNamesDialog title="הדבקת רשימה" onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole("button", { name: "הדבקת רשימה" }));
  return { onSubmit, textarea: screen.getByRole("textbox"), submit: screen.getByRole("button", { name: "paste.add" }) };
}

describe("PasteNamesDialog", () => {
  afterEach(cleanup);

  it("submits trimmed names without blanks or repeats", async () => {
    const { onSubmit, textarea, submit } = open();
    fireEvent.change(textarea, { target: { value: "מתמטיקה\n\n אנגלית \nמתמטיקה" } });
    fireEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(["מתמטיקה", "אנגלית"]));
  });

  it("disables submit for an empty textarea", () => {
    const { textarea, submit } = open();
    expect(submit).toBeDisabled();
    fireEvent.change(textarea, { target: { value: " \n \n" } });
    expect(submit).toBeDisabled();
  });

  it("shows an error and does not submit a line over 60 characters", () => {
    const { onSubmit, textarea, submit } = open();
    fireEvent.change(textarea, { target: { value: `קצר\n${"א".repeat(61)}` } });
    fireEvent.click(submit);
    expect(screen.getByRole("alert")).toHaveTextContent("paste.tooLong");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
