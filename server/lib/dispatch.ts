import type { VercelRequest, VercelResponse } from "@vercel/node";

export type RouteHandler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

/**
 * Vercel Hobby allows 12 Serverless Functions per deployment and every
 * file directly under api/ is one function. Instead of one file per URL,
 * a handful of dispatcher functions each serve a group of URLs. The public
 * URLs are unchanged: vercel.json rewrites e.g. /api/rooms/:id/analyze to
 * /api/rooms?op=analyze&id=:id, and the dispatcher picks the handler by
 * `op` (handlers under api/_routes/ are NOT functions — underscore-prefixed
 * paths are ignored by Vercel).
 *
 * `op` is client-controllable, so it is only ever used as an own-property
 * key into a fixed table. Every handler still authenticates and checks
 * ownership itself, so calling /api/x?op=y directly grants nothing extra.
 */
export function createDispatcher(routes: Record<string, RouteHandler>, defaultOp?: string): RouteHandler {
  return async function dispatcher(req, res) {
    const raw = req.query?.op;
    const op = (Array.isArray(raw) ? raw[0] : raw) ?? defaultOp;
    const handler = typeof op === "string" && Object.prototype.hasOwnProperty.call(routes, op) ? routes[op] : undefined;
    if (!handler) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } });
      return;
    }
    await handler(req, res);
  };
}
