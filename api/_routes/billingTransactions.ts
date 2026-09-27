import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { listCreditTransactions } from "../../server/db/billing.js";

export default createHandler({ methods: ["GET"], operation: "billingTransactions" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  res.status(200).json({ transactions: await listCreditTransactions(user.id) });
});
