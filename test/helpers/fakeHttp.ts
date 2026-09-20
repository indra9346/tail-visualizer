export function makeReq(opts: { method?: string; headers?: Record<string, string>; body?: unknown; query?: Record<string, unknown> }) {
  return {
    method: opts.method ?? "GET",
    headers: opts.headers ?? {},
    body: opts.body,
    query: opts.query ?? {},
  } as any;
}

export function makeRes() {
  const res: any = {
    statusCode: 200,
    _json: undefined as unknown,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res._json = payload;
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
  };
  return res;
}
