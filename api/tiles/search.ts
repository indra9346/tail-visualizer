import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { parseOrThrow, tilesSearchQuerySchema } from "../../server/lib/validation.js";
import { searchTiles } from "../../server/db/tiles.js";

/** Returns only real `tiles` rows — the catalog is the only product source of truth. */
export default createHandler({ methods: ["GET"], operation: "searchTiles" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);

  const filters = parseOrThrow(tilesSearchQuerySchema, req.query);
  const { tiles, total } = await searchTiles(filters, user.id);

  res.status(200).json({ tiles, page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, total });
});
