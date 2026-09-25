import { supabase } from "@/lib/supabaseClient";
import type { ApiErrorPayload } from "./types";
import { ImagePreprocessError } from "@/lib/imagePreprocess";

/**
 * ApiClientError carries the parsed { code, message } from the server's
 * consistent error shape (see server/lib/apiError.ts). Never carries a
 * stack trace or any internal detail — there isn't one to carry, because
 * the API never sends one.
 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function parseErrorResponse(res: Response): Promise<ApiClientError> {
  // Vercel rejects bodies over 4.5 MB before our code runs, with a non-JSON 413.
  if (res.status === 413) {
    return new ApiClientError(413, "PAYLOAD_TOO_LARGE", "This image is too large to upload.");
  }
  try {
    const body = (await res.json()) as ApiErrorPayload;
    if (body?.error?.code && body?.error?.message) {
      return new ApiClientError(res.status, body.error.code, body.error.message);
    }
  } catch {
    // response wasn't JSON — fall through to generic message
  }
  return new ApiClientError(res.status, "UNKNOWN_ERROR", "Something went wrong. Please try again.");
}

export async function apiGet<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { ...(await authHeader()) },
  });

  if (!res.ok) throw await parseErrorResponse(res);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader()),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) throw await parseErrorResponse(res);
  return (await res.json()) as T;
}

export async function apiSend<T>(method: "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseErrorResponse(res);
  return (await res.json()) as T;
}

/** User-facing copy for known error codes; falls back to the server's own message otherwise. */
export function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ImagePreprocessError) return err.message;
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case "PAYLOAD_TOO_LARGE":
        return "This image is too large to upload. Please try a smaller photo.";
      case "UNAUTHENTICATED":
        return "Your session has expired. Please sign in again.";
      case "FORBIDDEN":
      case "ROOM_NOT_FOUND":
      case "PROJECT_NOT_FOUND":
      case "VISUALIZATION_NOT_FOUND":
        return "We couldn't find that. It may have been removed, or you may not have access to it.";
      case "ANALYSIS_REQUIRED":
        return "This room needs to be analyzed before continuing.";
      case "TILE_INACTIVE":
        return "This tile is no longer available. Please choose a different one.";
      case "TILE_SURFACE_INCOMPATIBLE":
        return err.message;
      case "RETRY_LIMIT_EXCEEDED":
        return "You've reached the maximum number of attempts for this visualization.";
      case "RATE_LIMITED":
        return "You're doing that a little too quickly. Please wait a moment and try again.";
      default:
        return err.message || fallback;
    }
  }
  return fallback;
}
