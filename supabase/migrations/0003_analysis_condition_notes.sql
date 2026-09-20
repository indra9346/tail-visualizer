-- ============================================================
-- 0003: room_analyses condition-notes columns (Phase 4 live-test finding)
--
-- server/db/analyses.ts reads and writes floor_condition_notes and
-- wall_condition_notes, but 0001 never created them, so every analysis
-- read/insert failed against a real database (surfacing as HTTP 500 on
-- recommend / generate / analyze). Nullable free text, matching
-- RawAnalysisRow's `string | null`.
-- Idempotent: safe to re-run.
-- ============================================================

alter table room_analyses add column if not exists floor_condition_notes text;
alter table room_analyses add column if not exists wall_condition_notes text;
