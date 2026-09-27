import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { listActiveCreditPackages } from "../../server/db/billing.js";
import { billingConfig } from "../../server/billing/config.js";

export default createHandler({ methods: ["GET"], operation: "billingPackages" }, async (req: VercelRequest, res: VercelResponse) => {
  await authenticateRequest(req);
  res.status(200).json({ packages: await listActiveCreditPackages(), generationCreditCost: billingConfig.generationCreditCost });
});
