import { createDispatcher } from "../server/lib/dispatch.js";
import summary from "./_routes/billingSummary.js";
import transactions from "./_routes/billingTransactions.js";
import payments from "./_routes/billingPayments.js";
import packages from "./_routes/billingPackages.js";
import checkout from "./_routes/billingCheckout.js";
import verify from "./_routes/billingVerify.js";
import adminOverview from "./_routes/adminOverview.js";

// Serves /api/billing/summary, /transactions, /payments, /packages, /checkout, /verify, /admin/overview.
export default createDispatcher({ summary, transactions, payments, packages, checkout, verify, adminOverview });
