import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../../server/lib/auth.js";
import { parseOrThrow, uuidSchema } from "../../../server/lib/validation.js";
import { verifyProjectOwnership } from "../../../server/db/projects.js";
import { listRoomUploadsForProject } from "../../../server/db/rooms.js";
import { createSignedUrl } from "../../../server/storage/imageStorage.js";
import { BUCKETS } from "../../../server/storage/buckets.js";

/** Supports the Saved Projects dashboard: real room uploads for a project the caller owns, with signed thumbnails. */
export default createHandler({ methods: ["GET"], operation: "listProjectRooms" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const projectId = parseOrThrow(uuidSchema, req.query.id);

  await verifyProjectOwnership(projectId, user.id);
  const rooms = await listRoomUploadsForProject(projectId);

  const withThumbnails = await Promise.all(
    rooms.map(async (room) => ({
      id: room.id,
      status: room.status,
      errorMessage: room.errorMessage,
      createdAt: room.createdAt,
      imageUrl: await createSignedUrl(BUCKETS.roomImages, room.storagePath, user.id),
    })),
  );

  res.status(200).json({ rooms: withThumbnails });
});
