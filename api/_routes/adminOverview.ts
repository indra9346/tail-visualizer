import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { isAdminUser } from "../../server/db/profiles.js";
import { getAdminOverview } from "../../server/db/billing.js";
import { Errors } from "../../server/lib/apiError.js";

/**
 * Admin-only aggregate stats (users, credits purchased/consumed, generation
 * success/failure, payment volume, recent transactions, recent generation
 * errors). Authorization is re-derived from the database on every request
 * (profiles.is_admin) — a client can never grant itself admin by sending
 * any request body/header, because nothing here reads one.
 */
export default createHandler({ methods: ["GET"], operation: "adminOverview" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  if (!(await isAdminUser(user.id))) throw Errors.forbidden();
  res.status(200).json({ overview: await getAdminOverview() });
});
