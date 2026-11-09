import { render, screen, within } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { DashboardLoadingSkeleton } from "@/components/staff/DashboardLoadingSkeleton";
import { StaffEntryLoading } from "@/components/staff/StaffEntryLoading";
// Static imports: a dynamic import inside a test spends its timeout transforming the module graph.
import Layout from "@/app/(staff)/layout";
import Loading from "@/app/(staff)/loading";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      entryTitle: "Preparing your workspace",
      entryDetail: "Verifying your access…",
      dashboardTitle: "Loading your calendar",
      dashboardDetail: "Organizing upcoming events…",
    })[key] ?? key,
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getStaffUser: vi.fn() }));
vi.mock("@/lib/db/schools", () => ({ getSchoolById: vi.fn() }));
vi.mock("@/lib/nav", () => ({ buildNavLinks: vi.fn(), getCurrentPath: vi.fn() }));
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/auth/LogoutButton", () => ({ LogoutButton: () => null }));

describe("staff loading states", () => {
  it("announces the entry state and hides its decorative visual", () => {
    render(<StaffEntryLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("Preparing your workspace");
    expect(screen.getByTestId("staff-entry-visual")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders a dashboard-shaped loading skeleton", () => {
    const { container } = render(<DashboardLoadingSkeleton />);
    const view = within(container);

    expect(view.getByRole("status")).toHaveTextContent("Loading your calendar");
    expect(view.getAllByTestId("dashboard-loading-cell")).not.toHaveLength(0);
  });

  it("streams the entry state before the asynchronous staff guard", () => {
    expect(Layout({ children: <div /> })).toMatchObject({ type: Suspense });
  });

  it("uses the dashboard skeleton for route-level loading", () => {
    const { container } = render(<Loading />);

    expect(within(container).getByRole("status")).toHaveTextContent("Loading your calendar");
  });
});
