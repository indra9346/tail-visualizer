-- ============================================================
-- 0006: privilege hardening (pre-deployment audit findings)
--
-- FINDING 1 — leftover MAINTAIN on existing tables.
--   0005 revoked INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES from
--   `authenticated`, but the Postgres 17 MAINTAIN privilege (VACUUM,
--   ANALYZE, CLUSTER, REINDEX, LOCK TABLE) was not named, so
--   `authenticated` still held it on all 8 application tables. It grants
--   no data access and PostgREST cannot exercise it, but clients should
--   hold SELECT only. Revoked here for both API roles.
--
-- FINDING 2 — unsafe default privileges for FUTURE tables.
--   Supabase's default ACLs for tables created by `postgres` in `public`
--   hand `anon`, `authenticated` and `service_role` TRUNCATE, REFERENCES,
--   TRIGGER and MAINTAIN, and no SELECT/INSERT/UPDATE/DELETE to anyone.
--   Effect on the next migration that creates a table:
--     * anon/authenticated silently get TRUNCATE etc. (privilege creep), and
--     * service_role has no data access, so the API fails with the same
--       `42501 permission denied` that Phase 4 hit after migration 0001.
--   Fix: future tables start with NOTHING for anon/authenticated (each
--   migration must then grant exactly what its RLS policies need, e.g.
--   `grant select on new_table to authenticated`), and FULL access for
--   service_role (the server's role; it bypasses RLS and every db/*
--   function performs its own explicit ownership checks).
--
-- SCOPE / SAFETY
--   * Only privileges and default privileges change. No table, row,
--     policy, column or storage object is created, altered or deleted.
--   * Does not touch existing grants to service_role, or the SELECT that
--     `authenticated` holds on the 8 existing tables (RLS still filters it).
--   * Default privileges are scoped to objects created by role `postgres`
--     in schema `public` (the role that runs SQL Editor / CLI migrations).
--     Objects created by Supabase's own `supabase_admin` role are untouched.
--   * Requires Postgres 17 (MAINTAIN privilege); this project is on 17.x.
--   * Idempotent: REVOKE/GRANT and ALTER DEFAULT PRIVILEGES are no-ops when
--     the state already matches, so it is safe to re-run.
--
-- NOTE: do not re-run 0002_grants.sql on its own after this point — it
-- predates 0005/0006 and would re-grant client write privileges. Run the
-- migrations in order (0001 -> 0006) or not at all.
-- ============================================================

-- ---------- existing tables ----------
revoke maintain on all tables in schema public from anon, authenticated;

-- ---------- future tables created by `postgres` in public ----------
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;

alter default privileges for role postgres in schema public
  grant all on tables to service_role;
