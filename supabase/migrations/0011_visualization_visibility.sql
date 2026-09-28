-- ============================================================
-- 0011: visualization visibility (public/private)
--
-- Adds an explicit, owner-controlled visibility flag to `visualizations` so
-- the "My Visualizations" page can be opened by a signed-out visitor without
-- exposing anyone's private data:
--
--   is_public = false (default)  -> visible only to the owner (existing
--                                    "visualizations_select_own" policy).
--   is_public = true             -> also visible to anonymous/public callers
--                                    (new "visualizations_select_public"
--                                    policy below), because the owner
--                                    explicitly chose to share that result.
--
-- Defaults to false for every existing row: no pre-existing visualization
-- becomes public as a side effect of this migration. An owner opts a
-- visualization in from the authenticated "My Visualizations" view.
--
-- Additive and non-destructive. Idempotent: safe to re-run.
-- ============================================================

alter table visualizations
  add column if not exists is_public boolean not null default false;

create index if not exists idx_visualizations_is_public
  on visualizations(is_public)
  where is_public = true;

-- Anyone (including anon/unauthenticated) may SELECT a row explicitly
-- marked public. This is additive to, not a replacement for,
-- "visualizations_select_own" — a private row is still only visible to its
-- owner, and this policy can never widen access to a private row.
drop policy if exists "visualizations_select_public" on visualizations;
create policy "visualizations_select_public" on visualizations
  for select using (is_public = true);

-- Note: the existing "visualizations_update_own" policy already lets only
-- the owner change is_public on their own row (it has no column-level
-- restriction, and the API is the only writer in practice — see
-- server/db/visualizations.ts:setVisualizationVisibility).
