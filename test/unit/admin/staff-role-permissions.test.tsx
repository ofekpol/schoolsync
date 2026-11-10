import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PendingRequestsTable } from "@/components/admin/PendingRequestsTable";
import { InviteForm } from "@/components/admin/InviteForm";
import { InviteTable } from "@/components/admin/InviteTable";
import { ScopeFields } from "@/components/admin/ScopeFields";
import { StaffTable } from "@/components/admin/StaffTable";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/RouteProgress", () => ({
  useRouteProgress: () => vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const eventTypes = [
  { id: "type-1", key: "trip", labelHe: "טיול", labelEn: "Trip" },
  { id: "type-2", key: "test", labelHe: "מבחן", labelEn: "Test" },
];

afterEach(() => cleanup());

describe("admin staff role permissions", () => {
  it("keeps each scope select-all action beside its label", () => {
    const { container } = render(
      <ScopeFields
        eventTypes={eventTypes}
        gradeName={(grade) => `grade-${grade}`}
        typeName={(key) => `type-${key}`}
        labels={{
          gradeScopes: "gradeScopes",
          eventTypeScopes: "eventTypeScopes",
          selectAllGrades: "selectAllGrades",
          clearAllGrades: "clearAllGrades",
          selectAllEventTypes: "selectAllEventTypes",
          clearAllEventTypes: "clearAllEventTypes",
        }}
      />,
    );

    for (const fieldset of container.querySelectorAll("fieldset")) {
      expect(fieldset.firstElementChild).toHaveClass("justify-start");
      expect(fieldset.firstElementChild).not.toHaveClass("justify-between");
    }
  });

  it("renders invite mobile cards with copy actions", () => {
    render(
      <InviteTable
        invites={[
          {
            id: "invite-1",
            token: "abc",
            role: "editor",
            gradeScopes: [7],
            eventTypeScopes: ["trip"],
            multiUse: true,
            revokedAt: null,
            usedAt: null,
          },
        ]}
      />,
    );

    const mobileList = screen.getByLabelText("mobileInviteListLabel");

    expect(within(mobileList).getByText("roleEditor")).toBeInTheDocument();
    expect(within(mobileList).getByText("ז, trip")).toBeInTheDocument();
    expect(within(mobileList).getByRole("button", { name: "copyInvite roleEditor" })).toBeInTheDocument();
  });

  it("hides used and revoked invites until history is shown, without copy actions", async () => {
    const user = userEvent.setup();
    const base = { role: "editor" as const, gradeScopes: [], eventTypeScopes: [], multiUse: false };
    render(
      <InviteTable
        invites={[
          { ...base, id: "open", token: "a", revokedAt: null, usedAt: null },
          { ...base, id: "used", token: "b", revokedAt: null, usedAt: "2026-11-01" },
          { ...base, id: "revoked", token: "c", revokedAt: "2026-11-02", usedAt: null },
        ]}
      />,
    );

    expect(screen.queryByText("used")).toBeNull();
    expect(screen.queryByText("revoked")).toBeNull();

    await user.click(screen.getByRole("button", { name: "showInviteHistory" }));

    expect(screen.getAllByText("used").length).toBeGreaterThan(0);
    expect(screen.getAllByText("revoked").length).toBeGreaterThan(0);
    // one open invite × (mobile + desktop) copy buttons
    expect(screen.getAllByRole("button", { name: "copyInvite roleEditor" })).toHaveLength(2);
  });

  it("hides deactivated staff until the status filter is changed", async () => {
    const user = userEvent.setup();
    const base = { role: "editor" as const, gradeScopes: [], eventTypeScopes: [] };
    render(
      <StaffTable
        initialStaff={[
          { ...base, id: "a", email: "a@test", fullName: "Active One", deactivatedAt: null },
          { ...base, id: "d", email: "d@test", fullName: "Gone One", deactivatedAt: "2026-11-01" },
        ]}
        eventTypes={eventTypes}
      />,
    );

    expect(screen.getAllByText("Active One").length).toBeGreaterThan(0);
    expect(screen.queryByText("Gone One")).toBeNull();

    await user.selectOptions(screen.getByLabelText("filterByStatus"), "all");

    expect(screen.getAllByText("Gone One").length).toBeGreaterThan(0);
  });

  it("renders staff mobile cards with edit and status actions", async () => {
    const user = userEvent.setup();

    render(
      <StaffTable
        initialStaff={[
          {
            id: "staff-1",
            email: "editor@test",
            fullName: "Editor User",
            role: "editor",
            deactivatedAt: null,
            gradeScopes: [7],
            eventTypeScopes: ["trip"],
          },
        ]}
        eventTypes={eventTypes}
      />,
    );

    const mobileList = screen.getByLabelText("mobileListLabel");
    expect(within(mobileList).getByText("Editor User")).toBeInTheDocument();
    expect(within(mobileList).getByText("editor@test")).toBeInTheDocument();
    expect(within(mobileList).getByText("roleEditor")).toBeInTheDocument();

    await user.click(within(mobileList).getByRole("button", { name: "edit Editor User" }));

    expect(screen.getByRole("dialog", { name: "editUserTitle" })).toBeInTheDocument();
  });

  it("hides scope controls while editing a viewer and shows them for an editor", async () => {
    const user = userEvent.setup();

    render(
      <StaffTable
        initialStaff={[
          {
            id: "staff-1",
            email: "viewer@test",
            fullName: "Viewer User",
            role: "viewer",
            deactivatedAt: null,
            gradeScopes: [],
            eventTypeScopes: [],
          },
        ]}
        eventTypes={eventTypes}
      />,
    );

    await user.click(screen.getByRole("button", { name: "edit" }));

    expect(screen.queryByText("gradeScopes")).not.toBeInTheDocument();
    expect(screen.queryByText("eventTypeScopes")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("role"), "editor");

    expect(screen.getByText("gradeScopes")).toBeInTheDocument();
    expect(screen.getByText("eventTypeScopes")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("role"), "viewer");

    expect(screen.queryByText("gradeScopes")).not.toBeInTheDocument();
    expect(screen.queryByText("eventTypeScopes")).not.toBeInTheDocument();
  });

  it("hides approval scope controls for the default viewer role", async () => {
    const user = userEvent.setup();

    render(
      <PendingRequestsTable
        pending={[
          {
            id: "pending-1",
            email: "pending@test",
            fullName: "Pending User",
            requestedAt: new Date("2026-05-26T08:00:00.000Z"),
          },
        ]}
        eventTypes={eventTypes}
      />,
    );

    await user.click(screen.getByRole("button", { name: "approve" }));

    expect(screen.queryByText("gradeScopes")).not.toBeInTheDocument();
    expect(screen.queryByText("eventTypeScopes")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("role"), "editor");

    expect(screen.getByText("gradeScopes")).toBeInTheDocument();
    expect(screen.getByText("eventTypeScopes")).toBeInTheDocument();
  });

  it("toggles all edit-user grade and event type scopes on and off", async () => {
    const user = userEvent.setup();

    render(
      <StaffTable
        initialStaff={[
          {
            id: "staff-1",
            email: "editor@test",
            fullName: "Editor User",
            role: "editor",
            deactivatedAt: null,
            gradeScopes: [],
            eventTypeScopes: [],
          },
        ]}
        eventTypes={eventTypes}
      />,
    );

    await user.click(screen.getByRole("button", { name: "edit" }));

    const grade7 = screen.getByRole("checkbox", { name: "ז" });
    const grade12 = screen.getByRole("checkbox", { name: "יב" });
    const trip = screen.getByRole("checkbox", { name: "טיול" });
    const test = screen.getByRole("checkbox", { name: "מבחן" });

    await user.click(screen.getByRole("button", { name: "selectAllGrades" }));
    expect(grade7).toBeChecked();
    expect(grade12).toBeChecked();

    await user.click(screen.getByRole("button", { name: "clearAllGrades" }));
    expect(grade7).not.toBeChecked();
    expect(grade12).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "selectAllEventTypes" }));
    expect(trip).toBeChecked();
    expect(test).toBeChecked();

    await user.click(screen.getByRole("button", { name: "clearAllEventTypes" }));
    expect(trip).not.toBeChecked();
    expect(test).not.toBeChecked();
  });

  it("toggles all invite grade and event type scopes on and off", async () => {
    const user = userEvent.setup();

    render(<InviteForm eventTypes={eventTypes} />);

    const grade7 = screen.getByRole("checkbox", { name: "ז" });
    const grade12 = screen.getByRole("checkbox", { name: "יב" });
    const trip = screen.getByRole("checkbox", { name: "טיול" });
    const test = screen.getByRole("checkbox", { name: "מבחן" });

    await user.click(screen.getByRole("button", { name: "selectAllGrades" }));
    expect(grade7).toBeChecked();
    expect(grade12).toBeChecked();

    await user.click(screen.getByRole("button", { name: "clearAllGrades" }));
    expect(grade7).not.toBeChecked();
    expect(grade12).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "selectAllEventTypes" }));
    expect(trip).toBeChecked();
    expect(test).toBeChecked();

    await user.click(screen.getByRole("button", { name: "clearAllEventTypes" }));
    expect(trip).not.toBeChecked();
    expect(test).not.toBeChecked();
  });
});

describe("StaffTable in a demo school", () => {
  it("lists staff without any edit or deactivate controls", () => {
    render(
      <StaffTable
        initialStaff={[
          {
            id: "demo-admin",
            email: "demo-x@demo.edusolutions.invalid",
            fullName: "Demo Admin",
            role: "admin",
            deactivatedAt: null,
            gradeScopes: [],
            eventTypeScopes: [],
          },
        ]}
        eventTypes={eventTypes}
        readOnly
      />,
    );
    expect(screen.getAllByText("Demo Admin").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /deactivate/ })).toBeNull();
    expect(screen.queryByText("actions")).toBeNull();
  });
});
