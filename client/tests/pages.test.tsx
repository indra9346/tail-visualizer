import { describe, expect, test, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CheckoutClosedError, PaymentWidgetError, loadRazorpayCheckoutScript, openRazorpayCheckout, type CheckoutInfo } from "@/api/billing";
import { UploadPage } from "@/pages/UploadPage";
import { TileCatalogPage } from "@/pages/TileCatalogPage";
import { CalculatorPage } from "@/pages/CalculatorPage";
import { VisualizationHistory } from "@/components/history/VisualizationHistory";
import { WorkflowProvider } from "@/context/WorkflowContext";
import { AuthProvider } from "@/context/AuthContext";
import type { Visualization } from "@/api/types";
import { installFakeBackend, type FakeBackend } from "./fakeBackend";

// jsdom cannot draw on a canvas; the photo is sent as chosen.
vi.mock("@/lib/imagePreprocess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/imagePreprocess")>()),
  preprocessRoomImage: async (file: File) => file,
}));

let backend: FakeBackend;
beforeEach(() => {
  backend = installFakeBackend();
});

const page = (ui: React.ReactNode, path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <WorkflowProvider>
          <Routes>
            <Route path={path} element={ui} />
            <Route path="/analysis/:roomId" element={<p>Analysis page</p>} />
          </Routes>
        </WorkflowProvider>
      </AuthProvider>
    </MemoryRouter>,
  );

describe("Razorpay checkout", () => {
  const checkout: CheckoutInfo = { orderId: "order_1", amountPaise: 9900, currency: "INR", keyId: "rzp_test", packageName: "Starter", credits: 50, paymentId: "p1" };
  type Options = { handler: (r: unknown) => void; modal: { ondismiss: () => void } };
  function fakeRazorpay(script: (opts: Options, fire: (event: string) => void) => void) {
    vi.stubGlobal(
      "Razorpay",
      class {
        private listeners: Record<string, () => void> = {};
        constructor(private opts: Options) {}
        on(event: string, cb: () => void) {
          this.listeners[event] = cb;
        }
        open() {
          script(this.opts, (event) => this.listeners[event]?.());
        }
      },
    );
  }

  test("a failed attempt followed by a successful one in the same window is still reported as paid", async () => {
    const success = { razorpay_order_id: "order_1", razorpay_payment_id: "pay_2", razorpay_signature: "sig" };
    fakeRazorpay((opts, fire) => {
      fire("payment.failed"); // e.g. UPI declined; Razorpay offers a retry
      opts.handler(success); // the card works
    });
    await expect(openRazorpayCheckout(checkout, undefined)).resolves.toEqual(success);
  });

  test("closing the window after a failure says nothing was charged", async () => {
    fakeRazorpay((opts, fire) => {
      fire("payment.failed");
      opts.modal.ondismiss();
    });
    const err = await openRazorpayCheckout(checkout, undefined).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CheckoutClosedError);
    expect((err as Error).message).toMatch(/did not go through.*No charge/);
  });

  test("a payment script that failed to load is tried again on the next Buy", async () => {
    const first = loadRazorpayCheckoutScript();
    const firstScript = document.querySelector('script[src*="checkout.razorpay.com"]')!;
    firstScript.dispatchEvent(new Event("error"));
    await expect(first).rejects.toBeInstanceOf(PaymentWidgetError);

    const second = loadRazorpayCheckoutScript();
    const scripts = document.querySelectorAll('script[src*="checkout.razorpay.com"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toBe(firstScript);
    scripts[0]!.dispatchEvent(new Event("load"));
    await expect(second).resolves.toBeUndefined();
  });
});

describe("upload", () => {
  test("retrying after a failed upload reuses the new project instead of creating another", async () => {
    const user = userEvent.setup();
    let projectsCreated = 0;
    let uploads = 0;
    backend.extra = (url) => {
      if (url.pathname === "/api/projects" && backend.calls[backend.calls.length - 1]!.startsWith("POST")) {
        projectsCreated++;
        return { json: { project: { id: `project-${projectsCreated}`, name: "Master Bath", createdAt: "2026-10-24T00:00:00Z" } } };
      }
      if (url.pathname === "/api/projects") return { json: { projects: [] } };
      if (url.pathname === "/api/rooms/upload") {
        uploads++;
        return uploads === 1
          ? { status: 500, json: { error: { code: "INTERNAL_ERROR", message: "Network hiccup." } } }
          : { json: { room: { id: "room-9", projectId: "project-1", status: "uploaded", createdAt: "2026-10-24T00:00:00Z" } } };
      }
      return undefined;
    };
    const { container } = page(<UploadPage />, "/upload");
    await user.type(await screen.findByLabelText("New project name"), "Master Bath");
    const input = container.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    await user.upload(input, new File(["x"], "room.jpg", { type: "image/jpeg" }));

    await user.click(screen.getByRole("button", { name: /Analyze Space/ }));
    expect(await screen.findByText("Network hiccup.")).toBeInTheDocument();
    expect(screen.getByLabelText("Select an existing project")).toHaveValue("project-1");

    await user.click(screen.getByRole("button", { name: /Analyze Space/ }));
    expect(await screen.findByText("Analysis page")).toBeInTheDocument();
    expect(projectsCreated).toBe(1);
  });
});

describe("tile catalog", () => {
  test("every tile can be reached: 'Show more tiles' adds the next page", async () => {
    const user = userEvent.setup();
    page(<TileCatalogPage />, "/tiles");
    expect(await screen.findByText("72 tiles found, showing 20")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show more tiles (52 more)" }));
    expect(await screen.findByText("72 tiles found, showing 40")).toBeInTheDocument();
    expect(screen.getByText("Tile 33")).toBeInTheDocument();
  });

  test("a slow reply for an earlier search never replaces the results of the latest one", async () => {
    const user = userEvent.setup();
    let releaseSlow!: () => void;
    const slow = new Promise<void>((r) => (releaseSlow = r));
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("q=T&")) await slow; // the reply for the first letter arrives last
      return realFetch(input, init);
    });
    page(<TileCatalogPage />, "/tiles");
    await screen.findByText("72 tiles found, showing 20");
    const search = screen.getByPlaceholderText(/search/i);
    await user.type(search, "Tile 71");
    expect(await screen.findByText("1 tile found")).toBeInTheDocument();
    releaseSlow();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("1 tile found")).toBeInTheDocument();
  });
});

describe("design history", () => {
  const viz = (n: number): Visualization => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    roomUploadId: "room-1",
    status: "completed",
    appliedSurfaces: ["floor"],
    design: { areas: [{ surface: "floor", location: `Design ${n}`, pattern: "single", patternNote: null, tileIds: [] }] },
    errorMessage: null,
    createdAt: new Date(Date.UTC(2026, 9, 24) - n * 3_600_000).toISOString(),
    completedAt: null,
    resultImageUrl: null,
  });

  test("history no longer stops at 50: older designs load below", async () => {
    const user = userEvent.setup();
    backend.history = Array.from({ length: 60 }, (_, i) => viz(i + 1));
    page(<VisualizationHistory />, "/my-visualizations");
    const list = await screen.findByRole("complementary", { name: "Design history" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(50));
    await user.click(within(list).getByRole("button", { name: "Show older designs" }));
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(60));
    expect(within(list).queryByRole("button", { name: "Show older designs" })).not.toBeInTheDocument();
  });
});

describe("tile calculator", () => {
  test("'+ New' resets the laying style, and a saved herringbone job reopens as herringbone", async () => {
    const user = userEvent.setup();
    page(<CalculatorPage />, "/calculator");
    await user.type(await screen.findByLabelText(/^Length/), "10");
    await user.type(screen.getByLabelText(/^Width \/ height/), "8");
    await user.selectOptions(screen.getByLabelText(/Laying pattern/), "herringbone");
    await user.click(screen.getByRole("button", { name: "Save to history" }));

    await user.click(screen.getByRole("button", { name: "+ New" }));
    expect(screen.getByLabelText(/Laying pattern/)).toHaveValue("straight");

    const saved = await screen.findAllByRole("button", { name: /^Floor · 600x600/ });
    await user.click(saved[0]!);
    expect(screen.getByLabelText(/Laying pattern/)).toHaveValue("herringbone");
  });
});
