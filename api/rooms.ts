import { createDispatcher } from "../server/lib/dispatch.js";
import upload from "./_routes/roomUpload.js";
import get from "./_routes/roomGet.js";
import analyze from "./_routes/roomAnalyze.js";
import analysis from "./_routes/roomAnalysis.js";

/**
 * Serves /api/rooms/upload, /api/rooms/:id, /api/rooms/:id/analyze and
 * /api/rooms/:id/analysis. maxDuration covers the slowest op (analyze:
 * up to 2 x the 50 s model timeout with the single bounded retry).
 */
export const config = { maxDuration: 120 };

export default createDispatcher({ upload, get, analyze, analysis });
