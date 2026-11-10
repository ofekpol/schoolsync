import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventTypeManager } from "@/components/admin/event-types/EventTypeManager";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: { name?: string }) =>
    params?.name ? `${key} ${params.name}` : key,
}));

const fetchMock = vi.fn();

function respond(status: number, body: unknown = {}) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

const initial = [
  { id: "type-1", key: "trip", labelHe: "טיול", labelEn: "Trip", colorHex: "#1f77b4", glyph: "T" },
  { id: "type-2", key: "exam", labelHe: "מבחן", labelEn: "Exam", colorHex: "#d62728", glyph: "E" },
  { id: "type-3", key: "ceremony", labelHe: "טקס", labelEn: "Ceremony", colorHex: "#9467bd", glyph: "C" },
];

function rowNames() {
  const list = screen.getByRole("list", { name: "listLabel" });
  return within(list).queryAllByText(/^(טיול|מבחן|טקס|סיור)$/).map((el) => el.textContent);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("EventTypeManager", () => {
  it("keeps the display order it was given and hides the internal key", () => {
    render(<EventTypeManager initial={initial} canManage />);
    expect(rowNames()).toEqual(["טיול", "מבחן", "טקס"]);
    expect(screen.queryByText("trip")).not.toBeInTheDocument();
  });

  it("gives editors only the add action", () => {
    render(<EventTypeManager initial={initial} canManage={false} />);
    expect(screen.queryByRole("button", { name: "editNamed טיול" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "deleteNamed טיול" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "moveDown טיול" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "create" })).toBeInTheDocument();
  });

  it("asks before deleting and shows the in-use error on the row", async () => {
    const user = userEvent.setup();
    render(<EventTypeManager initial={initial} canManage />);
    await user.click(screen.getByRole("button", { name: "deleteNamed מבחן" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("confirmDelete מבחן")).toBeInTheDocument();

    respond(409, { error: "in_use" });
    await user.click(screen.getByRole("button", { name: "delete" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/admin/event-types/type-2", expect.objectContaining({ method: "DELETE" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("inUse");
    expect(rowNames()).toEqual(["טיול", "מבחן", "טקס"]);
  });

  it("removes the row after a confirmed delete", async () => {
    const user = userEvent.setup();
    render(<EventTypeManager initial={initial} canManage />);
    respond(200, { deleted: true });
    await user.click(screen.getByRole("button", { name: "deleteNamed טקס" }));
    await user.click(screen.getByRole("button", { name: "delete" }));
    await waitFor(() => expect(rowNames()).toEqual(["טיול", "מבחן"]));
    expect(refresh).toHaveBeenCalled();
  });

  it("moves a row and sends the full new order; reverts when that fails", async () => {
    const user = userEvent.setup();
    render(<EventTypeManager initial={initial} canManage />);
    respond(200, { reordered: true });
    await user.click(screen.getByRole("button", { name: "moveDown טיול" }));
    expect(rowNames()).toEqual(["מבחן", "טיול", "טקס"]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ ids: ["type-2", "type-1", "type-3"] });

    respond(500);
    await user.click(screen.getByRole("button", { name: "moveUp טקס" }));
    await waitFor(() => expect(rowNames()).toEqual(["מבחן", "טיול", "טקס"]));
    expect(screen.getByRole("alert")).toHaveTextContent("errorReorder");
  });

  it("adds a type without a key, filling the glyph from the English name", async () => {
    const user = userEvent.setup();
    render(<EventTypeManager initial={initial} canManage />);
    await user.click(screen.getByRole("button", { name: "create" }));
    await user.type(screen.getByLabelText("labelHe"), "סיור");
    await user.type(screen.getByLabelText("labelEn"), "visit");
    expect(screen.getByLabelText("glyph")).toHaveValue("V");

    respond(201, { id: "type-4", key: "visit" });
    await user.click(screen.getByRole("button", { name: "save" }));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/admin/event-types");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ labelHe: "סיור", labelEn: "visit", glyph: "V" });
    expect(body).not.toHaveProperty("key");
    await waitFor(() => expect(rowNames()).toEqual(["טיול", "מבחן", "טקס", "סיור"]));
  });

  it("keeps the editor open with an error when saving fails", async () => {
    const user = userEvent.setup();
    render(<EventTypeManager initial={initial} canManage />);
    await user.click(screen.getByRole("button", { name: "editNamed טיול" }));
    const he = screen.getByLabelText("labelHe");
    await user.clear(he);
    await user.type(he, "טיול שנתי");
    respond(500);
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("errorSave");
    expect(screen.getByLabelText("labelHe")).toHaveValue("טיול שנתי");
  });
});
