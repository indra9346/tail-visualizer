/**
 * NOTE on mock ordering: ts-jest's CommonJS transform does not apply
 * Babel's jest.mock() hoisting, so `jest.mock(...)` calls must appear
 * textually BEFORE the `import` statements that pull in the mocked
 * module — TypeScript compiles imports to `require()` in source order.
 */
let authGetUserImpl: (token: string) => Promise<unknown> = async () => ({ data: { user: null }, error: { name: "unset" } });

jest.mock("../server/lib/supabaseServerClient", () => ({
  getSupabaseServerClient: () => ({
    auth: { getUser: (token: string) => authGetUserImpl(token) },
  }),
}));

import { authenticateRequest } from "../server/lib/auth";
import { makeReq } from "./helpers/fakeHttp";
import { ApiError } from "../server/lib/apiError";

describe("authenticateRequest", () => {
  test("rejects a request with no Authorization header", async () => {
    const req = makeReq({ headers: {} });
    await expect(authenticateRequest(req)).rejects.toBeInstanceOf(ApiError);
    await expect(authenticateRequest(req)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  test("rejects a malformed (non-Bearer) Authorization header", async () => {
    const req = makeReq({ headers: { authorization: "Basic abc123" } });
    await expect(authenticateRequest(req)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  test("rejects an invalid/expired JWT (Supabase returns an error)", async () => {
    authGetUserImpl = async () => ({ data: { user: null }, error: { name: "invalid_token" } });

    const req = makeReq({ headers: { authorization: "Bearer not-a-real-jwt" } });
    await expect(authenticateRequest(req)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  test("accepts a valid JWT and returns the authenticated user, never trusting a body-supplied user_id", async () => {
    authGetUserImpl = async () => ({ data: { user: { id: "real-user-id", email: "real@example.com" } }, error: null });

    const req = makeReq({
      headers: { authorization: "Bearer good-token" },
      body: { user_id: "attacker-supplied-id" },
    });
    const user = await authenticateRequest(req);
    expect(user.id).toBe("real-user-id");
    expect(user.id).not.toBe("attacker-supplied-id");
  });
});
