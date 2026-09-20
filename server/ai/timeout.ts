import { GeminiTimeoutError } from "./errors.js";

/**
 * Races a promise against a timeout. This does not guarantee the
 * underlying Gemini HTTP request is cancelled (that depends on SDK-level
 * abort support), but it guarantees the calling Vercel function never
 * hangs waiting on it indefinitely.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new GeminiTimeoutError(operation, timeoutMs));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
