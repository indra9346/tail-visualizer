import { createDispatcher } from "../server/lib/dispatch.js";
import search from "./_routes/tilesSearch.js";
import recommend from "./_routes/tilesRecommend.js";
import manage from "./_routes/tilesManage.js";

// Serves /api/tiles/search, /api/tiles/recommend (calls Gemini) and /api/tiles/manage.
export const config = { maxDuration: 120 };

export default createDispatcher({ search, recommend, manage });
