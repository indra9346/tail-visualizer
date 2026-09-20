import { chainable } from "./helpers/fakeSupabase";

/**
 * createNextGenerationJob first counts existing jobs for the visualization,
 * then inserts the next attempt. This fake client tracks an in-memory
 * count that increments on each successful insert, so the test can
 * exercise the real MAX_GENERATION_ATTEMPTS enforcement across repeated
 * calls without needing a real database.
 */
let jobCount = 0;

const fakeClient = {
  from(table: string) {
    if (table !== "generation_jobs") return chainable({ data: null, error: null });

    return {
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count) {
          return chainable({ data: null, error: null, count: jobCount });
        }
        return chainable({ data: null, error: null });
      },
      insert: (row: { attempt_number: number }) => ({
        select: () => ({
          single: async () => {
            jobCount = row.attempt_number;
            return {
              data: {
                id: `job-${row.attempt_number}`,
                visualization_id: "v1",
                status: "pending",
                attempt_number: row.attempt_number,
                generation_model: null,
                error_message: null,
                started_at: null,
                completed_at: null,
                created_at: "2026-01-01",
              },
              error: null,
            };
          },
        }),
      }),
    };
  },
};

jest.mock("../server/lib/supabaseServerClient", () => ({
  getSupabaseServerClient: () => fakeClient,
}));

import { createNextGenerationJob, MAX_GENERATION_ATTEMPTS } from "../server/db/generationJobs";

describe("generation job retry limit", () => {
  test("allows up to MAX_GENERATION_ATTEMPTS jobs, then rejects further retries", async () => {
    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      const job = await createNextGenerationJob("v1");
      expect(job.attemptNumber).toBe(attempt);
    }

    await expect(createNextGenerationJob("v1")).rejects.toMatchObject({ code: "RETRY_LIMIT_EXCEEDED" });
  });
});
