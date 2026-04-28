-- Final save compatibility patch
create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.gardens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  district text,
  created_at timestamptz default now()
);

create table if not exists public.garden_assessments (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid references public.gardens(id) on delete set null,
  garden_name text not null,
  project text not null,
  district text,
  score int not null check(score between 0 and 100),
  priority text not null,
  is_demo boolean default false,
  evaluated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.assessment_criteria (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid references public.garden_assessments(id) on delete cascade,
  criterion_name text not null,
  weight int not null,
  selected_label text not null,
  value int not null,
  created_at timestamptz default now()
);

create table if not exists public.criterion_photos (
  id uuid primary key default gen_random_uuid(),
  criterion_id uuid references public.assessment_criteria(id) on delete cascade,
  photo_url text not null,
  note text,
  created_at timestamptz default now()
);

alter table public.garden_assessments add column if not exists garden_id uuid references public.gardens(id) on delete set null;
alter table public.garden_assessments add column if not exists garden_name text;
alter table public.garden_assessments add column if not exists project text;
alter table public.garden_assessments add column if not exists district text;
alter table public.garden_assessments add column if not exists score int;
alter table public.garden_assessments add column if not exists priority text;
alter table public.garden_assessments add column if not exists is_demo boolean default false;

alter table public.assessment_criteria add column if not exists assessment_id uuid references public.garden_assessments(id) on delete cascade;
alter table public.assessment_criteria add column if not exists criterion_name text;
alter table public.assessment_criteria add column if not exists weight int;
alter table public.assessment_criteria add column if not exists selected_label text;
alter table public.assessment_criteria add column if not exists value int;

alter table public.criterion_photos add column if not exists criterion_id uuid references public.assessment_criteria(id) on delete cascade;
alter table public.criterion_photos add column if not exists photo_url text;
alter table public.criterion_photos add column if not exists note text;

alter table public.projects enable row level security;
alter table public.gardens enable row level security;
alter table public.garden_assessments enable row level security;
alter table public.assessment_criteria enable row level security;
alter table public.criterion_photos enable row level security;

drop policy if exists "public all projects" on public.projects;
drop policy if exists "public all gardens" on public.gardens;
drop policy if exists "public all assessments" on public.garden_assessments;
drop policy if exists "public all criteria" on public.assessment_criteria;
drop policy if exists "public all photos" on public.criterion_photos;

create policy "public all projects" on public.projects for all using(true) with check(true);
create policy "public all gardens" on public.gardens for all using(true) with check(true);
create policy "public all assessments" on public.garden_assessments for all using(true) with check(true);
create policy "public all criteria" on public.assessment_criteria for all using(true) with check(true);
create policy "public all photos" on public.criterion_photos for all using(true) with check(true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.projects to anon, authenticated;
grant select, insert, update, delete on public.gardens to anon, authenticated;
grant select, insert, update, delete on public.garden_assessments to anon, authenticated;
grant select, insert, update, delete on public.assessment_criteria to anon, authenticated;
grant select, insert, update, delete on public.criterion_photos to anon, authenticated;

insert into storage.buckets(id, name, public)
values ('criterion-photos', 'criterion-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "public read criterion photos bucket" on storage.objects;
drop policy if exists "public upload criterion photos bucket" on storage.objects;

create policy "public read criterion photos bucket"
on storage.objects for select
using(bucket_id = 'criterion-photos');

create policy "public upload criterion photos bucket"
on storage.objects for insert
with check(bucket_id = 'criterion-photos');
