-- ============================================================
-- 0012: Design Studio - per-area tile combinations and layout patterns.
--
--  * surface_type gains 'step_tread' (floor-kind) and 'step_riser' (wall-kind).
--  * visualizations.design      jsonb : the areas the showroom specified
--                                       (surface, location, pattern, tile ids).
--  * visualizations.design_hash text  : fingerprint of that design; lets an
--                                       identical retry / double-click reuse the
--                                       same visualization and its retry budget.
--  * visualization_tiles: one row per DISTINCT tile used by a visualization.
--    ON DELETE RESTRICT on tile_id means a tile cannot be deleted while ANY
--    visualization uses it, as a primary tile or as part of a combo.
--
-- Additive only: existing rows are untouched (design / design_hash stay NULL for
-- visualizations made before this migration; they keep working through tile_id).
-- NOTE: the new enum values are not referenced anywhere in this file (a value
-- added inside a transaction cannot be used in the same transaction).
-- Idempotent: safe to re-run. Run it BEFORE deploying the matching code.
-- ============================================================

alter type surface_type add value if not exists 'step_tread';
alter type surface_type add value if not exists 'step_riser';

alter table visualizations add column if not exists design jsonb;
alter table visualizations add column if not exists design_hash text;
create index if not exists idx_visualizations_room_design on visualizations (room_upload_id, design_hash);

create table if not exists visualization_tiles (
  visualization_id uuid not null references visualizations(id) on delete cascade,
  tile_id          uuid not null references tiles(id) on delete restrict,
  primary key (visualization_id, tile_id)
);
create index if not exists idx_visualization_tiles_tile on visualization_tiles (tile_id);

-- Server-only table: RLS on with no policies = no access for anon / authenticated.
-- (service_role bypasses RLS; the default privileges set in 0006 already grant it access.)
alter table visualization_tiles enable row level security;
