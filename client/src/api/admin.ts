import { apiGet } from "./client";

export interface AdminOverview {
  users: { total: number; active_30d: number };
  credits: { purchased: number; consumed: number; reserved: number; outstanding: number };
  generations: { total: number; completed: number; failed: number };
  payments: { paid_count: number; paid_paise: number; failed_count: number; refunded_count: number };
  recent_transactions: Array<{ id: string; user_id: string; type: string; amount: number; balance_after: number; status: string; description: string; created_at: string }>;
  recent_errors: Array<{ id: string; user_id: string; error_message: string | null; created_at: string }>;
}

/** Returns null (rather than throwing) on 403 so the UI can simply hide the admin link for non-admins. */
export async function getAdminOverview(): Promise<AdminOverview | null> {
  try {
    return (await apiGet<{ overview: AdminOverview }>("/api/admin/overview")).overview;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "FORBIDDEN") return null;
    throw err;
  }
}
