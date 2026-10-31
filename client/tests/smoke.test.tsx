import { describe, expect, test, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "@/App";
import { installFakeBackend, ROOM_ID, type FakeBackend } from "./fakeBackend";
import { testAuth } from "./testAuth";

/**
 * Smoke test: the WHOLE app (router, sign-in, menus, lazy-loaded pages) starts at each main address and shows that
 * page, never the "Something went wrong" screen. Catches a broken import, route or page before a deploy does.
 */

vi.mock("@/lib/useRoomPhoto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/useRoomPhoto")>()),
  useRoomPhoto: () => ({ photo: null, failed: false }),
}));

let backend: FakeBackend;
beforeEach(() => {
  backend = installFakeBackend();
  // The home page's intro animation plays once per visit; smoke tests start after it.
  sessionStorage.setItem("sds_splash_shown", "1");
});

function openApp(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

const pages: Array<[string, () => Promise<unknown>]> = [
  ["/upload", () => screen.findByRole("heading", { name: "Take a photo of the room" })],
  [`/visualize/${ROOM_ID}`, () => screen.findByRole("heading", { name: "What do you want to change?" })],
  [`/tiles/${ROOM_ID}`, () => screen.findByRole("heading", { name: "Design Studio" })],
  ["/", () => screen.findByRole("heading", { name: "New design" })],
  ["/projects", () => screen.findAllByText(/customer/i)],
  ["/customers", () => screen.findAllByText(/customer/i)],
  ["/more", () => screen.findAllByText(/photos left/i)],
  ["/add-tile", () => screen.findAllByText(/tile/i)],
  [`/compare/${ROOM_ID}`, () => screen.findByRole("heading", { name: "Compare tries" })],
  ["/quote", () => screen.findByRole("heading", { name: "How many boxes?" })],
  ["/tiles", () => screen.findAllByText(/tile/i)],
  ["/my-tiles", () => screen.findAllByText(/tile/i)],
  ["/my-visualizations", () => screen.findAllByText(/design|visuali/i)],
  ["/dashboard", () => screen.findAllByText(/visuali|credit/i)],
  ["/credits", () => screen.findAllByText(/photos/i)],
  ["/calculator", () => screen.findAllByText(/tile/i)],
  ["/demos", () => screen.findAllByText(/demo|tile/i)],
];

describe("every main page opens", () => {
  test.each(pages)("%s", async (path, ready) => {
    backend.extra = (url) => (url.pathname.startsWith("/api/projects/") ? { json: { rooms: [] } } : url.pathname === "/api/billing/transactions" ? { json: { transactions: [] } } : undefined);
    openApp(path);
    await ready();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  test("/login (signed out) and the home page", async () => {
    testAuth().state.session = null;
    const app = openApp("/login");
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    app.unmount();
    openApp("/");
    expect((await screen.findAllByRole("link", { name: /visuali|trial|start/i })).length).toBeGreaterThan(0);
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  test("the menu's New design (bottom tabs and laptop rail) goes to the photo step", async () => {
    openApp("/customers");
    const links = await screen.findAllByRole("link", { name: /New design/ });
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.every((l) => l.getAttribute("href") === "/upload")).toBe(true);
  });

  test("a signed-in owner opens straight on Home: no intro, the 4 tabs", async () => {
    sessionStorage.clear();
    openApp("/");
    expect(await screen.findByRole("heading", { name: "New design" })).toBeInTheDocument();
    const menu = screen.getByRole("navigation", { name: "Main menu" });
    for (const name of ["Home", "Customers", "Tiles", "More"]) expect(within(menu).getByRole("link", { name })).toBeInTheDocument();
  });
});
