-- ============================================================
-- 0004: tile_recommendations.reason (Phase 4 live-test finding)
--
-- server/db/recommendations.ts inserts and selects a `reason` column
-- (the model's one-line justification per recommended tile) that 0001
-- never created, so GET /api/tiles/recommend failed with HTTP 500 on
-- any non-empty recommendation set against a real database.
-- NOT NULL DEFAULT '' keeps the column safe for any pre-existing rows.
-- Idempotent: safe to re-run.
-- ============================================================

alter table tile_recommendations add column if not exists reason text not null default '';
