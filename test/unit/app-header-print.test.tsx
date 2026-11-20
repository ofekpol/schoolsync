import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/AppHeader";
import { StaffShell } from "@/components/staff/StaffShell";
import type { StaffUserRecord } from "@/lib/auth/session";

vi.mock("@/components/AppHeaderNav", () => ({ AppHeaderNav: () => null }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/db/schools", () => ({ getSchoolById: async () => ({ name: "School", services: [] }) }));
vi.mock("@/lib/db/platform-admins", () => ({ isPlatformAdmin: async () => false }));
vi.mock("@/lib/nav", () => ({ buildNavLinks: async () => [], getCurrentPath: async () => "/" }));
vi.mock("@/lib/profile/gate", () => ({ needsProfile: async () => false }));
vi.mock("@/lib/ai/model", () => ({ isAiEnabled: () => false }));
vi.mock("@/lib/auth/demo-guard", () => ({ isDemoUser: () => false }));
vi.mock("@/components/auth/LogoutButton", () => ({ LogoutButton: () => null }));
vi.mock("@/components/support/SupportLink", () => ({ SupportLink: () => null }));
vi.mock("@/components/demo/DemoBanner", () => ({ DemoBanner: () => null }));
vi.mock("@/components/ai/StaffChatPanel", () => ({ StaffChatPanel: () => null }));

describe("header printing", () => {
  it("AppHeader alone stays visible when printing (public viewers)", () => {
    const { container } = render(<AppHeader title="x" />);
    expect(container.firstElementChild).not.toHaveClass("print:hidden");
  });

  it("StaffShell hides the header when printing", async () => {
    const user = { id: "u", schoolId: "s", role: "admin", fullName: "n", email: "e", demoExpiresAt: null } as unknown as StaffUserRecord;
    const { container } = render(await StaffShell({ user, withChat: false, children: <main>body</main> }));
    const wrapper = container.querySelector("h1")?.closest("[class~=\"print:hidden\"]");
    expect(wrapper).not.toBeNull();
    expect(container.querySelector("main")?.closest("[class~=\"print:hidden\"]")).toBeNull();
  });
});
