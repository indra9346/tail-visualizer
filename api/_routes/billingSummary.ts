import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { getBillingSummary } from "../../server/db/billing.js";

export default createHandler({ methods: ["GET"], operation: "billingSummary" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  res.status(200).json({ summary: await getBillingSummary(user.id) });
});
