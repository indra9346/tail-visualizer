import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { parseOrThrow, createProjectBodySchema, uuidSchema } from "../../server/lib/validation.js";
import { createProject, listProjectsForUser, deleteOwnedProject, verifyProjectOwnership } from "../../server/db/projects.js";
import { listRoomUploadsForProject } from "../../server/db/rooms.js";
import { listResultPathsForRooms } from "../../server/db/visualizations.js";
import { removeOwnedImagesQuietly } from "../../server/storage/cleanup.js";
import { BUCKETS } from "../../server/storage/buckets.js";
import { Errors } from "../../server/lib/apiError.js";
import { ensureProfile } from "../../server/db/profiles.js";

export default createHandler({ methods: ["GET", "POST", "DELETE"], operation: "projectsCollection" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);

  if (req.method === "GET") {
    const projects = await listProjectsForUser(user.id);
    res.status(200).json({
      projects: projects.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt })),
    });
    return;
  }

  if (req.method === "DELETE") {
    const projectId = parseOrThrow(uuidSchema, req.query.id);
    await verifyProjectOwnership(projectId, user.id);
    // Collect every stored file first: deleting the project cascades through its rooms and visualizations.
    const rooms = await listRoomUploadsForProject(projectId);
    const resultPaths = await listResultPathsForRooms(rooms.map((r) => r.id), user.id);
    if (!(await deleteOwnedProject(projectId, user.id))) throw Errors.projectNotFound();
    await removeOwnedImagesQuietly(BUCKETS.roomImages, rooms.map((r) => r.storagePath), user.id);
    await removeOwnedImagesQuietly(BUCKETS.generatedVisualizations, resultPaths, user.id);
    res.status(200).json({ deleted: true, projectId });
    return;
  }

  await ensureProfile(user.id);
  const body = parseOrThrow(createProjectBodySchema, req.body);
  const project = await createProject(user.id, body.name);

  res.status(201).json({
    project: { id: project.id, name: project.name, createdAt: project.createdAt },
  });
});
