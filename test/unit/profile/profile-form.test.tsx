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
  id: "c1", name: "שכבה", multiSelect: false, required: true, adminAssigned: false, sortOrder: 1,
  options: [{ id: "g7", label: "ז", sortOrder: 0, permissions: [] }, { id: "g8", label: "ח", sortOrder: 1, permissions: [] }],
};
const SUBJECT: ProfileCategory = {
  id: "c2", name: "מקצוע", multiSelect: true, required: false, adminAssigned: false, sortOrder: 2,
  options: [{ id: "math", label: "מתמטיקה", sortOrder: 0, permissions: [] }, { id: "eng", label: "אנגלית", sortOrder: 1, permissions: [] }],
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

  it("stays on the page and confirms the save when there is no savedHref", async () => {
    render(<ProfileForm categories={[SUBJECT]} selected={[]} submitUrl="/x" variant="page" />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(await screen.findByRole("status")).toHaveTextContent("saved");
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "אנגלית" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("explains why Save is disabled and offers a back link", () => {
    render(<ProfileForm categories={[GRADE]} selected={[]} submitUrl="/x" backHref="/dashboard"
      saveLabel="saveContinue" />);
    expect(screen.getByRole("button", { name: "saveContinue" })).toBeDisabled();
    expect(screen.getByText("errorRequiredMissing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "back" })).toHaveAttribute("href", "/dashboard");
  });

  it("goes to savedHref after saving", async () => {
    render(<ProfileForm categories={[SUBJECT]} selected={[]} submitUrl="/x" savedHref="/dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  describe("admin-assigned categories on the staff member's own profile", () => {
    const ROLE: ProfileCategory = {
      id: "c9", name: "תפקיד", multiSelect: false, required: true, adminAssigned: true, sortOrder: 3,
      options: [{ id: "teacher", label: "מורה", sortOrder: 0, permissions: ["rooms.book"] }],
    };

    it("shows them read-only and never sends them", async () => {
      const onSaved = vi.fn();
      render(<ProfileForm categories={[SUBJECT, ROLE]} selected={["teacher"]} submitUrl="/api/v1/profile"
        lockAdminAssigned onSaved={onSaved} />);
      expect(screen.getByRole("radio", { name: "מורה" })).toBeDisabled();
      expect(screen.getByText("adminAssignedNote")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("checkbox", { name: "אנגלית" }));
      fireEvent.click(screen.getByRole("button", { name: "save" }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).optionIds).toEqual(["eng"]);
    });

    it("a required one the staff member lacks does not block Save", () => {
      render(<ProfileForm categories={[SUBJECT, ROLE]} selected={[]} submitUrl="/x" lockAdminAssigned />);
      expect(screen.getByRole("button", { name: "save" })).toBeEnabled();
    });

    it("stays editable for an admin editing someone's labels", () => {
      render(<ProfileForm categories={[ROLE]} selected={[]} submitUrl="/x" />);
      expect(screen.getByRole("radio", { name: "מורה" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
    });
  });
});
