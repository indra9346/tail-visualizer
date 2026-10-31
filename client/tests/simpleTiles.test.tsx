import { describe, expect, test, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
// The REAL request schema of POST /api/tiles/manage: whatever Add tile sends must pass it.
import { createTileBodySchema } from "../../server/lib/validation";
import { ShowroomTilesPage } from "@/pages/ShowroomTilesPage";
import { AddTilePage } from "@/pages/AddTilePage";
import { MorePage } from "@/pages/MorePage";
import { CreditsPage } from "@/pages/CreditsPage";
import { WorkflowProvider, useWorkflow } from "@/context/WorkflowContext";
import { AuthProvider } from "@/context/AuthContext";
import type { Tile } from "@/api/types";
import type { CreditPackage } from "@/api/billing";
import { installFakeBackend, ROOM_ID, type FakeBackend } from "./fakeBackend";
import { testAuth } from "./testAuth";

/** The simple app's Tiles, Add tile, More and Add more photos screens, through the real pages and API modules. */

// jsdom cannot draw on a canvas; the photo is sent as chosen.
vi.mock("@/lib/imagePreprocess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/imagePreprocess")>()),
  preprocessRoomImage: async (file: File) => file,
}));

let backend: FakeBackend;
beforeEach(() => {
  backend = installFakeBackend();
});

let seen: ReturnType<typeof useWorkflow> | null = null;
function Probe() {
  seen = useWorkflow();
  return null;
}

function app(path: string, extraRoutes?: ReactNode) {
  seen = null;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <WorkflowProvider>
          <Probe />
          <Routes>
            <Route path="/" element={<p>Home page</p>} />
            <Route path="/tiles" element={<ShowroomTilesPage />} />
            <Route path="/add-tile" element={<AddTilePage />} />
            <Route path="/more" element={<MorePage />} />
            <Route path="/credits" element={<CreditsPage />} />
            <Route path="/upload" element={<p>Upload page</p>} />
            {extraRoutes}
          </Routes>
        </WorkflowProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function tile(n: number, name: string, category: Tile["category"], extra: Partial<Tile> = {}): Tile {
  return {
    id: `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`,
    sku: `T-${n}`,
    name,
    brand: null,
    category,
    material: null,
    finish: null,
    colorFamily: null,
    sizeMm: "600x600",
    pricePerSqft: 55,
    currency: "INR",
    suitableRooms: [],
    storagePath: `owner-1/t-${n}.jpg`,
    isActive: true,
    ...extra,
  };
}

/** Names of the tile cards on screen, in order. */
const cardNames = () =>
  within(screen.getByRole("list", { name: "Tiles" }))
    .getAllByRole("button")
    .map((b) => b.querySelector("b")?.textContent);

describe("My tiles", () => {
  beforeEach(() => {
    backend.tiles = [
      tile(1, "Old Grey", "floor", { isActive: false, sizeMm: null, pricePerSqft: null }),
      tile(2, "Rosa Marble", "wall", { sizeMm: "300x450", pricePerSqft: 48, colorFamily: "pink" }),
      tile(3, "Ivory Matt", "both"),
      tile(4, "Statuario Diamond", "floor", { sizeMm: "600 x 1200", pricePerSqft: 68 }),
    ];
  });

  test("lists every tile of the showroom (hidden ones last) and filters Floor / Wall, search by name, size or colour", async () => {
    const user = userEvent.setup();
    app("/tiles");
    expect(await screen.findByRole("heading", { name: "My tiles" })).toBeInTheDocument();
    await waitFor(() => expect(cardNames()).toEqual(["Rosa Marble", "Ivory Matt", "Statuario Diamond", "Old Grey"]));
    expect(screen.getByText("4 tiles in your showroom · 1 hidden")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add tile/ })).toHaveAttribute("href", "/add-tile");

    // Tags and the size / price line.
    const rosa = screen.getByRole("button", { name: /Rosa Marble/ });
    expect(within(rosa).getByText("Wall")).toBeInTheDocument();
    expect(within(rosa).getByText("300×450 · ₹48/sq ft")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Ivory Matt/ })).getByText("Floor + wall")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Old Grey/ })).getByText("Hidden")).toBeInTheDocument();

    // A "both" tile shows under Floor tiles and under Wall tiles.
    await user.click(screen.getByRole("radio", { name: "Floor tiles" }));
    expect(screen.getByRole("radio", { name: "Floor tiles" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "All" })).toHaveAttribute("aria-checked", "false");
    expect(cardNames()).toEqual(["Ivory Matt", "Statuario Diamond", "Old Grey"]);
    await user.click(screen.getByRole("radio", { name: "Wall tiles" }));
    expect(cardNames()).toEqual(["Rosa Marble", "Ivory Matt"]);

    await user.click(screen.getByRole("radio", { name: "All" }));
    const search = screen.getByRole("searchbox", { name: "Search tiles" });
    await user.type(search, "600×1200");
    expect(cardNames()).toEqual(["Statuario Diamond"]);
    await user.clear(search);
    await user.type(search, "pink");
    expect(cardNames()).toEqual(["Rosa Marble"]);
    await user.clear(search);
    await user.type(search, "nothing like this");
    expect(screen.getByText("No tiles match.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all tiles" }));
    expect(cardNames()).toHaveLength(4);
  });

  test("Hide from customers hides the tile; Show again brings it back", async () => {
    const user = userEvent.setup();
    app("/tiles");
    await user.click(await screen.findByRole("button", { name: /Rosa Marble/ }));
    const sheet = screen.getByRole("dialog", { name: "Rosa Marble" });
    await user.click(within(sheet).getByRole("button", { name: "Hide from customers" }));

    expect(await screen.findByRole("status")).toHaveTextContent('"Rosa Marble" is hidden from customers.');
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(backend.calls).toContain("PATCH /api/tiles/manage");
    expect(backend.tiles.find((t) => t.name === "Rosa Marble")!.isActive).toBe(false);
    expect(within(screen.getByRole("button", { name: /Rosa Marble/ })).getByText("Hidden")).toBeInTheDocument();
    expect(cardNames()).toEqual(["Ivory Matt", "Statuario Diamond", "Old Grey", "Rosa Marble"]);
    expect(screen.getByText("4 tiles in your showroom · 2 hidden")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Old Grey/ }));
    const hiddenSheet = screen.getByRole("dialog", { name: "Old Grey" });
    // A hidden tile cannot be used in a design until it is shown again.
    expect(within(hiddenSheet).queryByRole("button", { name: "Try in a room" })).not.toBeInTheDocument();
    await user.click(within(hiddenSheet).getByRole("button", { name: "Show again" }));
    expect(await screen.findByRole("status")).toHaveTextContent('"Old Grey" is showing again.');
    expect(backend.tiles.find((t) => t.name === "Old Grey")!.isActive).toBe(true);
  });

  test("a failed Hide says so in plain words and keeps the list on screen", async () => {
    const user = userEvent.setup();
    backend.extra = (url) =>
      url.pathname === "/api/tiles/manage" && backend.calls[backend.calls.length - 1]!.startsWith("PATCH")
        ? { status: 500, json: { error: { code: "INTERNAL_ERROR", message: "db timeout" } } }
        : undefined;
    app("/tiles");
    await user.click(await screen.findByRole("button", { name: /Rosa Marble/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hide from customers" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('Could not hide "Rosa Marble". Check the internet and try again.');
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(cardNames()).toHaveLength(4);
    expect(backend.tiles.find((t) => t.name === "Rosa Marble")!.isActive).toBe(true);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cardNames()).toHaveLength(4);
  });

  test("Try in a room picks the tile and opens the room photo step", async () => {
    const user = userEvent.setup();
    app("/tiles");
    await user.click(await screen.findByRole("button", { name: /Ivory Matt/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Try in a room" }));
    expect(await screen.findByText("Upload page")).toBeInTheDocument();
    expect(seen!.selectedTile?.name).toBe("Ivory Matt");
    expect(seen!.selectedSurfaces).toEqual(["floor", "wall"]);
  });

  test("no tiles yet: one button to add the first tile", async () => {
    backend.tiles = [];
    app("/tiles");
    expect(await screen.findByText("No tiles yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add your first tile/ })).toHaveAttribute("href", "/add-tile");
  });

  test("a list that cannot load says so, and Try again loads it", async () => {
    const user = userEvent.setup();
    let failures = 1;
    backend.extra = (url) =>
      url.pathname === "/api/tiles/manage" && failures-- > 0 ? { status: 500, json: { error: { code: "INTERNAL_ERROR", message: "x" } } } : undefined;
    app("/tiles");
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load your tiles.");
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(cardNames()).toHaveLength(4));
  });
});

describe("Add a tile", () => {
  let posted: unknown[];
  beforeEach(() => {
    posted = [];
    backend.tiles = [];
    backend.extra = (url, body) => {
      if (url.pathname !== "/api/tiles/manage" || !backend.calls[backend.calls.length - 1]!.startsWith("POST")) return undefined;
      posted.push(body);
      const b = body as { name: string; category: Tile["category"]; sizeMm?: string };
      const saved = tile(9, b.name, b.category, { sizeMm: b.sizeMm ?? null });
      backend.tiles.unshift(saved);
      return { status: 201, json: { tile: saved } };
    };
  });

  const photo = () => new File(["fake-jpeg-bytes"], "tile.jpg", { type: "image/jpeg" });

  test("Save tile waits for photo, name, size and place, then sends the right size and category", async () => {
    const user = userEvent.setup();
    app("/add-tile");
    expect(await screen.findByRole("heading", { name: "Add a tile" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/tiles");
    const save = screen.getByRole("button", { name: /Save tile/ });
    expect(save).toBeDisabled();
    expect(screen.getByText("Still needed: photo, name, size, where it goes")).toBeInTheDocument();

    await user.upload(screen.getByLabelText("Choose photo"), photo());
    expect(await screen.findByAltText("Photo of the new tile")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Tile name"), "Sandstone Strip");
    await user.click(screen.getByRole("radio", { name: "600×1200" }));
    expect(save).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Both/ }));
    expect(screen.getByRole("radio", { name: /Both/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Matt" }));
    expect(screen.getByRole("button", { name: "Matt" })).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByLabelText(/Price/), "70");
    expect(save).toBeEnabled();
    await user.click(save);

    // Back on My tiles with the new tile.
    expect(await screen.findByRole("heading", { name: "My tiles" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent('"Sandstone Strip" was added.');
    expect(posted).toHaveLength(1);
    const body = posted[0] as Record<string, unknown>;
    expect(body).toMatchObject({ name: "Sandstone Strip", category: "both", sizeMm: "600x1200", finish: "Matt", pricePerSqft: 70, suitableRooms: [], mimeType: "image/jpeg" });
    expect(createTileBodySchema.safeParse(body).success).toBe(true);
    await waitFor(() => expect(cardNames()).toEqual(["Sandstone Strip"]));
  });

  test("Other size: the typed size is saved; a failed save keeps the form and says what to do", async () => {
    const user = userEvent.setup();
    const ok = backend.extra!;
    let fail = true;
    backend.extra = (url, body) => {
      if (!fail || url.pathname !== "/api/tiles/manage") return ok(url, body);
      fail = false;
      return { status: 500, json: { error: { code: "INTERNAL_ERROR", message: "boom" } } };
    };
    app("/add-tile");
    await user.upload(await screen.findByLabelText("Take photo"), photo());
    await user.type(screen.getByLabelText("Tile name"), "Mosaic");
    await user.click(screen.getByRole("radio", { name: "Other" }));
    await user.type(screen.getByLabelText("Other size"), "250x375");
    await user.click(screen.getByRole("radio", { name: /Wall/ }));
    await user.click(screen.getByRole("button", { name: /Save tile/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the tile. Check the internet and try again.");
    expect(screen.getByLabelText("Tile name")).toHaveValue("Mosaic");
    await user.click(screen.getByRole("button", { name: /Save tile/ }));
    expect(await screen.findByRole("heading", { name: "My tiles" })).toBeInTheDocument();
    expect(posted[0]).toMatchObject({ name: "Mosaic", category: "wall", sizeMm: "250x375", pricePerSqft: null });
    expect(posted[0]).not.toHaveProperty("finish");
  });
});

describe("More", () => {
  test("shows photos left with Add photos, the other places, and Sign out", async () => {
    backend.balance = 120; // 10 credits a photo -> 12 photos
    app("/more");
    expect(await screen.findByRole("heading", { name: "More" })).toBeInTheDocument();
    const left = screen.getByRole("region", { name: "PHOTOS LEFT" });
    expect(await within(left).findByText("12")).toBeInTheDocument();
    expect(within(left).getByText(/Each real photo uses 1\./)).toBeInTheDocument();
    expect(within(left).getByRole("link", { name: /Add photos/ })).toHaveAttribute("href", "/credits");
    const nav = screen.getByRole("navigation", { name: "More options" });
    expect(within(nav).getByRole("link", { name: /Boxes calculator/ })).toHaveAttribute("href", "/calculator");
    expect(within(nav).getByRole("link", { name: /Design history/ })).toHaveAttribute("href", "/my-visualizations");
    expect(within(nav).getByRole("link", { name: /Payments and bills/ })).toHaveAttribute("href", "/payments");
    expect(within(nav).getByRole("link", { name: /Sample before \/ after/ })).toHaveAttribute("href", "/demos");
  });

  test("Sign out signs out, forgets the owner's tile and room, and goes to the home page", async () => {
    const user = userEvent.setup();
    localStorage.setItem("tile-visualizer:workflow", JSON.stringify({ projectId: "p", roomUploadId: ROOM_ID, analysis: null, selectedTile: backend.tiles[0], selectedSurfaces: ["floor"] }));
    app("/more");
    await waitFor(() => expect(seen!.selectedTile).not.toBeNull());
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Home page")).toBeInTheDocument();
    expect(testAuth().api.signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(seen!.selectedTile).toBeNull());
    expect(seen!.roomUploadId).toBeNull();
  });
});

describe("Add more photos (/credits)", () => {
  const packages: CreditPackage[] = [
    { id: "starter", name: "Starter", description: "Try it on a few rooms", credits: 100, bonusCredits: 0, pricePaise: 49900, currency: "INR" },
    { id: "professional", name: "Professional", description: null, credits: 300, bonusCredits: 30, pricePaise: 129900, currency: "INR" },
    { id: "business", name: "Business", description: null, credits: 1000, bonusCredits: 150, pricePaise: 399900, currency: "INR" },
  ];
  let checkouts: unknown[];
  let verified: unknown[];
  beforeEach(() => {
    checkouts = [];
    verified = [];
    backend.balance = 120;
    backend.extra = (url, body) => {
      if (url.pathname === "/api/billing/packages") return { json: { packages, generationCreditCost: 10 } };
      if (url.pathname === "/api/billing/checkout") {
        checkouts.push(body);
        const pkg = packages.find((p) => p.id === (body as { packageId: string }).packageId)!;
        return { json: { checkout: { orderId: "order_1", amountPaise: pkg.pricePaise, currency: "INR", keyId: "rzp_test", packageName: pkg.name, credits: pkg.credits + pkg.bonusCredits, paymentId: "pay-row-1" } } };
      }
      if (url.pathname === "/api/billing/verify") {
        verified.push(body);
        backend.balance += 330;
        return { json: { summary: { balance: backend.balance } } };
      }
      return undefined;
    };
  });

  type Options = { handler: (r: unknown) => void; modal: { ondismiss: () => void } };
  const fakeRazorpay = (script: (opts: Options) => void) =>
    vi.stubGlobal(
      "Razorpay",
      class {
        constructor(private opts: Options) {}
        on() {}
        open() {
          script(this.opts);
        }
      },
    );

  test("packs are shown as photos, with the price of one photo and the free ones", async () => {
    const user = userEvent.setup();
    app("/credits");
    expect(await screen.findByRole("heading", { name: "Add more photos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/more");
    expect(await screen.findByText("12 photos")).toBeInTheDocument();

    const radios = await screen.findAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveTextContent("Starter");
    expect(radios[0]).toHaveTextContent("10 photos");
    expect(radios[0]).toHaveTextContent("₹499");
    expect(radios[0]).toHaveTextContent("about ₹50 a photo");
    expect(radios[0]).toHaveTextContent("Try it on a few rooms");
    expect(radios[1]).toHaveTextContent("33 photos");
    expect(radios[1]).toHaveTextContent("30 + 3 free photos");
    expect(radios[1]).toHaveTextContent("about ₹39 a photo");
    expect(radios[1]).toHaveTextContent("MOST SHOPS PICK THIS");
    expect(radios[2]).toHaveTextContent("115 photos");
    expect(radios[2]).toHaveTextContent("100 + 15 free photos");
    expect(radios[2]).not.toHaveTextContent("MOST SHOPS PICK THIS");

    // The middle pack is picked to start with; the bar pays for the picked one.
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /Pay ₹1,299/ })).toBeEnabled();
    await user.click(radios[0]!);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(radios[1]).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: /Pay ₹499/ })).toBeInTheDocument();
    expect(screen.getByText("Safe payment by Razorpay")).toBeInTheDocument();
    expect(screen.getByText("If a photo fails, nothing is used.")).toBeInTheDocument();
    expect(screen.getByText("Past payments and photos used")).toBeInTheDocument();
  });

  test("paying runs checkout, verifies it, and shows the new photos", async () => {
    const user = userEvent.setup();
    const success = { razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "sig" };
    fakeRazorpay((opts) => opts.handler(success));
    app("/credits");
    await user.click(await screen.findByRole("button", { name: /Pay ₹1,299/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("33 photos added.");
    expect(checkouts).toEqual([{ packageId: "professional" }]);
    expect(verified).toEqual([success]);
    expect(await screen.findByText("45 photos")).toBeInTheDocument();
  });

  test("closing the payment window says nothing was charged", async () => {
    const user = userEvent.setup();
    fakeRazorpay((opts) => opts.modal.ondismiss());
    app("/credits");
    await user.click(await screen.findByRole("button", { name: /Pay ₹1,299/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Payment cancelled. No charge was made.");
    expect(verified).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Pay ₹1,299/ })).toBeEnabled();
  });
});
