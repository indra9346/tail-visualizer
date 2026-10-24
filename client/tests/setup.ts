import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// A busy machine (or CI) can take more than the default 1 s to settle a page; waiting longer avoids false failures.
configure({ asyncUtilTimeout: 5000 });

// The browser Supabase client is replaced by a signed-in stand-in: no network, a fixed session, public tile URLs.
vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test-token", user: { id: "owner-1", email: "owner@sds.test" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://img.test/${p}` } }) }) },
  },
}));

// jsdom has no object URLs (photo previews).
URL.createObjectURL ??= () => "blob:test";
URL.revokeObjectURL ??= () => {};

// jsdom has no layout engine.
Element.prototype.scrollIntoView = function scrollIntoView() {};
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) as MediaQueryList;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
