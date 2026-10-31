import { describe, expect, test, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "@/pages/HomePage";
import { CustomersPage } from "@/pages/CustomersPage";
import { CustomerPage } from "@/pages/CustomerPage";
import { WorkflowProvider } from "@/context/WorkflowContext";
import { AuthProvider } from "@/context/AuthContext";
import type { RoomUpload, Visualization } from "@/api/types";
import { installFakeBackend, type FakeBackend } from "./fakeBackend";

/**
 * The simple app's Home, Customers and one-customer screens against the fake backend: customers are projects ("My rooms"
 * is shown as "Walk-in customers"), each room photo lists its real photos with New try / Compare, and Home shows the
 * photos left and the latest real photos.
 */

const P_RAMESH = "aaaa1111-0000-4000-8000-000000000001";
const P_WALKIN = "aaaa1111-0000-4000-8000-000000000002";
const P_OLD = "aaaa1111-0000-4000-8000-000000000003";
const P_SAMPLE = "aaaa1111-0000-4000-8000-000000000004";
const R_RAMESH = "bbbb2222-0000-4000-8000-000000000001";
const R_RAMESH_OLD = "bbbb2222-0000-4000-8000-000000000002";
const R_WALKIN = "bbbb2222-0000-4000-8000-000000000003";
const R_OLD = "bbbb2222-0000-4000-8000-000000000004";
const R_UNFINISHED = "bbbb2222-0000-4000-8000-000000000005";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const DAYS = 24 * 60;

function room(id: string, projectId: string, createdAt: string): RoomUpload {
  return { id, projectId, status: "analyzed", errorMessage: null, createdAt, imageUrl: `https://img.test/room-${id}.jpg` };
}

function viz(id: string, roomUploadId: string, createdAt: string, status: Visualization["status"] = "completed"): Visualization {
  return {
    id,
    roomUploadId,
    status,
    appliedSurfaces: ["floor"],
    errorMessage: status === "failed" ? "Failed" : null,
    createdAt,
    completedAt: status === "completed" ? createdAt : null,
    resultImageUrl: status === "completed" ? `https://img.test/result-${id}.png` : null,
  };
}

const ROOMS: Record<string, RoomUpload[]> = {
  [P_RAMESH]: [room(R_RAMESH, P_RAMESH, ago(40)), room(R_RAMESH_OLD, P_RAMESH, ago(3 * DAYS))],
  [P_WALKIN]: [room(R_WALKIN, P_WALKIN, ago(15))],
  [P_OLD]: [room(R_OLD, P_OLD, ago(30 * DAYS))],
};
const ALL_ROOMS = [...Object.values(ROOMS).flat(), room(R_UNFINISHED, P_RAMESH, ago(5))];

const V1 = "cccc3333-0000-4000-8000-000000000001";
const V2 = "cccc3333-0000-4000-8000-000000000002";
const V3 = "cccc3333-0000-4000-8000-000000000003";
const V4 = "cccc3333-0000-4000-8000-000000000004";
const V5 = "cccc3333-0000-4000-8000-000000000005";

/** Newest first, like the server. V3 failed: it is free and never counts as a try. */
const HISTORY: Visualization[] = [
  viz(V4, R_WALKIN, ago(10)),
  viz(V2, R_RAMESH, ago(20)),
  viz(V3, R_RAMESH, ago(25), "failed"),
  viz(V1, R_RAMESH, ago(30)),
  viz(V5, R_RAMESH_OLD, ago(2 * DAYS)),
];

let backend: FakeBackend;
beforeEach(() => {
  backend = installFakeBackend();
  backend.projects = [
    { id: P_OLD, name: "Old customer", createdAt: ago(30 * DAYS) },
    { id: P_RAMESH, name: "Ramesh", createdAt: ago(3 * DAYS) },
    { id: P_WALKIN, name: "My rooms", createdAt: ago(10 * DAYS) },
  ];
  backend.history = HISTORY;
  backend.extra = (url) => {
    const projectRooms = /^\/api\/projects\/([^/]+)\/rooms$/.exec(url.pathname);
    if (projectRooms) return { json: { rooms: (ROOMS[projectRooms[1]!] ?? []).map(({ projectId: _drop, ...r }) => r) } };
    const byRoom = /^\/api\/visualizations\/room\/([^/]+)$/.exec(url.pathname);
    if (byRoom) return { json: { visualizations: HISTORY.filter((v) => v.roomUploadId === byRoom[1]) } };
    const oneRoom = /^\/api\/rooms\/([^/]+)$/.exec(url.pathname);
    const found = oneRoom && ALL_ROOMS.find((r) => r.id === oneRoom[1]);
    if (found) return { json: { room: found, deleted: true } };
    return undefined;
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <WorkflowProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:projectId" element={<CustomerPage />} />
            <Route path="/result/:visualizationId" element={<p>Result page</p>} />
          </Routes>
        </WorkflowProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const hrefOf = (el: HTMLElement) => (el.closest("a") ?? el).getAttribute("href");

describe("Customers", () => {
  test("lists every customer, shows 'My rooms' as Walk-in customers, and opens a customer", async () => {
    renderAt("/customers");
    const list = await screen.findByRole("list", { name: "Customers" });
    const links = within(list).getAllByRole("link");

    // Newest activity first: the walk-in photo (10 min ago), Ramesh (20 min ago), then the old customer.
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining("Walk-in customers"),
      expect.stringContaining("Ramesh"),
      expect.stringContaining("Old customer"),
    ]);
    expect(screen.queryByText("My rooms")).not.toBeInTheDocument();
    expect(links[0]).toHaveTextContent("1 room · no name given");
    // 2 room photos; 3 tries (the failed one is not counted).
    expect(links[1]).toHaveTextContent("2 rooms · 3 tries");
    expect(links[2]).toHaveTextContent("1 room · no tries yet");
    expect(links[1]).toHaveAttribute("href", `/customers/${P_RAMESH}`);
    expect(links[0]).toHaveAttribute("href", `/customers/${P_WALKIN}`);
    // The thumbnail is the customer's latest real photo.
    expect(links[1]!.querySelector("img")).toHaveAttribute("src", `https://img.test/result-${V2}.png`);
    expect(screen.getByText("2 people")).toBeInTheDocument();

    await userEvent.click(links[1]!);
    expect(await screen.findByRole("heading", { level: 1, name: "Ramesh" })).toBeInTheDocument();
  });

  test("search by name and the This week chip narrow the list", async () => {
    renderAt("/customers");
    await screen.findByRole("list", { name: "Customers" });

    await userEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(screen.getByRole("button", { name: "This week" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Old customer")).not.toBeInTheDocument();
    expect(screen.getByText("Ramesh")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search by customer name" }), "ram");
    const links = within(screen.getByRole("list", { name: "Customers" })).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("Ramesh");

    await userEvent.clear(screen.getByRole("searchbox", { name: "Search by customer name" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search by customer name" }), "nobody");
    expect(screen.getByText('No customer called "nobody"')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show all customers" }));
    expect(within(screen.getByRole("list", { name: "Customers" })).getAllByRole("link")).toHaveLength(3);
  });

  test("a long list loads rooms only for the customers on screen, and a returning customer rises to the top", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `dddd4444-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      name: `Customer ${i + 1}`,
      createdAt: ago((i + 5) * DAYS),
    }));
    backend.projects = [...many, { id: P_OLD, name: "Old customer", createdAt: ago(30 * DAYS) }];
    // The oldest customer came back: a real photo was made today from his old room photo.
    backend.history = [viz(V1, R_OLD, ago(5))];
    renderAt("/customers");

    const list = await screen.findByRole("list", { name: "Customers" });
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(15);
    expect(links[0]).toHaveTextContent("Old customer");
    expect(links[0]).toHaveTextContent("1 room · 1 try");
    const roomCalls = () => backend.calls.filter((c) => /^GET \/api\/projects\/[^/]+\/rooms/.test(c)).length;
    expect(roomCalls()).toBeLessThanOrEqual(16);

    await userEvent.click(screen.getByRole("button", { name: "Show more customers" }));
    expect(within(list).getAllByRole("link")).toHaveLength(21);
    expect(screen.queryByRole("button", { name: "Show more customers" })).not.toBeInTheDocument();
  });

  test("no customers yet: plain words and a link to start a new design", async () => {
    backend.projects = [];
    backend.history = [];
    renderAt("/customers");
    expect(await screen.findByRole("heading", { name: "No customers yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New design" })).toHaveAttribute("href", "/upload");
  });

  test("a failed load says so and Try again loads the list", async () => {
    const extra = backend.extra;
    let fail = true;
    backend.extra = (url, body) =>
      fail && url.pathname === "/api/projects" ? { status: 500, json: { error: { code: "INTERNAL", message: "Server is down" } } } : extra?.(url, body);
    renderAt("/customers");
    expect(await screen.findByRole("alert")).toHaveTextContent("Server is down");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("list", { name: "Customers" })).toBeInTheDocument();
  });
});

describe("One customer", () => {
  test("each room photo shows its real photos, New try and Compare", async () => {
    renderAt(`/customers/${P_RAMESH}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Ramesh" })).toBeInTheDocument();
    expect(screen.getByText("2 room photos")).toBeInTheDocument();

    const [newest, older] = await screen.findAllByRole("region");
    // Newest room photo first: two real photos (newest first), the failed try is left out.
    const tries = await within(newest!).findAllByRole("link", { name: /^Try \d$/ });
    expect(tries.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Try 2", `/result/${V2}`],
      ["Try 1", `/result/${V1}`],
    ]);
    expect(within(newest!).getByText("2 tries")).toBeInTheDocument();
    expect(within(newest!).getByRole("link", { name: "New try" })).toHaveAttribute("href", `/visualize/${R_RAMESH}`);
    expect(within(newest!).getByRole("link", { name: "Compare" })).toHaveAttribute("href", `/compare/${R_RAMESH}`);

    // One real photo: nothing to compare yet.
    expect(await within(older!).findByRole("link", { name: "Try 1" })).toHaveAttribute("href", `/result/${V5}`);
    expect(within(older!).getByText("1 try")).toBeInTheDocument();
    expect(within(older!).getByRole("link", { name: "New try" })).toHaveAttribute("href", `/visualize/${R_RAMESH_OLD}`);
    expect(within(older!).queryByRole("link", { name: "Compare" })).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: "New room for Ramesh" })).toHaveAttribute("href", `/upload?project=${P_RAMESH}`);
    expect(screen.getByRole("link", { name: "Back to customers" })).toHaveAttribute("href", "/customers");
  });

  test("a room photo can still be deleted, after asking", async () => {
    renderAt(`/customers/${P_RAMESH}`);
    const [, older] = await screen.findAllByRole("region");
    await userEvent.click(within(older!).getByRole("button", { name: "Delete this room photo" }));
    expect(screen.getByText("This room photo and every real photo made from it will be removed.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete photo" }));

    await screen.findByText("1 room photo");
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(backend.calls).toContain(`DELETE /api/rooms/${R_RAMESH_OLD}`);
    expect(screen.getByRole("button", { name: "Delete this customer" })).toBeInTheDocument();
  });

  test("the walk-in project keeps its friendly name", async () => {
    renderAt(`/customers/${P_WALKIN}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Walk-in customers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New room photo" })).toHaveAttribute("href", `/upload?project=${P_WALKIN}`);
  });

  test("the sample rooms are not a person: another sample room, not a new photo", async () => {
    backend.projects.push({ id: P_SAMPLE, name: "Sample rooms", createdAt: ago(60) });
    renderAt(`/customers/${P_SAMPLE}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Sample rooms" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try another sample room" })).toHaveAttribute("href", "/upload#samples");
  });
});

describe("Home", () => {
  test("shows photos left, the newest real photos with customer names, and the tools", async () => {
    renderAt("/");
    // 50 credits at 10 credits per real photo.
    expect(await screen.findByRole("link", { name: /5 photos left/ })).toHaveAttribute("href", "/credits");
    expect(screen.getByRole("heading", { level: 1, name: "New design" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Take photo" })).toHaveAttribute("href", "/upload");
    expect(screen.getByRole("link", { name: "Gallery" })).toHaveAttribute("href", "/upload");
    expect(screen.getByRole("link", { name: "No photo? Try a sample room" })).toHaveAttribute("href", "/upload#samples");

    // One photo of the walk-in group is "a walk-in customer" (the same words as the result page).
    const walkIn = await screen.findByRole("img", { name: "Real photo for Walk-in customer" });
    const ramesh = await screen.findAllByRole("img", { name: "Real photo for Ramesh" });
    expect(hrefOf(walkIn)).toBe(`/result/${V4}`);
    // The 3 newest real photos only: the failed try and the older 4th photo are not shown.
    expect(ramesh.map(hrefOf)).toEqual([`/result/${V2}`, `/result/${V1}`]);
    expect(screen.getAllByRole("img", { name: /Real photo/ })).toHaveLength(3);

    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/customers");
    expect(screen.getByRole("link", { name: "Boxes calculator" })).toHaveAttribute("href", "/quote");
    expect(screen.getByRole("link", { name: "Add a tile" })).toHaveAttribute("href", "/add-tile");
    // Nothing left unfinished.
    expect(screen.queryByText("CARRY ON")).not.toBeInTheDocument();
  });

  test("no real photos yet: says so in plain words", async () => {
    backend.history = [];
    renderAt("/");
    expect(await screen.findByText(/No real photos yet/)).toBeInTheDocument();
  });

  test("Carry on: the last room photo has an unfinished design", async () => {
    localStorage.setItem(
      "tile-visualizer:workflow",
      JSON.stringify({ projectId: P_RAMESH, roomUploadId: R_UNFINISHED, analysis: null, selectedTile: null, selectedSurfaces: [] }),
    );
    sessionStorage.setItem(`tile-visualizer:quick:${R_UNFINISHED}`, JSON.stringify({ areas: [{ surface: "floor", mask: null, pattern: "single", slots: [null] }], note: "" }));
    renderAt("/");

    const card = (await screen.findByText("CARRY ON")).closest("a")!;
    expect(card).toHaveAttribute("href", `/visualize/${R_UNFINISHED}`);
    expect(await within(card).findByText("Ramesh · Room photo")).toBeInTheDocument();
    expect(within(card).getByText("Stopped at step 3: Pick a tile")).toBeInTheDocument();
  });

  test("no Carry on once a real photo was made from that room", async () => {
    localStorage.setItem(
      "tile-visualizer:workflow",
      JSON.stringify({ projectId: P_RAMESH, roomUploadId: R_RAMESH, analysis: null, selectedTile: null, selectedSurfaces: [] }),
    );
    sessionStorage.setItem(`tile-visualizer:quick:${R_RAMESH}`, JSON.stringify({ areas: [], note: "" }));
    renderAt("/");
    await screen.findAllByRole("img", { name: "Real photo for Ramesh" });
    expect(screen.queryByText("CARRY ON")).not.toBeInTheDocument();
  });
});
