import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ApiError, Errors } from "./apiError.js";
import { AiServiceError, type AiErrorCode } from "../ai/errors.js";
import { apiLogger } from "./logger.js";

/**
 * Maps each AiErrorCode to the HTTP status that actually describes it.
 * Not every AiServiceError is an upstream failure: image validation
 * errors are a client input problem (400), a missing API key is a server
 * misconfiguration (500), and only genuine timeouts/rate-limits/upstream
 * Gemini failures are a 502/503. Collapsing all of these into one status
 * (as a prior version of this file did) misrepresents a bad file upload
 * as a server-side failure to the client.
 */
const AI_ERROR_STATUS: Partial<Record<AiErrorCode, number>> = {
  AI_INVALID_IMAGE: 400,
  AI_IMAGE_TOO_LARGE: 400,
  AI_UNSUPPORTED_IMAGE_FORMAT: 400,
  AI_TIMEOUT: 503,
  AI_RATE_LIMITED: 503,
  AI_CONFIG_MISSING_API_KEY: 500,
};

function statusForAiError(code: AiErrorCode): number {
  return AI_ERROR_STATUS[code] ?? 502; // genuine upstream/model failures default to 502
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface HandlerOptions {
  methods: Method[];
  operation: string;
}

/**
 * Wraps a route handler with:
 *  - method allow-listing (405 otherwise)
 *  - a single try/catch that converts any thrown error into the
 *    consistent { error: { code, message } } shape, WITHOUT ever
 *    leaking stack traces, secrets, or raw upstream (Gemini/Postgres)
 *    error payloads to the client.
 */
export function createHandler(
  options: HandlerOptions,
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
) {
  return async function wrapped(req: VercelRequest, res: VercelResponse): Promise<void> {
    const start = Date.now();

    if (!options.methods.includes((req.method as Method) ?? "GET")) {
      res.setHeader("Allow", options.methods.join(", "));
      const err = Errors.methodNotAllowed(options.methods);
      res.status(err.status).json(err.toPayload());
      return;
    }

    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof ApiError) {
        apiLogger.warn("request failed with ApiError", {
          operation: options.operation,
          method: req.method,
          status: err.status,
          errorCategory: err.code,
        });
        res.status(err.status).json(err.toPayload());
        return;
      }

      if (err instanceof AiServiceError) {
        apiLogger.error("request failed with AiServiceError", {
          operation: options.operation,
          method: req.method,
          errorCategory: err.code,
          durationMs: Date.now() - start,
        });
        const status = statusForAiError(err.code);
        res.status(status).json({ error: { code: err.code, message: err.safeMessage } });
        return;
      }

      apiLogger.error("request failed with unexpected error", {
        operation: options.operation,
        method: req.method,
        errorCategory: err instanceof Error ? err.name : "unknown",
        durationMs: Date.now() - start,
      });
      const internal = Errors.internal();
      res.status(internal.status).json(internal.toPayload());
    }
  };
}
