/**
 * Regression test for a PostgREST filter-injection issue in searchTiles():
 * the free-text `q` filter was interpolated raw into a hand-built
 * `.or(...)` string. `,` and `(`/`)` are clause/group delimiters in
 * PostgREST's filter grammar, so an attacker-supplied search term
 * containing them could inject additional OR-ed filter clauses into the
 * query. This is not classic SQL injection (supabase-js always
 * parameterizes the underlying SQL) but is a real filter-logic
 * manipulation vector, fixed by stripping those delimiter characters
 * before interpolation.
 */
import { sanitizePostgrestFilterValue } from "../server/db/tiles";

let capturedOrFilter: string | null = null;

function chainable(): any {
  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
        }
        if (prop === "or") {
          return (filterString: string) => {
            capturedOrFilter = filterString;
            return proxy;
          };
        }
        return (..._args: unknown[]) => proxy;
      },
    },
  );
  return proxy;
}

jest.mock("../server/lib/supabaseServerClient", () => ({
  getSupabaseServerClient: () => ({ from: () => chainable() }),
}));

import { searchTiles } from "../server/db/tiles";

describe("searchTiles — PostgREST filter injection", () => {
  beforeEach(() => {
    capturedOrFilter = null;
  });

  test("sanitizePostgrestFilterValue strips clause-delimiter characters", () => {
    expect(sanitizePostgrestFilterValue("x,category.eq.wall")).toBe("xcategory.eq.wall");
    expect(sanitizePostgrestFilterValue("normal search")).toBe("normal search");
    expect(sanitizePostgrestFilterValue("a(b)c")).toBe("abc");
  });

  test("a malicious search term cannot inject an additional OR clause into the query sent to PostgREST", async () => {
    const maliciousInput = "x,category.eq.wall,or(is_active.eq.false";

    await searchTiles({ q: maliciousInput, page: 1, pageSize: 20 });

    expect(capturedOrFilter).not.toBeNull();
    // The delimiter characters that would have split this into extra
    // clauses are gone — only the intended three ilike clauses remain,
    // each still containing the literal (now-harmless) search text.
    expect(capturedOrFilter).not.toMatch(/,category\.eq\.wall,or\(/);
    expect(capturedOrFilter!.split(",")).toHaveLength(3); // name/brand/sku — no injected 4th clause
  });
});
