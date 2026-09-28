import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { parseOrThrow, uuidSchema, setVisualizationVisibilityBodySchema } from "../../server/lib/validation.js";
import { setVisualizationVisibility } from "../../server/db/visualizations.js";

/**
 * Owner-only toggle: lets a signed-in user mark their OWN visualization
 * public (visible on the signed-out "My Visualizations" feed) or private
 * again. setVisualizationVisibility enforces ownership in the query itself
 * (`.eq("user_id", userId)`), so this can never touch another user's row.
 */
export default createHandler({ methods: ["PATCH"], operation: "setVisualizationVisibility" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const visualizationId = parseOrThrow(uuidSchema, req.query.id);
  const { isPublic } = parseOrThrow(setVisualizationVisibilityBodySchema, req.body);

  const updated = await setVisualizationVisibility(visualizationId, user.id, isPublic);

  res.status(200).json({ visualization: { id: updated.id, isPublic: updated.isPublic } });
});
