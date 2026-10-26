import { describe, expect, test, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QuickUploadPage } from "@/pages/QuickUploadPage";
import { QuickDesignPage } from "@/pages/QuickDesignPage";
import { ResultPage } from "@/pages/ResultPage";
import { WorkflowProvider } from "@/context/WorkflowContext";
import { AuthProvider } from "@/context/AuthContext";
import { decodeMask, encodeMask, paintedCount } from "@/lib/areaMask";
import { installFakeBackend, lastJson, ROOM_ID, type FakeBackend } from "./fakeBackend";

/**
 * The easy visualizer, end to end in a browser-like DOM: the real pages, design model and API modules run against the
 * fake backend (which checks every generate request with the server's real schema). Only the photo itself is faked:
 * jsdom cannot decode images, so the room "photo" is a 64 x 48 grid: a cream wall on the left, a blue wall on the
 * right (top 28 rows) and a grey floor (bottom 20 rows), shown at 640 x 480 on screen.
 */

const GRID = { width: 64, height: 48 };
const WALL_ROWS = 28;

vi.mock("@/lib/useRoomPhoto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useRoomPhoto")>();
  const { toLab } = await import("@/lib/areaMask");
  const width = 64;
  const height = 48;
  const px = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const c = y < 28 ? (x < 32 ? [235, 225, 205] : [150, 190, 230]) : [80, 80, 85];
      px.set([c[0]!, c[1]!, c[2]!, 255], (y * width + x) * 4);
    }
  const photo = { image: {} as HTMLImageElement, width: 640, height: 480, grid: { width, height }, lab: toLab(px, width * height) };
  return { ...actual, useRoomPhoto: () => ({ photo, failed: false }), useTileImages: () => new Map() };
});

// jsdom cannot draw on a canvas; the photo is sent as chosen.
vi.mock("@/lib/imagePreprocess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/imagePreprocess")>()),
  preprocessRoomImage: async (file: File) => file,
}));

let backend: FakeBackend;
beforeEach(() => {
  backend = installFakeBackend();
});

function renderAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <AuthProvider>
        <WorkflowProvider>
          <Routes>
            <Route path="/upload" element={<QuickUploadPage />} />
            <Route path="/visualize/:roomId" element={<QuickDesignPage />} />
            <Route path="/result/:visualizationId" element={<p>Result page</p>} />
            <Route path="/my-visualizations" element={<p>History page</p>} />
            <Route path="/credits" element={<p>Credits page</p>} />
            <Route path="/tiles/:roomId" element={<p>Advanced studio</p>} />
          </Routes>
        </WorkflowProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** The photo, laid out at 640 x 480 px (jsdom has no layout). */
function photo() {
  const el = screen.getByTestId("photo-marker");
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 480, right: 640, bottom: 480, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return el;
}
const tapPhoto = (x: number, y: number) => fireEvent.click(photo(), { clientX: x, clientY: y });
function brush(points: Array<[number, number]>) {
  const el = photo();
  const [first, ...rest] = points;
  fireEvent.pointerDown(el, { clientX: first![0], clientY: first![1], pointerId: 1 });
  for (const [x, y] of rest) fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerUp(el, { clientX: rest.at(-1)?.[0] ?? first![0], clientY: rest.at(-1)?.[1] ?? first![1], pointerId: 1 });
}

const bigButton = (name: RegExp) => screen.getByRole("button", { name });
const heading = (name: string) => screen.findByRole("heading", { name });

type Area = { surface: string; location: string; pattern: string; tileIds: string[]; mask?: string };
const sentAreas = () => (lastJson(backend).design as { areas: Area[] }).areas;
const tileId = (n: number) => backend.tiles.find((t) => t.name === `Tile ${n}`)!.id;

/** Every painted cell of the mask lies in the given rows / columns of the photo grid. */
function paintedWithin(text: string, rows: [number, number], cols: [number, number] = [0, GRID.width - 1]) {
  const m = decodeMask(text)!;
  for (let i = 0; i < m.cells.length; i++) {
    if (!m.cells[i]) continue;
    const x = i % m.width;
    const y = Math.floor(i / m.width);
    if (y < rows[0] || y > rows[1] || x < cols[0] || x > cols[1]) return false;
  }
  return true;
}

describe("the easy visualizer, start to finish", () => {
  test("floor marked with one tap, walls left whole: the AI gets the floor's exact spot and the right tiles", async () => {
    const user = userEvent.setup();
    renderAt(`/visualize/${ROOM_ID}`);

    await heading("What do you want to tile?");
    expect(bigButton(/^Next/)).toBeDisabled();
    await user.click(bigButton(/^Floor/));
    await user.click(bigButton(/^Wall Any wall/));
    await user.click(bigButton(/^Next/));

    await heading("Show us the floor");
    // Before marking, the big button offers the whole floor.
    expect(bigButton(/Tile the whole floor/)).toBeEnabled();
    tapPhoto(320, 440);
    await user.click(await screen.findByRole("button", { name: /Next: pick the tile/ }));

    await heading("Pick a tile for the floor");
    // Only tiles that can go on a floor are offered (Tile 70 is a wall tile).
    expect(screen.queryByRole("button", { name: /^Tile 70,/ })).not.toBeInTheDocument();
    await user.click(bigButton(/^Tile 72,/));
    await user.click(bigButton(/^Next/));

    await heading("Show us the wall");
    await user.click(bigButton(/Tile the whole wall/));
    await heading("Pick a tile for the wall");
    await user.click(bigButton(/^Tile 70,/));
    await user.click(bigButton(/Next: check everything/));

    await heading("Check and make the real photo");
    const summary = screen.getByRole("listitem", { name: "Area 1: Floor" });
    expect(within(summary).getByText(/Marked on the photo/)).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "Area 2: Wall" })).getByText(/The whole wall/)).toBeInTheDocument();
    await user.click(bigButton(/Make the real photo/));

    await screen.findByText("Result page");
    const [floor, wall] = sentAreas();
    expect(floor).toMatchObject({ surface: "floor", location: "Marked floor", pattern: "single", tileIds: [tileId(72)] });
    // One tap coloured exactly the floor: all of it, nothing of the walls.
    expect(paintedWithin(floor!.mask!, [WALL_ROWS, GRID.height - 1])).toBe(true);
    expect(paintedCount(decodeMask(floor!.mask!)!)).toBe(GRID.width * (GRID.height - WALL_ROWS));
    expect(wall).toEqual({ surface: "wall", location: "All walls", pattern: "single", tileIds: [tileId(70)] });
    expect(lastJson(backend).requirements).toBe("");
  });

  test("two walls with two tiles: each must be marked, and each tap marks only its own wall", async () => {
    const user = userEvent.setup();
    renderAt(`/visualize/${ROOM_ID}`);
    await user.click(await screen.findByRole("button", { name: /^Wall Any wall/ }));
    await user.click(bigButton(/^Next/));
    await heading("Show us the wall");
    tapPhoto(100, 100); // the cream wall on the left
    await user.click(await screen.findByRole("button", { name: /Next: pick the tile/ }));
    await user.click(await screen.findByRole("button", { name: /^Tile 70,/ }));
    await user.click(bigButton(/Next: check everything/));

    await heading("Check and make the real photo");
    await user.click(screen.getByRole("button", { name: "+ Wall" }));
    await heading("Show us the wall");
    // A second wall can only be told apart by where it is: no skipping.
    expect(bigButton(/Next: pick the tile/)).toBeDisabled();
    expect(screen.getByText("Colour this wall on the photo first")).toBeInTheDocument();
    tapPhoto(540, 100); // the blue wall on the right
    await user.click(await screen.findByRole("button", { name: /Next: pick the tile/ }));
    await user.click(await screen.findByRole("button", { name: /^Tile 67,/ }));
    await user.click(bigButton(/Next: check everything/));
    await heading("Check and make the real photo");
    await user.click(bigButton(/Make the real photo/));

    await screen.findByText("Result page");
    const [left, right] = sentAreas();
    expect(left!.location).toBe("Marked wall");
    expect(right!.location).toBe("Marked wall 2");
    expect(paintedWithin(left!.mask!, [0, WALL_ROWS - 1], [0, 31])).toBe(true);
    expect(paintedWithin(right!.mask!, [0, WALL_ROWS - 1], [32, 63])).toBe(true);
  });

  test("painting, Less / More, Undo and Start again", async () => {
    const user = userEvent.setup();
    renderAt(`/visualize/${ROOM_ID}`);
    await user.click(await screen.findByRole("button", { name: /^Floor/ }));
    await user.click(bigButton(/^Next/));
    await heading("Show us the floor");

    tapPhoto(320, 440);
    expect(await screen.findByRole("group", { name: "Adjust the last fill" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /More/ }));
    expect(bigButton(/Next: pick the tile/)).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(bigButton(/Tile the whole floor/)).toBeInTheDocument();

    // Paint by hand, then undo it.
    await user.click(screen.getByRole("radio", { name: /Paint/ }));
    brush([
      [40, 400],
      [600, 400],
    ]);
    expect(await screen.findByRole("button", { name: /Next: pick the tile/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Undo/ }));
    expect(await screen.findByRole("button", { name: /Tile the whole floor/ })).toBeInTheDocument();

    // A brush stroke, then pick and send: the stroke is what the AI receives.
    brush([
      [40, 400],
      [600, 400],
    ]);
    await user.click(await screen.findByRole("button", { name: /Next: pick the tile/ }));
    await user.click(await screen.findByRole("button", { name: /^Tile 72,/ }));
    await user.click(bigButton(/Next: check everything/));
    await user.click(await screen.findByRole("button", { name: /Make the real photo/ }));
    await screen.findByText("Result page");
    const mask = decodeMask(sentAreas()[0]!.mask!)!;
    // y = 400 of 480 px is row 40 of 48; the thick brush covers a band around it.
    expect(mask.cells[40 * 64 + 32]).toBe(1);
    expect(mask.cells[10 * 64 + 32]).toBe(0);
  });

  test("a two-tile style asks for the second tile before going on", async () => {
    const user = userEvent.setup();
    renderAt(`/visualize/${ROOM_ID}`);
    await user.click(await screen.findByRole("button", { name: /^Floor/ }));
    await user.click(bigButton(/^Next/));
    await user.click(await screen.findByRole("button", { name: /Tile the whole floor/ }));
    await heading("Pick a tile for the floor");
    await user.click(bigButton(/^Tile 72,/));
    await user.click(screen.getByText(/Laying style:/));
    await user.click(screen.getByRole("radio", { name: /Chess board/ }));
    expect(bigButton(/Next: check everything/)).toBeDisabled();
    // The second slot is chosen next by itself.
    await user.click(bigButton(/^Tile 69,/));
    await user.click(bigButton(/Next: check everything/));
    await user.click(await screen.findByRole("button", { name: /Make the real photo/ }));
    await screen.findByText("Result page");
    expect(sentAreas()[0]).toMatchObject({ location: "Entire floor", pattern: "checkerboard", tileIds: [tileId(72), tileId(69)] });
  });

  test("the room is checked in the background when it has not been checked yet", async () => {
    delete backend.analyses[ROOM_ID];
    renderAt(`/visualize/${ROOM_ID}`);
    expect(await screen.findByText(/Room checked/)).toBeInTheDocument();
    expect(backend.analyzed).toEqual([ROOM_ID]);
  });

  test("short of credits: says so with Buy credits, and nothing is sent", async () => {
    backend.balance = 5;
    const user = userEvent.setup();
    renderAt(`/visualize/${ROOM_ID}`);
    await user.click(await screen.findByRole("button", { name: /^Floor/ }));
    await user.click(bigButton(/^Next/));
    await user.click(await screen.findByRole("button", { name: /Tile the whole floor/ }));
    await user.click(await screen.findByRole("button", { name: /^Tile 72,/ }));
    await user.click(bigButton(/Next: check everything/));
    expect(await screen.findByText(/Not enough credits/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buy credits" })).toHaveAttribute("href", "/credits");
    await user.click(bigButton(/Make the real photo/));
    expect(backend.generateBodies).toHaveLength(0);
  });

  test("a tile picked in the catalog ('Try in my space') is already on the first area it fits", async () => {
    const user = userEvent.setup();
    const t = backend.tiles.find((x) => x.name === "Tile 66")!;
    localStorage.setItem("tile-visualizer:workflow", JSON.stringify({ projectId: null, roomUploadId: null, analysis: null, selectedTile: t, selectedSurfaces: ["floor"] }));
    renderAt(`/visualize/${ROOM_ID}`);
    await user.click(await screen.findByRole("button", { name: /^Floor/ }));
    await user.click(bigButton(/^Next/));
    await user.click(await screen.findByRole("button", { name: /Tile the whole floor/ }));
    expect(await screen.findByRole("button", { name: /^Tile 66,/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("'Try another tile' on a result reopens its marks and tiles at the summary", async () => {
    const user = userEvent.setup();
    const cells = new Uint8Array(64 * 48);
    cells.fill(1, 30 * 64);
    const mask = encodeMask({ width: 64, height: 48, cells });
    const t72 = backend.tiles.find((x) => x.name === "Tile 72")!;
    renderAt(`/visualize/${ROOM_ID}`, { editDesign: { areas: [{ surface: "floor", location: "Marked floor", pattern: "single", patternNote: null, tileIds: [t72.id], mask }] }, editTiles: [t72], editRequirements: "dark grout" });
    await heading("Check and make the real photo");
    expect(screen.getByText(/Marked on the photo/)).toBeInTheDocument();
    expect(screen.getByLabelText("Note for the designer")).toHaveValue("dark grout");
    await user.click(bigButton(/Make the real photo/));
    await screen.findByText("Result page");
    expect(sentAreas()[0]!.mask).toBe(mask);
    expect(lastJson(backend).requirements).toBe("dark grout");
  });

  test("the summary survives a refresh", async () => {
    const user = userEvent.setup();
    const first = renderAt(`/visualize/${ROOM_ID}`);
    await user.click(await screen.findByRole("button", { name: /^Floor/ }));
    await user.click(bigButton(/^Next/));
    tapPhoto(320, 440);
    await user.click(await screen.findByRole("button", { name: /Next: pick the tile/ }));
    await user.click(await screen.findByRole("button", { name: /^Tile 72,/ }));
    first.unmount();
    renderAt(`/visualize/${ROOM_ID}`);
    await heading("Check and make the real photo");
    expect(screen.getByText(/Marked on the photo/)).toBeInTheDocument();
    expect(screen.getByText("Tile 72")).toBeInTheDocument();
  });
});

describe("taking the photo", () => {
  test("no name typed: the photo goes into 'My rooms', created once and then reused", async () => {
    const user = userEvent.setup();
    const first = renderAt("/upload");
    await user.upload(screen.getByLabelText("Choose a room photo"), new File(["x"], "room.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: /Use this photo/ }));
    await heading("What do you want to tile?");
    expect(backend.projects.map((p) => p.name)).toEqual(["My rooms"]);
    first.unmount();

    renderAt("/upload");
    await user.upload(screen.getByLabelText("Choose a room photo"), new File(["x"], "room2.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: /Use this photo/ }));
    await heading("What do you want to tile?");
    expect(backend.projects).toHaveLength(1);
    expect(backend.uploads.map((u) => u.projectId)).toEqual(["project-1", "project-1"]);
  });

  test("a file that is not a photo is refused with a plain message", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderAt("/upload");
    await user.upload(screen.getByLabelText("Choose a room photo"), new File(["x"], "notes.pdf", { type: "application/pdf" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use this photo/ })).not.toBeInTheDocument();
  });
});

describe("result page", () => {
  const VIZ = "33333333-3333-4333-8333-333333333333";
  function renderResult(design: unknown) {
    backend.extra = (url) =>
      url.pathname === `/api/visualizations/${VIZ}`
        ? { json: { visualization: { id: VIZ, roomUploadId: ROOM_ID, status: "completed", appliedSurfaces: ["floor"], design, designTiles: [], errorMessage: null, isOwner: true, createdAt: "2026-10-26T00:00:00Z", completedAt: "2026-10-26T00:00:00Z", resultImageUrl: "https://img.test/r.png" } } }
        : undefined;
    return render(
      <MemoryRouter initialEntries={[`/result/${VIZ}`]}>
        <AuthProvider>
          <WorkflowProvider>
            <Routes>
              <Route path="/result/:visualizationId" element={<ResultPage />} />
              <Route path="/visualize/:roomId" element={<p>Easy visualizer</p>} />
              <Route path="/tiles/:roomId" element={<p>Advanced studio</p>} />
            </Routes>
          </WorkflowProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  test("a painted design: 'Try another tile' goes back to the easy visualizer", async () => {
    const user = userEvent.setup();
    renderResult({ areas: [{ surface: "floor", location: "Marked floor", pattern: "single", patternNote: null, tileIds: [backend.tiles[0]!.id], mask: "8x8:w.w" }] });
    await user.click(await screen.findByRole("button", { name: "Try another tile" }));
    expect(await screen.findByText("Easy visualizer")).toBeInTheDocument();
  });

  test("an Advanced studio design still reopens in the Advanced studio", async () => {
    const user = userEvent.setup();
    renderResult({ layout: "c_shape", areas: [{ surface: "wall", location: "C1 (left wall)", wall: "C1", pattern: "single", patternNote: null, tileIds: [backend.tiles[0]!.id] }] });
    await user.click(await screen.findByRole("button", { name: "Edit Design / Try Another" }));
    expect(await screen.findByText("Advanced studio")).toBeInTheDocument();
  });
});
