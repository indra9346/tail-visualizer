-- ============================================================
-- 0007: per-showroom tile catalogs.
-- Each tile belongs to the showroom owner (auth user) who added it.
-- Run once in the Supabase SQL Editor after 0001-0006. Idempotent.
-- ============================================================

alter table tiles add column if not exists owner_id uuid references auth.users(id) on delete cascade;
create index if not exists idx_tiles_owner_id on tiles(owner_id);

-- A SKU only has to be unique inside one showroom, not across all showrooms.
alter table tiles drop constraint if exists tiles_sku_key;
create unique index if not exists idx_tiles_owner_sku on tiles(owner_id, sku);

-- Showrooms must not see each other's catalogs (the server also enforces this in code).
drop policy if exists "tiles_select_authenticated" on tiles;
drop policy if exists "tiles_select_own" on tiles;
create policy "tiles_select_own" on tiles for select using (auth.uid() = owner_id);

-- Tiles created before this migration have no owner and are no longer shown.
-- Remove any sample rows you added by hand (only if nothing references them):
--   delete from tiles where owner_id is null;
