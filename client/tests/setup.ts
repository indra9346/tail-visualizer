import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// A busy machine (or CI) can take more than the default 1 s to settle a page; waiting longer avoids false failures.
configure({ asyncUtilTimeout: 5000 });

/**
 * The browser Supabase client is replaced by a signed-in stand-in: no network, public tile URLs, and an auth API the
 * tests can drive (tests/testAuth.ts): sign out, failed sign-in, password reset.
 */
const auth = vi.hoisted(() => {
  const signedIn = { access_token: "test-token", user: { id: "owner-1", email: "owner@sds.test" } };
  const state = { session: signedIn as unknown, listeners: [] as Array<(event: string, session: unknown) => void> };
  const emit = (event: string) => state.listeners.forEach((l) => l(event, state.session));
  return {
    signedIn,
    state,
    emit,
    api: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        state.listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => (state.listeners = state.listeners.filter((l) => l !== cb)) } } };
      },
      signInWithPassword: vi.fn(async () => ({ data: {}, error: null as null | { message: string } })),
      signUp: vi.fn(async () => ({ data: { user: null, session: null }, error: null })),
      resend: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null as null | { message: string } })),
      updateUser: vi.fn(async () => ({ data: {}, error: null as null | { message: string } })),
      signOut: vi.fn(async () => {
        state.session = null;
        emit("SIGNED_OUT");
      }),
    },
  };
});
(globalThis as { __testAuth?: typeof auth }).__testAuth = auth;

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: auth.api,
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
  auth.state.session = auth.signedIn;
  auth.state.listeners = [];
  Object.values(auth.api).forEach((f) => "mockClear" in f && (f as { mockClear: () => void }).mockClear());
});
