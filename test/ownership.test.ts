import { chainable } from "./helpers/fakeSupabase";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

let tableResults: Record<string, unknown> = {};

jest.mock("../server/lib/supabaseServerClient", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => chainable(tableResults[table] ?? { data: null, error: null }),
  }),
}));

import { verifyProjectOwnership } from "../server/db/projects";
import { verifyRoomOwnership } from "../server/db/rooms";
import { verifyVisualizationOwnership } from "../server/db/visualizations";

describe("ownership enforcement", () => {
  test("user A cannot access user B's project", async () => {
    tableResults = {
      projects: { data: { id: "p1", user_id: USER_B, name: "B's kitchen", created_at: "2026-01-01" }, error: null },
    };
    await expect(verifyProjectOwnership("p1", USER_A)).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });

  test("user B can access their own project", async () => {
    tableResults = {
      projects: { data: { id: "p1", user_id: USER_B, name: "B's kitchen", created_at: "2026-01-01" }, error: null },
    };
    const project = await verifyProjectOwnership("p1", USER_B);
    expect(project.userId).toBe(USER_B);
  });

  test("user A cannot access user B's room upload", async () => {
    tableResults = {
      room_uploads: {
        data: {
          id: "r1",
          project_id: "p1",
          user_id: USER_B,
          storage_path: `${USER_B}/p1/r1.jpg`,
          mime_type: "image/jpeg",
          file_size_bytes: 1000,
          status: "uploaded",
          error_message: null,
          created_at: "2026-01-01",
        },
        error: null,
      },
    };
    await expect(verifyRoomOwnership("r1", USER_A)).rejects.toMatchObject({ code: "ROOM_NOT_FOUND" });
  });

  test("user B can access their own room upload", async () => {
    tableResults = {
      room_uploads: {
        data: {
          id: "r1",
          project_id: "p1",
          user_id: USER_B,
          storage_path: `${USER_B}/p1/r1.jpg`,
          mime_type: "image/jpeg",
          file_size_bytes: 1000,
          status: "uploaded",
          error_message: null,
          created_at: "2026-01-01",
        },
        error: null,
      },
    };
    const room = await verifyRoomOwnership("r1", USER_B);
    expect(room.userId).toBe(USER_B);
  });

  test("user A cannot access user B's visualization", async () => {
    tableResults = {
      visualizations: {
        data: {
          id: "v1",
          room_upload_id: "r1",
          user_id: USER_B,
          tile_id: "t1",
          applied_surfaces: ["floor"],
          status: "completed",
          result_storage_path: `${USER_B}/p1/v1.png`,
          error_message: null,
          created_at: "2026-01-01",
          completed_at: "2026-01-01",
        },
        error: null,
      },
    };
    await expect(verifyVisualizationOwnership("v1", USER_A)).rejects.toMatchObject({ code: "VISUALIZATION_NOT_FOUND" });
  });

  test("a nonexistent resource id also returns NOT_FOUND (does not leak existence)", async () => {
    tableResults = { room_uploads: { data: null, error: null } };
    await expect(verifyRoomOwnership("does-not-exist", USER_A)).rejects.toMatchObject({ code: "ROOM_NOT_FOUND" });
  });
});
