import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { checkRateLimit } from "../../server/lib/rateLimit.js";
import {
  parseOrThrow,
  createTileBodySchema,
  updateTileBodySchema,
  deleteTileQuerySchema,
  setTileActiveBodySchema,
} from "../../server/lib/validation.js";
import { createTile, deleteOwnedTile, getOwnedTile, listOwnedTiles, setOwnedTileActive, updateOwnedTile } from "../../server/db/tiles.js";
import { validateTileImage } from "../../server/ai/imageValidation.js";
import { uploadImage, deleteImageQuietly } from "../../server/storage/imageStorage.js";
import { BUCKETS, tileImagePath } from "../../server/storage/buckets.js";
import { isOwnedPath } from "../../server/storage/ownedPath.js";
import { Errors } from "../../server/lib/apiError.js";

/**
 * Showroom catalog management. GET lists the caller's own tiles, POST adds one
 * with its photo, PUT edits one (optionally replacing the photo), PATCH
 * activates/deactivates, DELETE removes one that no visualization uses.
 * The owner always comes from the verified JWT, never from the request body,
 * and every write is filtered by owner_id in the query itself.
 */
export default createHandler({ methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], operation: "manageTiles" }, async (req: VercelRequest, res: VercelResponse) => {
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

  if (req.method === "DELETE") {
    const { tileId } = parseOrThrow(deleteTileQuerySchema, req.query);
    const removed = await deleteOwnedTile(user.id, tileId);
    if (!removed) throw Errors.tileNotFound();
    // Best-effort: the DB row is already gone; only touch a path inside the caller's own folder.
    if (isOwnedPath(removed.storagePath, user.id)) await deleteImageQuietly(BUCKETS.tileImages, removed.storagePath);
    res.status(200).json({ deleted: true, tileId });
    return;
  }

  if (req.method === "PUT") {
    checkRateLimit(`tileUpdate:${user.id}`, 120, 60 * 60 * 1000);
    const body = parseOrThrow(updateTileBodySchema, req.body);
    const existing = await getOwnedTile(user.id, body.tileId);
    if (!existing) throw Errors.tileNotFound();

    let newPath: string | undefined;
    if (body.base64Data && body.mimeType) {
      const image = { buffer: Buffer.from(body.base64Data, "base64"), mimeType: body.mimeType };
      validateTileImage(image);
      newPath = tileImagePath(user.id, randomUUID(), image.mimeType);
      await uploadImage(BUCKETS.tileImages, newPath, image.buffer, image.mimeType);
    }

    const { tileId, mimeType: _mime, base64Data: _data, ...fields } = body;
    let tile;
    try {
      tile = await updateOwnedTile(user.id, tileId, {
        ...fields,
        ...(fields.currency ? { currency: fields.currency.toUpperCase() } : {}),
        ...(newPath ? { storagePath: newPath } : {}),
      });
    } catch (err) {
      if (newPath) await deleteImageQuietly(BUCKETS.tileImages, newPath);
      throw err;
    }
    if (!tile) {
      if (newPath) await deleteImageQuietly(BUCKETS.tileImages, newPath);
      throw Errors.tileNotFound();
    }
    if (newPath && isOwnedPath(existing.storagePath, user.id)) await deleteImageQuietly(BUCKETS.tileImages, existing.storagePath);
    res.status(200).json({ tile });
    return;
  }

  // POST: create
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
      description: body.description,
      tileType: body.tileType,
      pattern: body.pattern,
      stockStatus: body.stockStatus,
      storagePath,
    });
  } catch (err) {
    await deleteImageQuietly(BUCKETS.tileImages, storagePath);
    throw err;
  }
  res.status(201).json({ tile });
});
