/**
 * Public entry point for the AI service layer. Only files under
 * server/ (API routes, and later a DB service layer) should import from
 * here — never src/ (browser) code.
 */

export { analyzeRoom } from "./analyzeRoom.js";
export { recommendTiles } from "./recommendTiles.js";
export { generateVisualization } from "./generateVisualization.js";

export * from "./types.js";
export * from "./errors.js";
export { aiConfig } from "./config.js";
export { aiLogger } from "./logger.js";
