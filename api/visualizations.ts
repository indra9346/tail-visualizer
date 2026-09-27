import { createDispatcher } from "../server/lib/dispatch.js";
import generate from "./_routes/vizGenerate.js";
import get from "./_routes/vizGet.js";
import byRoom from "./_routes/vizByRoom.js";

// Serves /api/visualizations/generate (calls Gemini), /api/visualizations/:id and /api/visualizations/room/:roomId.
export const config = { maxDuration: 120 };

export default createDispatcher({ generate, get, byRoom });
