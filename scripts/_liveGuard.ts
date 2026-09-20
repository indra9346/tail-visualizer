/**
 * Safety guard shared by the live Phase 4 scripts (TEST-ONLY tooling).
 *
 * Import it right after "../server/lib/loadLocalEnv.js" and BEFORE any code
 * that touches Supabase. On import it:
 *   1. prints the Supabase project ref the script is about to hit, and
 *   2. refuses to continue (exit code 2) unless PHASE4_ALLOW_LIVE_TESTS=1
 *      is set explicitly for that run.
 *
 * Why: these scripts use the SERVICE-ROLE key against whatever project
 * SUPABASE_URL points at. They create temporary auth users / tiles / rows /
 * storage objects and delete them again, and their global-count assertions
 * assume a disposable project with no real data. Running one against a
 * project holding real data could produce false failures, so it must be a
 * deliberate choice, never an accident.
 *
 * Never prints keys, only the (non-secret) project ref.
 */
// The guard must see the real .env values. loadLocalEnv uses a top-level await, and sibling ES module
// imports do NOT wait for an earlier sibling's top-level await, so import it here to force the ordering.
import "../server/lib/loadLocalEnv.js";
import { basename } from "node:path";

const script = basename(process.argv[1] ?? "live script");
const match = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec((process.env.SUPABASE_URL ?? "").trim());

function refuse(reason: string): never {
  console.error(`\n[live-test guard] REFUSING TO RUN ${script}: ${reason}\n`);
  process.exit(2);
}

if (!match) {
  refuse("SUPABASE_URL is missing or is not a https://<ref>.supabase.co URL, so the target project cannot be identified.");
}

const ref = match[1]!;
console.log(`[live-test guard] ${script} targets Supabase project ref: ${ref}`);

if (process.env.VERCEL || process.env.NODE_ENV === "production") {
  refuse("these scripts are for local use only and must never run in a deployed/production environment.");
}

if (process.env.PHASE4_ALLOW_LIVE_TESTS !== "1") {
  refuse(
    [
      "explicit opt-in required.",
      `This script uses the service-role key on project "${ref}": it creates and then deletes`,
      "temporary auth users, rows and storage objects, and assumes a disposable, empty project.",
      "If that project is the right one, re-run with PHASE4_ALLOW_LIVE_TESTS=1, e.g.",
      `  bash:        PHASE4_ALLOW_LIVE_TESTS=1 npx tsx scripts/${script}`,
      `  PowerShell:  $env:PHASE4_ALLOW_LIVE_TESTS="1"; npx tsx scripts/${script}`,
    ].join("\n"),
  );
}

console.log("[live-test guard] PHASE4_ALLOW_LIVE_TESTS=1 acknowledged - proceeding.\n");
