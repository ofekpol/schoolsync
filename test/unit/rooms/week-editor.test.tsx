import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeekEditor } from "@/components/rooms/WeekEditor";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
  useLocale: () => "en",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const p = (period: number, start: string, end: string) => ({ period, start, end });
const WEEK = { days: [{ day: 0, periods: [p(1, "08:00", "08:45"), p(2, "08:50", "09:35"), p(3, "09:40", "10:25")] }] };

describe("WeekEditor", () => {
  afterEach(cleanup);

  it("lets only the last period of a day be removed, so period numbers never shift", () => {
    render(<WeekEditor initial={WEEK} />);
    const removers = () => screen.queryAllByRole("button", { name: /manage.removePeriod/ });
    expect(removers().map((b) => b.getAttribute("aria-label"))).toEqual(["manage.removePeriod 3 Sunday"]);

    fireEvent.click(removers()[0]);
    expect(removers().map((b) => b.getAttribute("aria-label"))).toEqual(["manage.removePeriod 2 Sunday"]);
    expect(screen.getAllByDisplayValue("08:50")).toHaveLength(1);
  });
});
