-- ============================================================
-- 0009: richer tile catalog + more target surfaces
--
--  * surface_type gains 'backsplash' and 'shower_wall' so a generation can
--    target them (tiles keep the coarse categories floor / wall / both; every
--    wall-kind surface accepts a 'wall' or 'both' tile).
--  * tiles gain description, tile_type, pattern and stock_status.
--  * visualizations gain room_type (what the showroom owner said the space is).
--
-- Additive only: new enum values and nullable / defaulted columns. No rows are
-- modified or removed. Idempotent: safe to re-run.
-- NOTE: the new enum values are not referenced anywhere in this file (a value
-- added inside a transaction cannot be used in the same transaction).
-- ============================================================

alter type surface_type add value if not exists 'backsplash';
alter type surface_type add value if not exists 'shower_wall';

alter table tiles add column if not exists description  text;
alter table tiles add column if not exists tile_type    text;
alter table tiles add column if not exists pattern      text;
alter table tiles add column if not exists stock_status text not null default 'in_stock';

do $$ begin
  alter table tiles add constraint tiles_stock_status_check
    check (stock_status in ('in_stock', 'low_stock', 'out_of_stock', 'made_to_order'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tiles add constraint tiles_description_length
    check (description is null or char_length(description) <= 2000);
exception when duplicate_object then null; end $$;

alter table visualizations add column if not exists room_type text;

do $$ begin
  alter table visualizations add constraint visualizations_room_type_check
    check (room_type is null or room_type in ('kitchen','bedroom','bathroom','living_room','dining_room','balcony','corridor','other'));
exception when duplicate_object then null; end $$;
