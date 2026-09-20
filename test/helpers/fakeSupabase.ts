/**
 * Minimal fluent-chain mock for @supabase/supabase-js's query builder.
 * Every chained method call (.select/.eq/.in/.order/.range/...) returns
 * the same proxy; `await`-ing it or calling `.single()`/`.maybeSingle()`
 * resolves to the preset `result` for that table.
 */
export function chainable(result: unknown): any {
  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === "maybeSingle" || prop === "single") {
          return () => Promise.resolve(result);
        }
        return (..._args: unknown[]) => proxy;
      },
    },
  );
  return proxy;
}

export interface FakeSupabaseConfig {
  /** table name -> canned { data, error, count } result for any query against it */
  tables?: Record<string, unknown>;
  authGetUser?: (token: string) => Promise<unknown>;
  storage?: {
    upload?: (bucket: string, path: string) => Promise<unknown>;
    download?: (bucket: string, path: string) => Promise<unknown>;
    createSignedUrl?: (bucket: string, path: string) => Promise<unknown>;
    remove?: (bucket: string, paths: string[]) => Promise<unknown>;
  };
}

export function createFakeSupabaseClient(config: FakeSupabaseConfig) {
  return {
    from(table: string) {
      const result = config.tables?.[table] ?? { data: null, error: null, count: 0 };
      return chainable(result);
    },
    auth: {
      getUser: async (token: string) => (config.authGetUser ? config.authGetUser(token) : { data: null, error: { name: "no_mock" } }),
    },
    storage: {
      from: (bucket: string) => ({
        upload: (path: string) => config.storage?.upload?.(bucket, path) ?? Promise.resolve({ data: {}, error: null }),
        download: (path: string) => config.storage?.download?.(bucket, path) ?? Promise.resolve({ data: null, error: null }),
        createSignedUrl: (path: string) =>
          config.storage?.createSignedUrl?.(bucket, path) ?? Promise.resolve({ data: { signedUrl: "https://example.test/signed" }, error: null }),
        remove: (paths: string[]) => config.storage?.remove?.(bucket, paths) ?? Promise.resolve({ data: {}, error: null }),
      }),
    },
  };
}
