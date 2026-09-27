import { createDispatcher } from "../server/lib/dispatch.js";
import generate from "./_routes/vizGenerate.js";
import get from "./_routes/vizGet.js";
import byRoom from "./_routes/vizByRoom.js";
import history from "./_routes/vizHistory.js";

// Serves /api/visualizations/generate (calls Gemini), /api/visualizations/:id,
// /api/visualizations/room/:roomId and /api/visualizations/history (My Visualizations).
export const config = { maxDuration: 120 };

export default createDispatcher({ generate, get, byRoom, history });
