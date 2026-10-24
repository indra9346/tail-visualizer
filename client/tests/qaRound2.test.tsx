import { describe, expect, test, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { TilesPage } from "@/pages/TilesPage";
import { LoginPage } from "@/pages/LoginPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { MyTilesPage } from "@/pages/MyTilesPage";
import { PaymentsPage } from "@/pages/PaymentsPage";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { WorkflowProvider, useWorkflow } from "@/context/WorkflowContext";
import { AuthProvider } from "@/context/AuthContext";
import { installFakeBackend, makeAnalysis, ROOM_ID, type FakeBackend } from "./fakeBackend";
import { testAuth } from "./testAuth";

/** Round 2 of QA: what the two reviews and hands-on testing found, pinned through the real pages. */

function shell(ui: ReactNode, path: string, state?: unknown, routePattern?: string) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path.split("?")[0]!, search: path.includes("?") ? `?${path.split("?")[1]}` : "", state }]}>
      <AuthProvider>
        <WorkflowProvider>
          <Routes>
            <Route path={routePattern ?? path.split("?")[0]} element={ui} />
            <Route path="/projects" element={<p>Projects page</p>} />
          </Routes>
        </WorkflowProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}
const studio = (state?: unknown) => shell(<TilesPage />, `/tiles/${ROOM_ID}`, state, "/tiles/:roomId");
const chooseTemplate = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) =>
  user.click(screen.getByRole("radio", { name }));
const bar = () => screen.getByRole("button", { name: /Preview/ }).closest("div")!.parentElement!;

let backend: FakeBackend;
beforeEach(() => {
  backend = installFakeBackend();
});

describe("Design Studio", () => {
  test("if the room cannot be loaded it says so and 'Try again' recovers (never 'Loading…' for ever)", async () => {
    const user = userEvent.setup();
    let calls = 0;
    backend.extra = (url) => (url.pathname.endsWith("/analysis") && ++calls === 1 ? { status: 500, json: { error: { code: "INTERNAL_ERROR", message: "Server hiccup." } } } : undefined);
    studio();
    expect(await screen.findByText("Server hiccup.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Try again/i }));
    expect(await screen.findByRole("region", { name: "Area 1: Entire floor" })).toBeInTheDocument();
  });

  test("the bar says exactly what still blocks Preview", async () => {
    studio();
    await screen.findByRole("region", { name: "Area 1: Entire floor" });
    expect(within(bar()).getAllByText(/Entire floor: Choose the required tile: main tile\./).length).toBeGreaterThan(0);
  });

  test("short of credits: Preview stays tappable and leads to Buy Credits", async () => {
    const user = userEvent.setup();
    backend.balance = 0;
    backend.analyses[ROOM_ID] = makeAnalysis(ROOM_ID, ["floor"]);
    studio();
    expect(await screen.findByText(/Not enough credits/)).toBeInTheDocument();
    const preview = screen.getByRole("button", { name: /Preview/ });
    expect(preview).toBeEnabled();
    const floor = await screen.findByRole("region", { name: "Area 1: Entire floor" });
    await user.click(await within(floor).findByRole("button", { name: "Choose tile for main tile" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Search tiles"), "Tile 3");
    await user.click(await within(dialog).findByText("Tile 3", { exact: true }));
    await user.click(preview);
    expect(await screen.findByText("You've used all available credits.")).toBeInTheDocument();
    expect(backend.generateBodies).toHaveLength(0);
  });

  test("Staircase does not offer a second set of treads or risers; Washroom offers no loose 'Wall'", async () => {
    const user = userEvent.setup();
    studio();
    await screen.findByRole("region", { name: "Area 1: Entire floor" });
    await chooseTemplate(user, /^Staircase/);
    expect(screen.queryByRole("button", { name: "+ Step treads" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Step risers" })).not.toBeInTheDocument();

    await chooseTemplate(user, /^Washroom Box room/);
    expect(screen.queryByRole("button", { name: "+ Wall" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ Shower wall" }));
    const shower = await screen.findByRole("region", { name: /Shower walls/ });
    const options = within(within(shower).getByLabelText("Surface")).getAllByRole("option").map((o) => o.textContent);
    expect(options).not.toContain("Wall");
    expect(options).not.toContain("Floor");
  });

  test("numbered walls carry the same name as the switch list; clicking a kept wall in the 3D box says it was switched on", async () => {
    const user = userEvent.setup();
    studio();
    await screen.findByRole("region", { name: "Area 1: Entire floor" });
    await chooseTemplate(user, /^Washroom Box room/);
    expect(screen.getByRole("region", { name: /Back wall \(C2\)/ })).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: /Back wall \(C2\)/ }));
    await user.click(screen.getByRole("button", { name: /Back wall \(C2\): kept as in the photo\. Click to edit it\./ }));
    expect(await screen.findByText(/Back wall \(C2\) is now switched on for tiling/)).toBeInTheDocument();
  });

  test("'Edit design' of a kitchen result reopens the Kitchen template", async () => {
    const t = backend.tiles.find((x) => x.name === "Tile 1")!;
    studio({
      editDesign: {
        layout: "c_shape",
        areas: [
          { surface: "wall", location: "C1 (left wall)", wall: "C1", pattern: "single", patternNote: null, tileIds: [t.id] },
          { surface: "backsplash", location: "Kitchen backsplash", pattern: "single", patternNote: null, tileIds: [t.id] },
        ],
      },
      editTiles: [t],
    });
    await screen.findByRole("region", { name: /Left wall \(C1\)/ });
    expect(screen.getByRole("radio", { name: /^Kitchen/ })).toHaveAttribute("aria-checked", "true");
  });

  test("switching feet to metres and back gives back exactly what was typed", async () => {
    const user = userEvent.setup();
    studio();
    const floor = await screen.findByRole("region", { name: "Area 1: Entire floor" });
    await user.click(within(floor).getByText("Size and suggestions"));
    const [length, depth] = within(floor).getAllByRole("textbox").filter((i) => i.getAttribute("inputmode") === "decimal");
    await user.type(length!, "10");
    await user.type(depth!, "8");
    await user.click(within(floor).getByRole("radio", { name: "m" }));
    expect(length).toHaveValue("3.048");
    await user.click(within(floor).getByRole("radio", { name: "ft" }));
    expect(length).toHaveValue("10");
    expect(depth).toHaveValue("8");
  });

  test("a custom tile made for a floor slot can only be a floor (or floor and wall) tile", async () => {
    const user = userEvent.setup();
    studio();
    const floor = await screen.findByRole("region", { name: "Area 1: Entire floor" });
    await user.click(await within(floor).findByRole("button", { name: "Choose tile for main tile" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("tab", { name: "+ Add a custom tile" }));
    const options = within(within(dialog).getByLabelText("Use on *")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Floor", "Floor and wall"]);
  });
});

describe("sign-in and accounts", () => {
  test("'Create a free account' while already on /login switches the form", async () => {
    const user = userEvent.setup();
    testAuth().state.session = null;
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Link to="/login?mode=signup">menu: create account</Link>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Welcome Back" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "menu: create account" }));
    expect(await screen.findByRole("heading", { name: "Create Your Account" })).toBeInTheDocument();
  });

  test("'Forgot password?' emails a link that opens /reset-password", async () => {
    const user = userEvent.setup();
    testAuth().state.session = null;
    shell(<LoginPage />, "/login");
    await user.type(await screen.findByLabelText("Email Address"), "owner@sds.test");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(await screen.findByText(/a link to choose a new password is on its way/)).toBeInTheDocument();
    expect(testAuth().api.resetPasswordForEmail).toHaveBeenCalledWith("owner@sds.test", { redirectTo: `${window.location.origin}/reset-password` });
  });

  test("an unconfirmed account can ask for the confirmation email again on any visit", async () => {
    const user = userEvent.setup();
    testAuth().state.session = null;
    testAuth().api.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { message: "Email not confirmed" } });
    shell(<LoginPage />, "/login");
    await user.type(await screen.findByLabelText("Email Address"), "owner@sds.test");
    await user.type(screen.getByLabelText("Password"), "secret12");
    await user.click(screen.getByRole("button", { name: /Sign In/ }));
    await user.click(await screen.findByRole("button", { name: "Resend confirmation email" }));
    expect(testAuth().api.resend).toHaveBeenCalled();
  });

  test("the reset page sets the new password, and refuses two different ones", async () => {
    const user = userEvent.setup();
    shell(<ResetPasswordPage />, "/reset-password");
    await user.type(await screen.findByLabelText("New password"), "newpass1");
    await user.type(screen.getByLabelText("Repeat new password"), "newpass2");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(screen.getByText("The two passwords do not match.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Repeat new password"));
    await user.type(screen.getByLabelText("Repeat new password"), "newpass1");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText(/Your password has been changed/)).toBeInTheDocument();
    expect(testAuth().api.updateUser).toHaveBeenCalledWith({ password: "newpass1" });
  });

  test("signing out forgets the previous owner's selected tile and room", async () => {
    localStorage.setItem("tile-visualizer:workflow", JSON.stringify({ projectId: "p", roomUploadId: ROOM_ID, analysis: null, selectedTile: backend.tiles[0], selectedSurfaces: ["floor"] }));
    let seen: ReturnType<typeof useWorkflow> | null = null;
    function Probe() {
      seen = useWorkflow();
      return null;
    }
    render(
      <AuthProvider>
        <WorkflowProvider>
          <Probe />
        </WorkflowProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(seen!.selectedTile).not.toBeNull());
    await act(async () => {
      await testAuth().api.signOut();
    });
    await waitFor(() => expect(seen!.selectedTile).toBeNull());
    expect(seen!.roomUploadId).toBeNull();
  });
});

describe("other pages", () => {
  test("one broken page never blocks the app: the error screen clears when the owner goes elsewhere", async () => {
    function Boom(): JSX.Element {
      throw new Error("chunk failed");
    }
    // App.tsx keys the boundary by the current path; a new path clears the error.
    const view = render(
      <ErrorBoundary resetKey="/broken">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    view.rerender(
      <ErrorBoundary resetKey="/fine">
        <p>Fine page</p>
      </ErrorBoundary>,
    );
    expect(await screen.findByText("Fine page")).toBeInTheDocument();
  });

  test("My Tiles: a failed Hide keeps the catalog on screen and says what failed", async () => {
    const user = userEvent.setup();
    backend.extra = (url) => (url.pathname === "/api/tiles/manage" && backend.calls[backend.calls.length - 1]!.startsWith("PATCH") ? { status: 500, json: { error: { code: "INTERNAL_ERROR", message: "x" } } } : undefined);
    shell(<MyTilesPage />, "/my-tiles");
    const hides = await screen.findAllByRole("button", { name: "Hide" });
    await user.click(hides[0]!);
    expect(await screen.findByRole("alert")).toHaveTextContent(/x|couldn't hide/);
    expect(screen.getAllByRole("button", { name: "Hide" }).length).toBe(hides.length);
  });

  test("Payments: a checkout window opened but never paid reads 'not completed'", async () => {
    backend.payments = [{ id: "p1", providerOrderId: "o1", providerPaymentId: null, packageId: "starter", packageName: "Starter", amountPaise: 49900, currency: "INR", credits: 50, status: "created", createdAt: "2026-10-20T10:00:00Z", paidAt: null }];
    shell(<PaymentsPage />, "/payments");
    expect(await screen.findByText("not completed")).toBeInTheDocument();
  });
});
