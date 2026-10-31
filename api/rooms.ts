import { createDispatcher } from "../server/lib/dispatch.js";
import upload from "./_routes/roomUpload.js";
import get from "./_routes/roomGet.js";
import analyze from "./_routes/roomAnalyze.js";
import analysis from "./_routes/roomAnalysis.js";
import autoMark from "./_routes/roomAutoMark.js";

/**
 * Serves /api/rooms/upload, /api/rooms/:id, /api/rooms/:id/analyze,
 * /api/rooms/:id/analysis and /api/rooms/:id/auto-mark. maxDuration covers the slowest op (analyze:
 * up to 2 x the 50 s model timeout with the single bounded retry).
 */
export const config = { maxDuration: 120 };

export default createDispatcher({ upload, get, analyze, analysis, autoMark });
