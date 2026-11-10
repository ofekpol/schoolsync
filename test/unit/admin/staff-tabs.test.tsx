import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffTabs } from "@/components/admin/StaffTabs";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(() => cleanup());

const tabs = [
  { id: "staff", label: "Staff", count: 3, panel: <p>staff panel</p> },
  { id: "requests", label: "Requests", count: 2, attention: true, panel: <p>requests panel</p> },
  { id: "links", label: "Links", panel: <p>links panel</p> },
];

describe("StaffTabs", () => {
  it("shows one panel at a time and switches on click", async () => {
    const user = userEvent.setup();
    render(<StaffTabs tabs={tabs} />);

    expect(screen.getByText("staff panel")).toBeVisible();
    expect(screen.getByText("links panel")).not.toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Links" }));

    expect(screen.getByRole("tab", { name: "Links" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("links panel")).toBeVisible();
    expect(screen.getByText("staff panel")).not.toBeVisible();
    expect(window.location.search).toBe("?tab=links");
  });

  it("opens on the tab named in the URL and ignores unknown ids", () => {
    const { unmount } = render(<StaffTabs tabs={tabs} initialTab="requests" />);
    expect(screen.getByText("requests panel")).toBeVisible();
    unmount();

    render(<StaffTabs tabs={tabs} initialTab="nope" />);
    expect(screen.getByText("staff panel")).toBeVisible();
  });

  it("points to pending requests from the staff tab", async () => {
    const user = userEvent.setup();
    render(<StaffTabs tabs={tabs} pendingCount={2} />);

    expect(screen.getByText("pendingBanner")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "reviewRequests" }));

    expect(screen.getByText("requests panel")).toBeVisible();
    expect(screen.queryByText("pendingBanner")).toBeNull();
  });

  it("moves between tabs with the arrow keys (RTL: left is next)", async () => {
    const user = userEvent.setup();
    render(<StaffTabs tabs={tabs} />);

    await user.click(screen.getByRole("tab", { name: /^Staff/ }));
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: /^Requests/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Links" })).toHaveFocus();
  });
});
