/**
 * Loads a root .env file into process.env for LOCAL development and
 * ad-hoc scripts only. This must never run in the deployed Vercel
 * environment — Vercel injects environment variables directly into
 * process.env at the platform level, and `vercel dev` already loads
 * .env/.env.local itself, so dotenv would be redundant there (and a
 * dependency we don't need shipped into any serverless function bundle).
 *
 * Import this explicitly and first (e.g. `import "../server/lib/loadLocalEnv.js"`)
 * at the top of any local-only script (this repo's own live-integration
 * checks, one-off debugging scripts). Application code under api/ and
 * server/ must NOT import this — those run in a Vercel-managed
 * environment (or the test suite, which mocks its own inputs and should
 * never depend on real secrets).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

if (!process.env.VERCEL) {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const dotenv = await import("dotenv");
    // override: true — a stale/placeholder variable already set in the OS or
    // shell environment must not silently beat the project .env in local runs.
    dotenv.config({ path: envPath, override: true, quiet: true });
  }
}
