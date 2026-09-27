-- ============================================================
-- 0008: visualizations.requirements
--
-- The showroom owner's natural-language design instructions for a
-- generation ("use the tile on the floor and matching wall area, keep the
-- toilet, sink and shower unchanged ..."). Optional: generation works with
-- defaults when it is NULL.
--
-- Additive and non-destructive: one nullable column, no data touched.
-- The 2000-character cap is a DB-level backstop; the API enforces a
-- tighter limit and sanitizes the text before it is stored or used.
-- Idempotent: safe to re-run.
-- ============================================================

alter table visualizations add column if not exists requirements text;

do $$ begin
  alter table visualizations
    add constraint visualizations_requirements_length
    check (requirements is null or char_length(requirements) <= 2000);
exception when duplicate_object then null; end $$;
