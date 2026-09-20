/**
 * One-off diagnostic: lists the Gemini models actually available to this
 * API key/account, so model configuration can be based on evidence
 * rather than guessing names. LOCAL/DEV ONLY — never imported by
 * application code. Never prints the API key.
 */
import "../server/lib/loadLocalEnv.js";
import { getGeminiClient } from "../server/ai/geminiClient.js";

async function main() {
  const client = getGeminiClient();
  const pager = await client.models.list();
  const imageCapable: string[] = [];
  const textCapable: string[] = [];

  for await (const model of pager) {
    const actions = model.supportedActions ?? [];
    const name = model.name ?? "(unknown)";
    if (actions.includes("generateContent")) {
      const looksImageCapable = /image/i.test(name);
      (looksImageCapable ? imageCapable : textCapable).push(name);
    }
  }

  console.log("Models supporting generateContent (text/general):");
  textCapable.forEach((m) => console.log(`  ${m}`));
  console.log("\nModels supporting generateContent (name suggests image capability):");
  imageCapable.forEach((m) => console.log(`  ${m}`));
}

main().catch((err) => {
  console.log("FAIL:", String(err?.message ?? err).replace(/[A-Za-z0-9_-]{20,}/g, "<redacted>"));
  process.exit(1);
});
