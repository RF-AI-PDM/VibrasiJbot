begin;

create extension if not exists pgcrypto;

create table if not exists public.roles (
  name text primary key,
  description text not null,
  created_at timestamptz not null default now()
);

insert into public.roles (name, description)
values
  ('technician', 'Field technician and vibration analyst'),
  ('supervisor', 'Shift supervisor and approver'),
  ('admin', 'System administrator')
on conflict (name) do update
set description = excluded.description;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,
  role_name text not null default 'technician' references public.roles (name),
  department text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit text not null,
  group_name text,
  location text,
  asset_type text,
  bearing_model text,
  nominal_rpm numeric(10, 2),
  criticality text not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fault_profiles (
  key text primary key,
  name text not null,
  severity text not null check (severity in ('A', 'B', 'C', 'D')),
  description text not null,
  direction text not null,
  mobius_ref text not null,
  recommendations jsonb not null default '[]'::jsonb,
  spectrum jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.measurement_sets (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid references public.equipment (id) on delete cascade,
  measurement_at timestamptz not null default now(),
  rpm numeric(10, 2) not null,
  load_pct numeric(5, 2) not null default 0,
  direction text not null,
  source text not null default 'manual',
  overall_mmps numeric(10, 3),
  status text not null default 'NORMAL',
  notes text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.measurement_points (
  id uuid primary key default gen_random_uuid(),
  measurement_set_id uuid not null references public.measurement_sets (id) on delete cascade,
  point_label text not null,
  axis text not null,
  position_order integer not null,
  frequency_hz numeric(10, 3) not null,
  amplitude_mmps numeric(10, 3) not null,
  phase_deg numeric(10, 3),
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_results (
  id uuid primary key default gen_random_uuid(),
  measurement_set_id uuid references public.measurement_sets (id) on delete cascade,
  fault_key text not null references public.fault_profiles (key),
  confidence numeric(5, 2) not null,
  evidence jsonb not null default '[]'::jsonb,
  peaks jsonb not null default '[]'::jsonb,
  source text not null default 'spectrum',
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  measurement_set_id uuid references public.measurement_sets (id) on delete set null,
  bucket_id text not null default 'vibration-assets',
  object_path text not null,
  file_name text not null,
  mime_type text,
  asset_type text not null check (asset_type in ('Spectrum', 'Waveform', 'Photo')),
  bearing text,
  direction text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.reference_items (
  id uuid primary key default gen_random_uuid(),
  fault_key text references public.fault_profiles (key) on delete cascade,
  title text not null,
  summary text not null,
  solution text not null,
  source_ref text not null,
  created_at timestamptz not null default now()
);

create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role_name = required_role
      and u.is_active
  );
$$;

create or replace function public.has_any_role(required_roles text[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role_name = any(required_roles)
      and u.is_active
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, role_name)
  values (
    new.id,
    coalesce(new.email, new.phone, new.id::text),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.email,
      new.phone,
      split_part(coalesce(new.email, new.phone, new.id::text), '@', 1)
    ),
    'technician'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.users.display_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.equipment enable row level security;
alter table public.fault_profiles enable row level security;
alter table public.measurement_sets enable row level security;
alter table public.measurement_points enable row level security;
alter table public.analysis_results enable row level security;
alter table public.uploads enable row level security;
alter table public.reference_items enable row level security;

drop policy if exists "roles_select" on public.roles;
create policy "roles_select"
on public.roles
for select
to authenticated
using (true);

drop policy if exists "users_select_own_or_admin" on public.users;
create policy "users_select_own_or_admin"
on public.users
for select
to authenticated
using (id = auth.uid() or public.has_any_role(array['supervisor', 'admin']));

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
on public.users
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "users_update_own_or_admin" on public.users;
create policy "users_update_own_or_admin"
on public.users
for update
to authenticated
using (id = auth.uid() or public.has_any_role(array['supervisor', 'admin']))
with check (id = auth.uid() or public.has_any_role(array['supervisor', 'admin']));

drop policy if exists "users_delete_admin" on public.users;
create policy "users_delete_admin"
on public.users
for delete
to authenticated
using (public.has_role('admin'));

drop policy if exists "equipment_select_authenticated" on public.equipment;
create policy "equipment_select_authenticated"
on public.equipment
for select
to authenticated
using (true);

drop policy if exists "equipment_write_supervisor_admin" on public.equipment;
create policy "equipment_write_supervisor_admin"
on public.equipment
for all
to authenticated
using (public.has_any_role(array['supervisor', 'admin']))
with check (public.has_any_role(array['supervisor', 'admin']));

drop policy if exists "fault_profiles_select_authenticated" on public.fault_profiles;
create policy "fault_profiles_select_authenticated"
on public.fault_profiles
for select
to authenticated
using (true);

drop policy if exists "fault_profiles_write_supervisor_admin" on public.fault_profiles;
create policy "fault_profiles_write_supervisor_admin"
on public.fault_profiles
for all
to authenticated
using (public.has_any_role(array['supervisor', 'admin']))
with check (public.has_any_role(array['supervisor', 'admin']));

drop policy if exists "measurement_sets_select_authenticated" on public.measurement_sets;
create policy "measurement_sets_select_authenticated"
on public.measurement_sets
for select
to authenticated
using (true);

drop policy if exists "measurement_sets_insert_authenticated" on public.measurement_sets;
create policy "measurement_sets_insert_authenticated"
on public.measurement_sets
for insert
to authenticated
with check (created_by = auth.uid() or public.has_any_role(array['supervisor', 'admin']));

drop policy if exists "measurement_sets_update_owner_or_admin" on public.measurement_sets;
create policy "measurement_sets_update_owner_or_admin"
on public.measurement_sets
for update
to authenticated
using (created_by = auth.uid() or public.has_any_role(array['supervisor', 'admin']))
with check (created_by = auth.uid() or public.has_any_role(array['supervisor', 'admin']));

drop policy if exists "measurement_sets_delete_owner_or_admin" on public.measurement_sets;
create policy "measurement_sets_delete_owner_or_admin"
on public.measurement_sets
for delete
to authenticated
using (created_by = auth.uid() or public.has_any_role(array['supervisor', 'admin']));

drop policy if exists "measurement_points_select_authenticated" on public.measurement_points;
create policy "measurement_points_select_authenticated"
on public.measurement_points
for select
to authenticated
using (true);

drop policy if exists "measurement_points_write_owner_or_admin" on public.measurement_points;
create policy "measurement_points_write_owner_or_admin"
on public.measurement_points
for all
to authenticated
using (
  public.has_any_role(array['supervisor', 'admin'])
  or exists (
    select 1
    from public.measurement_sets ms
    where ms.id = measurement_set_id
      and ms.created_by = auth.uid()
  )
)
with check (
  public.has_any_role(array['supervisor', 'admin'])
  or exists (
    select 1
    from public.measurement_sets ms
    where ms.id = measurement_set_id
      and ms.created_by = auth.uid()
  )
);

drop policy if exists "analysis_results_select_authenticated" on public.analysis_results;
create policy "analysis_results_select_authenticated"
on public.analysis_results
for select
to authenticated
using (true);

drop policy if exists "analysis_results_write_owner_or_admin" on public.analysis_results;
create policy "analysis_results_write_owner_or_admin"
on public.analysis_results
for all
to authenticated
using (
  created_by = auth.uid()
  or public.has_any_role(array['supervisor', 'admin'])
  or exists (
    select 1
    from public.measurement_sets ms
    where ms.id = measurement_set_id
      and ms.created_by = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  or public.has_any_role(array['supervisor', 'admin'])
  or exists (
    select 1
    from public.measurement_sets ms
    where ms.id = measurement_set_id
      and ms.created_by = auth.uid()
  )
);

drop policy if exists "uploads_select_owner_or_admin" on public.uploads;
create policy "uploads_select_owner_or_admin"
on public.uploads
for select
to authenticated
using (created_by = auth.uid() or public.has_any_role(array['supervisor', 'admin']));

drop policy if exists "uploads_insert_owner_or_admin" on public.uploads;
create policy "uploads_insert_owner_or_admin"
on public.uploads
for insert
to authenticated
with check (created_by = auth.uid() or public.has_any_role(array['supervisor', 'admin']));

drop policy if exists "uploads_update_owner_or_admin" on public.uploads;
create policy "uploads_update_owner_or_admin"
on public.uploads
for update
to authenticated
using (created_by = auth.uid() or public.has_any_role(array['supervisor', 'admin']))
with check (created_by = auth.uid() or public.has_any_role(array['supervisor', 'admin']));

drop policy if exists "uploads_delete_owner_or_admin" on public.uploads;
create policy "uploads_delete_owner_or_admin"
on public.uploads
for delete
to authenticated
using (created_by = auth.uid() or public.has_any_role(array['supervisor', 'admin']));

drop policy if exists "reference_items_select_authenticated" on public.reference_items;
create policy "reference_items_select_authenticated"
on public.reference_items
for select
to authenticated
using (true);

drop policy if exists "reference_items_write_supervisor_admin" on public.reference_items;
create policy "reference_items_write_supervisor_admin"
on public.reference_items
for all
to authenticated
using (public.has_any_role(array['supervisor', 'admin']))
with check (public.has_any_role(array['supervisor', 'admin']));

insert into storage.buckets (id, name, public)
values ('vibration-assets', 'vibration-assets', false)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "vibration_assets_select" on storage.objects;
create policy "vibration_assets_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vibration-assets'
  and (
    public.has_any_role(array['supervisor', 'admin'])
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists "vibration_assets_insert" on storage.objects;
create policy "vibration_assets_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vibration-assets'
  and (
    public.has_any_role(array['supervisor', 'admin'])
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists "vibration_assets_update" on storage.objects;
create policy "vibration_assets_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'vibration-assets'
  and (
    public.has_any_role(array['supervisor', 'admin'])
    or (storage.foldername(name))[1] = auth.uid()::text
  )
)
with check (
  bucket_id = 'vibration-assets'
  and (
    public.has_any_role(array['supervisor', 'admin'])
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists "vibration_assets_delete" on storage.objects;
create policy "vibration_assets_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vibration-assets'
  and (
    public.has_any_role(array['supervisor', 'admin'])
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

commit;
