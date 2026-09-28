import { createDispatcher } from "../server/lib/dispatch.js";
import generate from "./_routes/vizGenerate.js";
import get from "./_routes/vizGet.js";
import byRoom from "./_routes/vizByRoom.js";
import history from "./_routes/vizHistory.js";
import publicList from "./_routes/vizPublic.js";
import visibility from "./_routes/vizVisibility.js";

// Serves /api/visualizations/generate (calls Gemini), /api/visualizations/:id
// (owner OR anonymous-if-public — see vizGet.ts), /api/visualizations/room/:roomId,
// /api/visualizations/history (My Visualizations, owner-scoped, both public and
// private of their own), /api/visualizations/public (every visualization any
// owner has explicitly made public, no auth) and /api/visualizations/:id/visibility
// (PATCH, owner-only, toggles that flag).
export const config = { maxDuration: 120 };

export default createDispatcher({ generate, get, byRoom, history, public: publicList, visibility });
