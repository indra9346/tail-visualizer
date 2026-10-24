import { describe, expect, test, beforeEach } from "vitest";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { TilesPage } from "@/pages/TilesPage";
import { WorkflowProvider, useWorkflow } from "@/context/WorkflowContext";
import { installFakeBackend, lastJson, makeAnalysis, OTHER_ROOM_ID, ROOM_ID, type FakeBackend } from "./fakeBackend";

/**
 * Integration tests for the Design Studio: the real page, workflow state, draft logic and API modules run in a
 * browser-like DOM; only the network is replaced (tests/fakeBackend.ts), and the generate request is checked
 * against the server's real schema.
 */

function renderStudio(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/tiles/${ROOM_ID}`, state }]}>
      <WorkflowProvider>
        <Routes>
          <Route path="/tiles/:roomId" element={<TilesPage />} />
          <Route path="/result/:visualizationId" element={<p>Result page</p>} />
          <Route path="/my-visualizations" element={<p>History page</p>} />
          <Route path="/analysis/:roomId" element={<p>Analysis page</p>} />
        </Routes>
      </WorkflowProvider>
    </MemoryRouter>,
  );
}

const area = (n: number, name: string) => screen.getByRole("region", { name: `Area ${n}: ${name}` });
const findArea = (n: number, name: string) => screen.findByRole("region", { name: `Area ${n}: ${name}` });
const tileById = (b: FakeBackend, n: number) => b.tiles.find((t) => t.name === `Tile ${n}`)!;

async function pickTile(user: ReturnType<typeof userEvent.setup>, region: HTMLElement, role: string, tileName: string) {
  await user.click(within(region).getByRole("button", { name: `Choose tile for ${role}` }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Search tiles"), tileName);
  await user.click(await within(dialog).findByText(tileName, { exact: true }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

let backend: FakeBackend;
beforeEach(() => {
  backend = installFakeBackend();
});

describe("Gowda's report: 'Another area already has the same surface and location'", () => {
  test("switching the 'All walls' area to Floor gives it a free floor name, never a duplicate", async () => {
    const user = userEvent.setup();
    renderStudio();
    const walls = await findArea(2, "All walls");
    await user.click(within(walls).getByRole("button", { name: /All walls/ }));
    await user.selectOptions(within(area(2, "All walls")).getByLabelText("Surface"), "floor");

    const moved = area(2, "Floor near entrance");
    // The name the other floor area uses is not offered again.
    expect(within(moved).getByRole("button", { name: "Entire floor" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Preview/ }));
    expect(screen.queryByText(/same surface and location|already named/)).not.toBeInTheDocument();
  });

  test("adding areas past the preset names never gives an empty or repeated name", async () => {
    const user = userEvent.setup();
    renderStudio();
    await findArea(1, "Entire floor");
    await user.click(screen.getByRole("button", { name: "+ Floor" }));
    await user.click(screen.getByRole("button", { name: "+ Floor" }));
    await user.click(screen.getByRole("button", { name: "+ Floor" }));
    expect(area(3, "Floor near entrance")).toBeInTheDocument();
    expect(area(4, "Shower floor area")).toBeInTheDocument();
    expect(area(5, "Floor 2")).toBeInTheDocument();
  });
});

describe("layouts match the surface", () => {
  test("a floor offers no Dado or Highlighter strip; a wall does", async () => {
    const user = userEvent.setup();
    renderStudio();
    const floor = await findArea(1, "Entire floor");
    const floorLayouts = within(floor).getByRole("radiogroup", { name: "Layout pattern" });
    expect(within(floorLayouts).queryByRole("radio", { name: /Dado/ })).not.toBeInTheDocument();
    expect(within(floorLayouts).queryByRole("radio", { name: /Highlighter strip/ })).not.toBeInTheDocument();
    expect(within(floorLayouts).getByRole("radio", { name: /Vertical stripes/ })).toBeInTheDocument();

    await user.click(within(area(2, "All walls")).getByRole("button", { name: /All walls/ }));
    const wallLayouts = within(area(2, "All walls")).getByRole("radiogroup", { name: "Layout pattern" });
    expect(within(wallLayouts).getByRole("radio", { name: /Dado/ })).toBeInTheDocument();
  });

  test("floor bands are named front to back", async () => {
    const user = userEvent.setup();
    renderStudio();
    const floor = await findArea(1, "Entire floor");
    await user.click(within(floor).getByRole("radio", { name: /Horizontal bands/ }));
    expect(within(area(1, "Entire floor")).getByRole("button", { name: "Choose tile for front band (nearest the camera)" })).toBeInTheDocument();
  });
});

describe("the tile picker sees the whole catalog", () => {
  test("the oldest tile (on page 2 of the catalog) can be found and chosen", async () => {
    const user = userEvent.setup();
    renderStudio();
    const floor = await findArea(1, "Entire floor");
    await pickTile(user, floor, "main tile", "Tile 3");
    expect(within(area(1, "Entire floor")).getByText("Tile 3")).toBeInTheDocument();
    expect(backend.calls).toContain("GET /api/tiles/search?page=2&pageSize=50");
  });
});

describe("Preview sends a design the server accepts", () => {
  test("a finished two-area design reaches the result page; an empty requirements box is sent as empty", async () => {
    const user = userEvent.setup();
    renderStudio();
    await pickTile(user, await findArea(1, "Entire floor"), "main tile", "Tile 3");
    await user.click(within(area(2, "All walls")).getByRole("button", { name: /All walls/ }));
    await pickTile(user, area(2, "All walls"), "main tile", "Tile 1");
    await user.click(screen.getByRole("button", { name: /Preview/ }));

    expect(await screen.findByText("Result page")).toBeInTheDocument();
    const body = lastJson(backend);
    expect(body.requirements).toBe("");
    expect(body.design).toEqual({
      areas: [
        { surface: "floor", location: "Entire floor", pattern: "single", tileIds: [tileById(backend, 3).id] },
        { surface: "wall", location: "All walls", pattern: "single", tileIds: [tileById(backend, 1).id] },
      ],
    });
  });

  test("a design already being generated (double tap) goes to History instead of showing an error", async () => {
    const user = userEvent.setup();
    backend.generateError = { status: 409, code: "GENERATION_IN_PROGRESS", message: "already" };
    backend.analyses[ROOM_ID] = makeAnalysis(ROOM_ID, ["floor"]);
    renderStudio();
    await pickTile(user, await findArea(1, "Entire floor"), "main tile", "Tile 3");
    await user.click(screen.getByRole("button", { name: /Preview/ }));
    expect(await screen.findByText("History page")).toBeInTheDocument();
  });

  test("when credits run out the real balance is fetched again and Buy Credits is offered", async () => {
    const user = userEvent.setup();
    backend.generateError = { status: 402, code: "INSUFFICIENT_CREDITS", message: "no credits" };
    backend.analyses[ROOM_ID] = makeAnalysis(ROOM_ID, ["floor"]);
    renderStudio();
    await pickTile(user, await findArea(1, "Entire floor"), "main tile", "Tile 3");
    backend.balance = 0;
    await user.click(screen.getByRole("button", { name: /Preview/ }));
    expect(await screen.findByText("You've used all available credits.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Balance: 0/)).toBeInTheDocument());
  });
});

describe("the right room, the right tiles, nothing lost", () => {
  test("a cached analysis of ANOTHER room is ignored: this room's own analysis seeds the design", async () => {
    localStorage.setItem(
      "tile-visualizer:workflow",
      JSON.stringify({ projectId: null, roomUploadId: OTHER_ROOM_ID, analysis: makeAnalysis(OTHER_ROOM_ID, ["step_tread", "step_riser"]), selectedTile: null, selectedSurfaces: [] }),
    );
    backend.analyses[ROOM_ID] = makeAnalysis(ROOM_ID, ["floor"]);
    renderStudio();
    expect(await findArea(1, "Entire floor")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /All stair treads/ })).not.toBeInTheDocument();
    expect(backend.calls).toContain(`GET /api/rooms/${ROOM_ID}/analysis`);
  });

  test("'Try in my space': the tile picked in the catalog is placed once, then forgotten", async () => {
    localStorage.setItem(
      "tile-visualizer:workflow",
      JSON.stringify({ projectId: null, roomUploadId: ROOM_ID, analysis: null, selectedTile: tileById(backend, 3), selectedSurfaces: ["floor"] }),
    );
    renderStudio();
    const floor = await findArea(1, "Entire floor");
    expect(within(floor).getByText("Tile 3")).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("tile-visualizer:workflow")!).selectedTile).toBeNull());
  });

  test("'Edit design' on a result reopens that design with its layout, tiles and requirements", async () => {
    const a = tileById(backend, 3);
    const b = tileById(backend, 6);
    renderStudio({
      editDesign: { areas: [{ surface: "floor", location: "Bathroom floor", pattern: "checkerboard", patternNote: null, tileIds: [a.id, b.id] }] },
      editTiles: [a, b],
      editRequirements: "Keep the basin as it is.",
    });
    const floor = await findArea(1, "Bathroom floor");
    expect(within(floor).getByRole("radio", { name: /Checkerboard/ })).toHaveAttribute("aria-checked", "true");
    expect(within(floor).getByText("Tile 3")).toBeInTheDocument();
    expect(within(floor).getByText("Tile 6")).toBeInTheDocument();
    expect(screen.getByLabelText(/Describe Your Requirements/)).toHaveValue("Keep the basin as it is.");
    expect(screen.queryByRole("region", { name: /All walls/ })).not.toBeInTheDocument();
  });

  test("'Edit design' from History (no tile details) finds the tiles in the catalog", async () => {
    const a = tileById(backend, 3);
    renderStudio({ editDesign: { areas: [{ surface: "floor", location: "Entire floor", pattern: "single", patternNote: null, tileIds: [a.id] }] }, editRequirements: "" });
    const floor = await findArea(1, "Entire floor");
    await waitFor(() => expect(within(floor).getByText("Tile 3")).toBeInTheDocument());
  });

  test("the requirements text survives leaving and reopening the page", async () => {
    const user = userEvent.setup();
    const first = renderStudio();
    await findArea(1, "Entire floor");
    await user.type(screen.getByLabelText(/Describe Your Requirements/), "Matt finish only");
    first.unmount();
    renderStudio();
    await findArea(1, "Entire floor");
    expect(screen.getByLabelText(/Describe Your Requirements/)).toHaveValue("Matt finish only");
  });
});

describe("workflow state", () => {
  const wrapper = ({ children }: { children: ReactNode }) => <WorkflowProvider>{children}</WorkflowProvider>;

  test("setRoom then setAnalysis in a row never undo each other (no stale copy of the state)", () => {
    const { result } = renderHook(() => useWorkflow(), { wrapper });
    act(() => {
      result.current.setRoom(ROOM_ID);
      result.current.setAnalysis(makeAnalysis(ROOM_ID));
    });
    expect(result.current.roomUploadId).toBe(ROOM_ID);
    expect(result.current.analysis?.roomUploadId).toBe(ROOM_ID);
  });

  test("uploading a room keeps the tile picked in the catalog; a new room drops the old analysis", () => {
    const { result } = renderHook(() => useWorkflow(), { wrapper });
    const tile = installFakeBackend().tiles[0]!;
    act(() => result.current.selectTile(tile));
    act(() => result.current.setAnalysis(makeAnalysis(OTHER_ROOM_ID)));
    act(() => result.current.setRoom(ROOM_ID));
    expect(result.current.selectedTile?.id).toBe(tile.id);
    expect(result.current.analysis).toBeNull();
    act(() => result.current.clearSelectedTile());
    expect(result.current.selectedTile).toBeNull();
  });
});
