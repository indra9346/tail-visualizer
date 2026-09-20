-- ============================================================
-- 0005: server-only writes (Phase 4 security hardening)
--
-- FINDING (proved live with two temp users in Phase 4):
--   * room_uploads_insert_own let a logged-in user insert a row whose
--     storage_path pointed at ANOTHER user's file; GET /api/rooms/:id then
--     signed that path with the service role -> cross-user file read.
--   * visualizations_update_own let a user rewrite result_storage_path to
--     another user's generated image -> same cross-user read.
--   * room_images_insert_own let clients upload straight into the private
--     bucket, bypassing the API's signature check and upload rate limit.
--
-- The browser client NEVER writes to these tables or buckets (verified:
-- the only Supabase use in client/src is getPublicUrl for tile images).
-- Every write goes through /api/*, which uses the service role and
-- bypasses RLS. So client write access here was pure attack surface.
--
-- After this migration:
--   * authenticated keeps SELECT (owner-only policies unchanged).
--   * authenticated has NO insert/update/delete on projects, profiles,
--     room_uploads, visualizations (policies dropped AND privileges revoked).
--   * authenticated has NO insert/delete on room-images and no delete on
--     generated-visualizations storage objects.
--   * service_role is unaffected (its own grants from 0002; bypasses RLS).
--
-- Idempotent: safe to re-run.
-- ============================================================

-- ---------- room_uploads ----------
drop policy if exists "room_uploads_insert_own" on room_uploads;
drop policy if exists "room_uploads_update_own" on room_uploads;
drop policy if exists "room_uploads_delete_own" on room_uploads;

-- ---------- visualizations ----------
drop policy if exists "visualizations_insert_own" on visualizations;
drop policy if exists "visualizations_update_own" on visualizations;
drop policy if exists "visualizations_delete_own" on visualizations;

-- ---------- projects ----------
drop policy if exists "projects_insert_own" on projects;
drop policy if exists "projects_update_own" on projects;
drop policy if exists "projects_delete_own" on projects;

-- ---------- profiles ----------
drop policy if exists "profiles_insert_own" on profiles;
drop policy if exists "profiles_update_own" on profiles;

-- ---------- privileges (belt and braces: policies AND grants) ----------
revoke insert, update, delete on room_uploads   from authenticated;
revoke insert, update, delete on visualizations from authenticated;
revoke insert, update, delete on projects       from authenticated;
revoke insert, update, delete on profiles       from authenticated;

-- ---------- storage: no client writes/deletes on private buckets ----------
drop policy if exists "room_images_insert_own"  on storage.objects;
drop policy if exists "room_images_delete_own"  on storage.objects;
drop policy if exists "generated_viz_delete_own" on storage.objects;

-- Kept on purpose (read-only, owner-scoped):
--   profiles_select_own, projects_select_own, room_uploads_select_own,
--   visualizations_select_own, room_images_select_own,
--   generated_viz_select_own, tile_images_public_select.

-- ---------- leftover non-DML privileges ----------
-- Live check after the revokes above showed `authenticated` still held
-- TRUNCATE, TRIGGER and REFERENCES on every public table. PostgREST does
-- not expose them, but TRUNCATE bypasses RLS entirely, so remove them
-- (least privilege). Clients need SELECT only; nothing else.
revoke truncate, trigger, references on all tables in schema public from authenticated, anon;
