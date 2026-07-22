-- منصة الأعمال الميدانية
-- المرحلة 6.4: بوابات المقاول والمشرف والمدير
-- يُنفذ بعد ملف المرحلة 6.3.

create extension if not exists pgcrypto;

create table if not exists public.field_operator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('contractor','supervisor','manager')),
  project_ids uuid[] not null default array[]::uuid[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists field_operator_profiles_role_idx
  on public.field_operator_profiles(role, active);

alter table public.field_operator_profiles enable row level security;

drop policy if exists field_operator_profile_self on public.field_operator_profiles;
create policy field_operator_profile_self on public.field_operator_profiles
for select to authenticated
using (user_id = auth.uid());

grant select on public.field_operator_profiles to authenticated;

create or replace function public.my_field_profile()
returns table(id uuid, display_name text, role text, project_ids uuid[], active boolean)
language sql stable security definer set search_path = public
as $$
  select p.id, p.display_name, p.role, p.project_ids, p.active
  from public.field_operator_profiles p
  where p.user_id = auth.uid() and p.active
  limit 1;
$$;

create or replace function public.my_field_tasks(p_scheduled_date date default current_date)
returns setof public.daily_tasks_overview
language sql stable security definer set search_path = public
as $$
  select task.*
  from public.daily_tasks_overview task
  join public.field_operator_profiles profile on profile.user_id = auth.uid() and profile.active
  where task.scheduled_date = p_scheduled_date
    and (cardinality(profile.project_ids) = 0 or task.project_id = any(profile.project_ids))
    and (
      profile.role = 'manager'
      or task.current_actor_role = profile.role
      or exists (
        select 1 from public.workflow_run_steps participated
        where participated.run_id = task.id
          and lower(trim(coalesce(participated.assigned_to, ''))) = lower(trim(profile.display_name))
      )
      or task.status in ('completed','rejected')
    )
  order by
    case task.status when 'rejected' then 0 when 'under_review' then 1 when 'in_progress' then 2 else 3 end,
    task.created_at;
$$;

create or replace function public.my_field_task(p_run_id uuid)
returns setof public.daily_tasks_overview
language sql stable security definer set search_path = public
as $$
  select task.*
  from public.daily_tasks_overview task
  join public.field_operator_profiles profile on profile.user_id = auth.uid() and profile.active
  where task.id = p_run_id
    and (cardinality(profile.project_ids) = 0 or task.project_id = any(profile.project_ids))
    and (
      profile.role = 'manager'
      or task.current_actor_role = profile.role
      or exists (
        select 1 from public.workflow_run_steps participated
        where participated.run_id = task.id
          and lower(trim(coalesce(participated.assigned_to, ''))) = lower(trim(profile.display_name))
      )
      or task.status in ('completed','rejected')
    );
$$;

create or replace function public.start_my_field_task(p_run_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_profile public.field_operator_profiles%rowtype;
begin
  select * into v_profile from public.field_operator_profiles where user_id = auth.uid() and active limit 1;
  if v_profile.id is null then raise exception 'PROFILE_NOT_AUTHORIZED'; end if;
  if not exists (
    select 1 from public.daily_tasks_overview task
    where task.id = p_run_id
      and (cardinality(v_profile.project_ids) = 0 or task.project_id = any(v_profile.project_ids))
      and lower(trim(coalesce(task.current_actor_role, ''))) = lower(trim(v_profile.role))
  ) then raise exception 'ROLE_NOT_ALLOWED'; end if;
  return public.start_task_run(p_run_id, v_profile.display_name);
end $$;

create or replace function public.complete_my_field_task_step(
  p_run_id uuid,
  p_notes text default null,
  p_quantity numeric default null,
  p_gps text default null,
  p_reject boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_profile public.field_operator_profiles%rowtype;
begin
  select * into v_profile from public.field_operator_profiles where user_id = auth.uid() and active limit 1;
  if v_profile.id is null then raise exception 'PROFILE_NOT_AUTHORIZED'; end if;
  if not exists (
    select 1 from public.daily_tasks_overview task
    where task.id = p_run_id
      and (cardinality(v_profile.project_ids) = 0 or task.project_id = any(v_profile.project_ids))
      and lower(trim(coalesce(task.current_actor_role, ''))) = lower(trim(v_profile.role))
      and task.status not in ('completed','rejected','cancelled')
  ) then raise exception 'ROLE_NOT_ALLOWED'; end if;
  return public.complete_task_step(p_run_id, v_profile.display_name, p_notes, p_quantity, p_gps, p_reject);
end $$;

grant execute on function public.my_field_profile() to authenticated;
grant execute on function public.my_field_tasks(date) to authenticated;
grant execute on function public.my_field_task(uuid) to authenticated;
grant execute on function public.start_my_field_task(uuid) to authenticated;
grant execute on function public.complete_my_field_task_step(uuid,text,numeric,text,boolean) to authenticated;

-- بعد إنشاء المستخدمين من Authentication > Users، اربط كل مستخدم بدوره:
-- insert into public.field_operator_profiles(user_id, display_name, role, project_ids)
-- values ('USER_UUID', 'اسم المستخدم', 'contractor', array['PROJECT_UUID']::uuid[]);

notify pgrst, 'reload schema';
