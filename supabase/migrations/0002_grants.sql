-- ============================================================
-- 0002: table privileges (Phase 4 live-test finding)
--
-- 0001 created the tables and RLS policies but no GRANTs. On current
-- Supabase projects, tables created via SQL in `public` are NOT
-- automatically granted to the API roles, so every request failed with
-- "42501 permission denied" — including the server's service_role.
--
-- RLS policies only filter rows for roles that already hold the table
-- privilege. So this file grants:
--   * service_role: everything (server-side API; each db/* function still
--     enforces its own explicit ownership checks, as documented in 0001)
--   * authenticated: ONLY the operations that an RLS policy in 0001 allows
--   * anon: nothing
-- Idempotent: safe to re-run.
-- ============================================================

grant usage on schema public to service_role, authenticated;

grant all on all tables in schema public to service_role;

revoke all on all tables in schema public from anon;

grant select, insert, update         on profiles             to authenticated;
grant select, insert, update, delete on projects             to authenticated;
grant select, insert, update, delete on room_uploads         to authenticated;
grant select                         on room_analyses        to authenticated;
grant select                         on tiles                to authenticated;
grant select                         on tile_recommendations to authenticated;
grant select, insert, update, delete on visualizations       to authenticated;
grant select                         on generation_jobs      to authenticated;
