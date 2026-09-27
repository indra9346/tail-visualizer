import { createDispatcher } from "../server/lib/dispatch.js";
import projects from "./_routes/projects.js";
import projectRooms from "./_routes/projectRooms.js";

// GET|POST /api/projects and GET /api/projects/:id/rooms (see vercel.json rewrites).
export default createDispatcher({ list: projects, rooms: projectRooms }, "list");
