import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { parseOrThrow, createProjectBodySchema } from "../../server/lib/validation.js";
import { createProject, listProjectsForUser } from "../../server/db/projects.js";
import { ensureProfile } from "../../server/db/profiles.js";

export default createHandler({ methods: ["GET", "POST"], operation: "projectsCollection" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);

  if (req.method === "GET") {
    const projects = await listProjectsForUser(user.id);
    res.status(200).json({
      projects: projects.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt })),
    });
    return;
  }

  await ensureProfile(user.id);
  const body = parseOrThrow(createProjectBodySchema, req.body);
  const project = await createProject(user.id, body.name);

  res.status(201).json({
    project: { id: project.id, name: project.name, createdAt: project.createdAt },
  });
});
