alter table public.uploads drop constraint if exists uploads_asset_type_check;
alter table public.uploads
  add constraint uploads_asset_type_check
  check (asset_type in ('Spectrum', 'Waveform', 'Envelope', 'Photo'));

alter table public.uploads
  add column if not exists extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'needs-calibration', 'extracted', 'failed')),
  add column if not exists calibration jsonb not null default '{}'::jsonb,
  add column if not exists extracted_peaks jsonb not null default '[]'::jsonb,
  add column if not exists extraction_confidence numeric(5,2),
  add column if not exists trace_points jsonb not null default '[]'::jsonb,
  add column if not exists parse_error text;

alter table public.analysis_results
  add column if not exists asset_condition text,
  add column if not exists dominant_fault text,
  add column if not exists secondary_fault text,
  add column if not exists priority_score numeric(5,2),
  add column if not exists recommended_actions jsonb not null default '[]'::jsonb,
  add column if not exists point_diagnoses jsonb not null default '[]'::jsonb,
  add column if not exists priority_breakdown jsonb not null default '{}'::jsonb;

alter table public.measurement_sets
  add column if not exists machine_context jsonb not null default '{}'::jsonb,
  add column if not exists extraction_summary jsonb not null default '{}'::jsonb;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid references public.equipment(id) on delete set null,
  measurement_set_id uuid references public.measurement_sets(id) on delete set null,
  analysis_result_id uuid references public.analysis_results(id) on delete set null,
  report_type text not null default 'pdf' check (report_type in ('pdf', 'excel', 'csv')),
  file_name text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

drop policy if exists "reports_select_owner_or_admin" on public.reports;
create policy "reports_select_owner_or_admin"
on public.reports
for select
to authenticated
using (created_by = auth.uid() or public.has_role(auth.uid(), array['supervisor', 'admin']));

drop policy if exists "reports_insert_authenticated" on public.reports;
create policy "reports_insert_authenticated"
on public.reports
for insert
to authenticated
with check (created_by = auth.uid() or public.has_role(auth.uid(), array['supervisor', 'admin']));

drop policy if exists "reports_update_owner_or_admin" on public.reports;
create policy "reports_update_owner_or_admin"
on public.reports
for update
to authenticated
using (created_by = auth.uid() or public.has_role(auth.uid(), array['supervisor', 'admin']))
with check (created_by = auth.uid() or public.has_role(auth.uid(), array['supervisor', 'admin']));

drop policy if exists "reports_delete_owner_or_admin" on public.reports;
create policy "reports_delete_owner_or_admin"
on public.reports
for delete
to authenticated
using (created_by = auth.uid() or public.has_role(auth.uid(), array['supervisor', 'admin']));

create index if not exists uploads_extraction_status_idx
on public.uploads (extraction_status);

create index if not exists uploads_extracted_peaks_gin_idx
on public.uploads using gin (extracted_peaks);

create index if not exists reports_measurement_set_idx
on public.reports (measurement_set_id, created_at desc);
