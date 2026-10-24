import type { Mock } from "vitest";

/** The controllable Supabase auth stand-in installed by tests/setup.ts. */
export interface TestAuth {
  signedIn: { access_token: string; user: { id: string; email: string } };
  state: { session: unknown; listeners: Array<(event: string, session: unknown) => void> };
  emit: (event: string) => void;
  api: {
    signInWithPassword: Mock;
    resetPasswordForEmail: Mock;
    updateUser: Mock;
    signOut: Mock;
    resend: Mock;
  };
}

export const testAuth = (): TestAuth => (globalThis as unknown as { __testAuth: TestAuth }).__testAuth;
