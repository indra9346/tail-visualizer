import { createDispatcher } from "../server/lib/dispatch.js";
import generate from "./_routes/vizGenerate.js";
import get from "./_routes/vizGet.js";
import byRoom from "./_routes/vizByRoom.js";
import history from "./_routes/vizHistory.js";
import publicList from "./_routes/vizPublic.js";

// Serves /api/visualizations/generate (calls Gemini), /api/visualizations/:id,
// /api/visualizations/room/:roomId, /api/visualizations/history (My Visualizations,
// authenticated/owner-scoped) and /api/visualizations/public (the same shape, but
// unauthenticated and covering every account — see vizPublic.ts).
export const config = { maxDuration: 120 };

export default createDispatcher({ generate, get, byRoom, history, public: publicList });
