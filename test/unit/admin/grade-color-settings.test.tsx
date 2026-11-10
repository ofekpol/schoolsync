import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradeColorSettings } from "@/components/admin/GradeColorSettings";
import { DEFAULT_GRADE_COLORS } from "@/lib/grade-colors";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key} ${Object.values(params).join(" ")}` : key,
}));

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("GradeColorSettings", () => {
  it("shows one chip per grade and no palette until a chip is opened", () => {
    render(<GradeColorSettings initial={{ ...DEFAULT_GRADE_COLORS }} />);
    expect(screen.getAllByRole("button", { name: /^changeColor/ })).toHaveLength(6);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("saves the picked color and marks colors other grades use", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const user = userEvent.setup();
    render(<GradeColorSettings initial={{ ...DEFAULT_GRADE_COLORS }} />);
    await user.click(screen.getByRole("button", { name: "changeColor ז" }));
    expect(await screen.findAllByRole("radio")).toHaveLength(18);
    expect(screen.getByRole("radio", { name: `colorOption ז ${DEFAULT_GRADE_COLORS[8]}` })).toHaveTextContent("ח");

    await user.click(screen.getByRole("radio", { name: "colorOption ז #A9CCF5" }));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).colors[0]).toEqual({ grade: 7, colorHex: "#A9CCF5" });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("saved"));
  });

  it("warns when two grades share a color and reverts a failed save", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const user = userEvent.setup();
    render(<GradeColorSettings initial={{ ...DEFAULT_GRADE_COLORS, 9: DEFAULT_GRADE_COLORS[7] }} />);
    expect(screen.getByText("duplicatePair ז ט")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "changeColor ט" }));
    await user.click(await screen.findByRole("radio", { name: "colorOption ט #FFD9C2" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("error"));
    expect(screen.getByText("duplicatePair ז ט")).toBeInTheDocument();
  });
});
