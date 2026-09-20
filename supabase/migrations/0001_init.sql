-- ============================================================
-- AI Tile Visualization Platform — Initial Schema Migration
-- Idempotent: safe to re-run
--
-- NOTE: this file was designed in Phase 0 and given to the project owner
-- to run manually in the Supabase SQL Editor, but was never committed to
-- the repository until the Phase 4 QA audit caught the gap. It is saved
-- here now so the schema is versioned alongside the code that depends on
-- it, and so future changes can be reviewed as a diff. It has NOT been
-- executed against any Supabase project by Claude — no live credentials
-- were available during this audit, and doing so was out of scope.
-- ============================================================

-- ---------- ENUMS ----------

do $$ begin
  create type room_upload_status as enum ('uploaded', 'analyzing', 'analyzed', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type room_type as enum ('kitchen','bedroom','bathroom','living_room','dining_room','balcony','corridor','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type construction_state as enum ('unfinished','under_construction','finished_needs_renovation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type surface_type as enum ('floor','wall');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tile_category as enum ('floor','wall','both');
exception when duplicate_object then null; end $$;

do $$ begin
  create type visualization_status as enum ('pending','generating','completed','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum ('pending','processing','completed','failed');
exception when duplicate_object then null; end $$;

-- ---------- UPDATED_AT TRIGGER HELPER ----------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- 1. profiles
-- ============================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

alter table profiles enable row level security;

drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);

-- ============================================================
-- 2. projects
-- ============================================================

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_user_id on projects(user_id);

drop trigger if exists trg_projects_updated_at on projects;
create trigger trg_projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

alter table projects enable row level security;

drop policy if exists "projects_select_own" on projects;
create policy "projects_select_own" on projects
  for select using (auth.uid() = user_id);

drop policy if exists "projects_insert_own" on projects;
create policy "projects_insert_own" on projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "projects_update_own" on projects;
create policy "projects_update_own" on projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "projects_delete_own" on projects;
create policy "projects_delete_own" on projects
  for delete using (auth.uid() = user_id);

-- ============================================================
-- 3. room_uploads
-- ============================================================

create table if not exists room_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  file_size_bytes integer not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  image_width integer,
  image_height integer,
  status room_upload_status not null default 'uploaded',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_room_uploads_project_id on room_uploads(project_id);
create index if not exists idx_room_uploads_user_id on room_uploads(user_id);
create index if not exists idx_room_uploads_status on room_uploads(status);

drop trigger if exists trg_room_uploads_updated_at on room_uploads;
create trigger trg_room_uploads_updated_at
  before update on room_uploads
  for each row execute function set_updated_at();

alter table room_uploads enable row level security;

drop policy if exists "room_uploads_select_own" on room_uploads;
create policy "room_uploads_select_own" on room_uploads
  for select using (auth.uid() = user_id);

drop policy if exists "room_uploads_insert_own" on room_uploads;
create policy "room_uploads_insert_own" on room_uploads
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists "room_uploads_update_own" on room_uploads;
create policy "room_uploads_update_own" on room_uploads
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "room_uploads_delete_own" on room_uploads;
create policy "room_uploads_delete_own" on room_uploads
  for delete using (auth.uid() = user_id);

-- ============================================================
-- 4. room_analyses  (1:1 with room_uploads — reusable analysis)
-- ============================================================

create table if not exists room_analyses (
  id uuid primary key default gen_random_uuid(),
  room_upload_id uuid not null unique references room_uploads(id) on delete cascade,
  room_type room_type not null,
  confidence numeric(3,2) not null check (confidence >= 0 and confidence <= 1),
  construction_state construction_state not null,
  floor_visible boolean not null default false,
  floor_current_material text,
  wall_visible boolean not null default false,
  wall_current_material text,
  recommended_surfaces surface_type[] not null default '{}',
  door_count integer not null default 0 check (door_count >= 0),
  window_count integer not null default 0 check (window_count >= 0),
  fixtures text[] not null default '{}',
  lighting text check (lighting in ('natural','artificial','mixed','low_light')),
  perspective text check (perspective in ('straight_on','angled','wide_angle')),
  warnings text[] not null default '{}',
  raw_ai_response jsonb not null,
  analysis_model text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_room_analyses_room_upload_id on room_analyses(room_upload_id);

alter table room_analyses enable row level security;

drop policy if exists "room_analyses_select_own" on room_analyses;
create policy "room_analyses_select_own" on room_analyses
  for select using (
    exists (
      select 1 from room_uploads ru
      where ru.id = room_upload_id and ru.user_id = auth.uid()
    )
  );

-- No client insert/update/delete policy: written only by the server (service-role).

-- ============================================================
-- 5. tiles  (admin/server-managed catalog)
-- ============================================================

create table if not exists tiles (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  brand text,
  category tile_category not null,
  material text,
  finish text,
  color_family text,
  size_mm text,
  price_per_sqft numeric(10,2) check (price_per_sqft >= 0),
  currency text not null default 'INR',
  storage_path text not null,
  suitable_rooms room_type[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tiles_category on tiles(category);
create index if not exists idx_tiles_is_active on tiles(is_active);
create index if not exists idx_tiles_category_active on tiles(category, is_active);

drop trigger if exists trg_tiles_updated_at on tiles;
create trigger trg_tiles_updated_at
  before update on tiles
  for each row execute function set_updated_at();

alter table tiles enable row level security;

drop policy if exists "tiles_select_authenticated" on tiles;
create policy "tiles_select_authenticated" on tiles
  for select using (auth.role() = 'authenticated');

-- Deliberately no insert/update/delete policy for authenticated role.
-- Catalog is managed exclusively via service-role (server) operations, which bypass RLS.

-- ============================================================
-- 6. tile_recommendations
-- ============================================================

create table if not exists tile_recommendations (
  id uuid primary key default gen_random_uuid(),
  room_analysis_id uuid not null references room_analyses(id) on delete cascade,
  tile_id uuid not null references tiles(id) on delete restrict,
  surface surface_type not null,
  rank integer not null check (rank >= 1),
  created_at timestamptz not null default now(),
  unique (room_analysis_id, tile_id, surface)
);

create index if not exists idx_tile_recs_room_analysis_id on tile_recommendations(room_analysis_id);
create index if not exists idx_tile_recs_tile_id on tile_recommendations(tile_id);

alter table tile_recommendations enable row level security;

drop policy if exists "tile_recs_select_own" on tile_recommendations;
create policy "tile_recs_select_own" on tile_recommendations
  for select using (
    exists (
      select 1 from room_analyses ra
      join room_uploads ru on ru.id = ra.room_upload_id
      where ra.id = room_analysis_id and ru.user_id = auth.uid()
    )
  );

-- No client insert/update/delete: written only by the server after querying real tiles rows.

-- ============================================================
-- 7. visualizations
-- ============================================================

create table if not exists visualizations (
  id uuid primary key default gen_random_uuid(),
  room_upload_id uuid not null references room_uploads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tile_id uuid not null references tiles(id) on delete restrict,
  applied_surfaces surface_type[] not null check (array_length(applied_surfaces, 1) > 0),
  status visualization_status not null default 'pending',
  result_storage_path text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_visualizations_room_upload_id on visualizations(room_upload_id);
create index if not exists idx_visualizations_user_id on visualizations(user_id);
create index if not exists idx_visualizations_tile_id on visualizations(tile_id);
create index if not exists idx_visualizations_status on visualizations(status);

alter table visualizations enable row level security;

drop policy if exists "visualizations_select_own" on visualizations;
create policy "visualizations_select_own" on visualizations
  for select using (auth.uid() = user_id);

drop policy if exists "visualizations_insert_own" on visualizations;
create policy "visualizations_insert_own" on visualizations
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from room_uploads ru where ru.id = room_upload_id and ru.user_id = auth.uid())
    and exists (select 1 from tiles t where t.id = tile_id and t.is_active = true)
  );

drop policy if exists "visualizations_update_own" on visualizations;
create policy "visualizations_update_own" on visualizations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "visualizations_delete_own" on visualizations;
create policy "visualizations_delete_own" on visualizations
  for delete using (auth.uid() = user_id);

-- ============================================================
-- 8. generation_jobs  (supports retry without new visualization)
-- ============================================================

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  visualization_id uuid not null references visualizations(id) on delete cascade,
  status job_status not null default 'pending',
  attempt_number integer not null default 1 check (attempt_number >= 1),
  generation_model text,
  request_payload jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (visualization_id, attempt_number)
);

create index if not exists idx_generation_jobs_visualization_id_status
  on generation_jobs(visualization_id, status);

alter table generation_jobs enable row level security;

drop policy if exists "generation_jobs_select_own" on generation_jobs;
create policy "generation_jobs_select_own" on generation_jobs
  for select using (
    exists (
      select 1 from visualizations v
      where v.id = visualization_id and v.user_id = auth.uid()
    )
  );

-- No client insert/update/delete: job lifecycle is fully server-managed.

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('room-images', 'room-images', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('tile-images', 'tile-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('generated-visualizations', 'generated-visualizations', false, 15728640, array['image/jpeg','image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS: path convention is "{user_id}/..." for private buckets,
-- enforced by checking the first path segment against auth.uid().

drop policy if exists "room_images_select_own" on storage.objects;
create policy "room_images_select_own" on storage.objects
  for select using (
    bucket_id = 'room-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "room_images_insert_own" on storage.objects;
create policy "room_images_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'room-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "room_images_delete_own" on storage.objects;
create policy "room_images_delete_own" on storage.objects
  for delete using (
    bucket_id = 'room-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "generated_viz_select_own" on storage.objects;
create policy "generated_viz_select_own" on storage.objects
  for select using (
    bucket_id = 'generated-visualizations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "generated_viz_delete_own" on storage.objects;
create policy "generated_viz_delete_own" on storage.objects
  for delete using (
    bucket_id = 'generated-visualizations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Note: INSERT into room-images / generated-visualizations from the client is
-- intentionally NOT granted — uploads for these buckets happen exclusively via
-- the Vercel server using the service-role key, which bypasses these policies.

drop policy if exists "tile_images_public_select" on storage.objects;
create policy "tile_images_public_select" on storage.objects
  for select using (bucket_id = 'tile-images');

-- No client insert/update/delete policy on tile-images: managed by service-role only.

-- ============================================================
-- 0002 addendum (Phase 4 audit): the application code added
-- listProjectsForUser()/listRoomUploadsForProject() (GET /api/projects,
-- GET /api/projects/:id/rooms). Both are service-role reads scoped by an
-- explicit application-level `user_id`/`project_id` filter in the query
-- itself (see server/db/projects.ts, server/db/rooms.ts) — no new table,
-- column, or policy is required for them to be safe.
-- ============================================================
