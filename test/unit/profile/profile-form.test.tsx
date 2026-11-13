import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileForm } from "@/components/profile/ProfileForm";
import type { ProfileCategory } from "@/lib/validations/profile";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const GRADE: ProfileCategory = {
  id: "c1", name: "שכבה", multiSelect: false, required: true, sortOrder: 1,
  options: [{ id: "g7", label: "ז", sortOrder: 0 }, { id: "g8", label: "ח", sortOrder: 1 }],
};
const SUBJECT: ProfileCategory = {
  id: "c2", name: "מקצוע", multiSelect: true, required: false, sortOrder: 2,
  options: [{ id: "math", label: "מתמטיקה", sortOrder: 0 }, { id: "eng", label: "אנגלית", sortOrder: 1 }],
};

const fetchMock = vi.fn();

describe("ProfileForm", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    push.mockReset();
    vi.unstubAllGlobals();
  });

  it("renders radios for single-select and checkboxes for multi-select", () => {
    render(<ProfileForm categories={[GRADE, SUBJECT]} selected={[]} submitUrl="/api/v1/profile" />);
    const grade = screen.getByRole("group", { name: /שכבה/ });
    expect(within(grade).getAllByRole("radio")).toHaveLength(2);
    expect(within(grade).queryAllByRole("checkbox")).toHaveLength(0);
    const subject = screen.getByRole("group", { name: /מקצוע/ });
    expect(within(subject).getAllByRole("checkbox")).toHaveLength(2);
  });

  it("offers a way to clear an optional single-select category", () => {
    const optional = { ...GRADE, required: false };
    render(<ProfileForm categories={[optional]} selected={["g7"]} submitUrl="/x" />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("disables Save while a required category has no choice", () => {
    render(<ProfileForm categories={[GRADE, SUBJECT]} selected={[]} submitUrl="/api/v1/profile" />);
    const save = screen.getByRole("button", { name: "save" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "ז" }));
    expect(save).toBeEnabled();
  });

  it("sends the ticked option ids and reports success", async () => {
    const onSaved = vi.fn();
    render(
      <ProfileForm categories={[GRADE, SUBJECT]} selected={["g7", "math"]}
        submitUrl="/api/v1/profile" onSaved={onSaved} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "ח" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "אנגלית" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "מתמטיקה" }));
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/profile");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body).optionIds.sort()).toEqual(["eng", "g8"]);
  });

  it("shows the server's validation error", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "required_missing" }, { status: 400 }));
    render(<ProfileForm categories={[SUBJECT]} selected={[]} submitUrl="/api/v1/profile" />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("errorRequiredMissing");
  });

  it("goes to savedHref after saving", async () => {
    render(<ProfileForm categories={[SUBJECT]} selected={[]} submitUrl="/x" savedHref="/dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });
});
