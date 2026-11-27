import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryEditor } from "@/components/profile/CategoryEditor";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key} ${values.name}` : key,
}));

const ROLE = {
  name: "תפקיד",
  multiSelect: false,
  required: false,
  options: [{ id: "00000000-0000-0000-0000-0000000000d1", label: "מורה" }],
};

describe("CategoryEditor permissions", () => {
  afterEach(cleanup);

  it("shows permission choices only for an admin-assigned category and sends them", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(<CategoryEditor initial={ROLE} isNew={false} onSave={onSave} onCancel={vi.fn()} />);
    expect(screen.queryByRole("group", { name: /groupLabel/ })).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "adminAssigned" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "rooms.book" }));
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      adminAssigned: true,
      options: [{ label: "מורה", permissions: ["rooms.book"] }],
    });
  });

  it("drops permissions when the category stops being admin-assigned", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    const initial = {
      ...ROLE,
      adminAssigned: true,
      options: [{ ...ROLE.options[0], permissions: ["rooms.manage" as const] }],
    };
    render(<CategoryEditor initial={initial} isNew={false} onSave={onSave} onCancel={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "rooms.manage" })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "adminAssigned" }));
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      adminAssigned: false,
      options: [{ label: "מורה", permissions: [] }],
    });
  });
});
