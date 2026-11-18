import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/AppHeader";

vi.mock("@/components/AppHeaderNav", () => ({ AppHeaderNav: () => null }));

describe("AppHeader", () => {
  it("is hidden when printing", () => {
    const { container } = render(<AppHeader title="x" />);
    expect(container.firstElementChild).toHaveClass("print:hidden");
  });
});
