import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { checkRateLimit } from "../../server/lib/rateLimit.js";
import { parseOrThrow, createTileBodySchema, setTileActiveBodySchema } from "../../server/lib/validation.js";
import { createTile, listOwnedTiles, setOwnedTileActive } from "../../server/db/tiles.js";
import { validateTileImage } from "../../server/ai/imageValidation.js";
import { uploadImage, deleteImageQuietly } from "../../server/storage/imageStorage.js";
import { BUCKETS, tileImagePath } from "../../server/storage/buckets.js";
import { Errors } from "../../server/lib/apiError.js";

/**
 * Showroom catalog management (a single function, to stay within the Vercel
 * Hobby 12-function limit): GET lists the caller's own tiles, POST adds one
 * with its photo, PATCH activates/deactivates. The owner always comes from
 * the verified JWT, never from the request body.
 */
export default createHandler({ methods: ["GET", "POST", "PATCH"], operation: "manageTiles" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);

  if (req.method === "GET") {
    res.status(200).json({ tiles: await listOwnedTiles(user.id) });
    return;
  }

  if (req.method === "PATCH") {
    const body = parseOrThrow(setTileActiveBodySchema, req.body);
    const tile = await setOwnedTileActive(user.id, body.tileId, body.isActive);
    if (!tile) throw Errors.tileNotFound();
    res.status(200).json({ tile });
    return;
  }

  checkRateLimit(`tileCreate:${user.id}`, 60, 60 * 60 * 1000);
  const body = parseOrThrow(createTileBodySchema, req.body);

  const image = { buffer: Buffer.from(body.base64Data, "base64"), mimeType: body.mimeType };
  validateTileImage(image); // file signature + size, never the browser's claim

  const tileId = randomUUID();
  const storagePath = tileImagePath(user.id, tileId, image.mimeType);
  await uploadImage(BUCKETS.tileImages, storagePath, image.buffer, image.mimeType);

  let tile;
  try {
    tile = await createTile(user.id, {
      id: tileId,
      sku: body.sku && body.sku.length > 0 ? body.sku : `T-${tileId.slice(0, 8).toUpperCase()}`,
      name: body.name,
      brand: body.brand,
      category: body.category,
      material: body.material,
      finish: body.finish,
      colorFamily: body.colorFamily,
      sizeMm: body.sizeMm,
      pricePerSqft: body.pricePerSqft,
      currency: body.currency.toUpperCase(),
      suitableRooms: body.suitableRooms,
      storagePath,
    });
  } catch (err) {
    await deleteImageQuietly(BUCKETS.tileImages, storagePath);
    throw err;
  }
  res.status(201).json({ tile });
});
