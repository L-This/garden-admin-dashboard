-- منصة الأعمال الميدانية: المرحلة 6.1
-- مولد المهام اليومية (Daily Task Generator)
-- يُنفذ بعد ملف المرحلة الخامسة لمحرك سير الأعمال.

create extension if not exists pgcrypto;

create table if not exists public.task_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  work_type_id uuid not null references public.work_types(id) on delete cascade,
  recurrence_type text not null default 'weekly'
    check (recurrence_type in ('daily','weekly','once')),
  start_date date not null default current_date,
  end_date date,
  weekdays smallint[] not null default array[]::smallint[],
  scope_mode text not null default 'all'
    check (scope_mode in ('all','categories','selected')),
  active boolean not null default true,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_schedules_date_range check (end_date is null or end_date >= start_date),
  constraint task_schedules_weekdays check (
    weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
  )
);

create table if not exists public.task_schedule_categories (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.task_schedules(id) on delete cascade,
  category_name text not null,
  created_at timestamptz not null default now(),
  constraint task_schedule_categories_unique unique(schedule_id, category_name)
);

create table if not exists public.task_schedule_locations (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.task_schedules(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint task_schedule_locations_unique unique(schedule_id, location_id)
);

create table if not exists public.daily_task_generation_batches (
  id uuid primary key default gen_random_uuid(),
  scheduled_date date not null,
  project_id uuid references public.projects(id) on delete set null,
  requested_by text,
  generated_count integer not null default 0,
  skipped_existing_count integer not null default 0,
  skipped_no_workflow_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_schedules_lookup_idx
  on public.task_schedules(project_id, work_type_id, active, start_date, end_date);
create index if not exists task_schedule_categories_schedule_idx
  on public.task_schedule_categories(schedule_id, category_name);
create index if not exists task_schedule_locations_schedule_idx
  on public.task_schedule_locations(schedule_id, location_id);
create index if not exists daily_task_generation_batches_date_idx
  on public.daily_task_generation_batches(scheduled_date, created_at desc);

-- يمنع تكرار المهمة لنفس التاريخ والمشروع والموقع ونوع العمل.
create unique index if not exists workflow_runs_daily_task_unique
  on public.workflow_runs(scheduled_date, project_id, location_id, work_type_id)
  where scheduled_date is not null and status <> 'cancelled';

create or replace function public.touch_task_schedule_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists task_schedules_touch_updated_at on public.task_schedules;
create trigger task_schedules_touch_updated_at
before update on public.task_schedules
for each row execute function public.touch_task_schedule_updated_at();

-- هل الجدول مستحق في التاريخ المحدد؟
create or replace function public.task_schedule_matches_date(
  p_schedule public.task_schedules,
  p_date date
)
returns boolean
language sql
stable
as $$
  select
    p_schedule.active
    and p_date >= p_schedule.start_date
    and (p_schedule.end_date is null or p_date <= p_schedule.end_date)
    and case p_schedule.recurrence_type
      when 'daily' then true
      when 'once' then p_date = p_schedule.start_date
      when 'weekly' then extract(dow from p_date)::smallint = any(p_schedule.weekdays)
      else false
    end;
$$;

-- معاينة المهام التي سيولدها المحرك قبل الاعتماد.
create or replace function public.preview_daily_tasks(
  p_scheduled_date date default current_date,
  p_project_id uuid default null
)
returns table (
  schedule_id uuid,
  schedule_name text,
  project_id uuid,
  project_name text,
  work_type_id uuid,
  work_type_name text,
  location_id uuid,
  location_name text,
  location_code text,
  location_category text,
  generation_status text
)
language sql
stable
security definer
set search_path = public
as $$
  with eligible_schedules as (
    select s.*
    from public.task_schedules s
    where public.task_schedule_matches_date(s, p_scheduled_date)
      and (p_project_id is null or s.project_id = p_project_id)
  ), eligible_locations as (
    select
      s.id as schedule_id,
      s.name as schedule_name,
      s.project_id,
      s.work_type_id,
      l.id as location_id
    from eligible_schedules s
    join public.locations l
      on l.project_id = s.project_id
     and coalesce(l.active, true)
    where
      -- ربط نوع العمل بالمشروع إن وُجدت روابط؛ عدم وجود روابط يعني متاح للمشاريع كلها.
      (
        not exists (
          select 1 from public.work_type_projects wtp
          where wtp.work_type_id = s.work_type_id and wtp.active
        )
        or exists (
          select 1 from public.work_type_projects wtp
          where wtp.work_type_id = s.work_type_id
            and wtp.project_id = s.project_id
            and wtp.active
        )
      )
      -- احترام ربط نوع العمل بالتصنيفات.
      and (
        not exists (
          select 1 from public.work_type_categories wtc
          where wtc.work_type_id = s.work_type_id
        )
        or exists (
          select 1 from public.work_type_categories wtc
          where wtc.work_type_id = s.work_type_id
            and wtc.category_name = coalesce(l.location_category, 'غير مصنف')
        )
      )
      -- احترام الربط المباشر لنوع العمل بالمواقع إن وُجد.
      and (
        not exists (
          select 1 from public.work_type_locations wtl
          where wtl.work_type_id = s.work_type_id and wtl.active
        )
        or exists (
          select 1 from public.work_type_locations wtl
          where wtl.work_type_id = s.work_type_id
            and wtl.location_id = l.id
            and wtl.active
        )
      )
      -- نطاق الجدول نفسه.
      and case s.scope_mode
        when 'all' then true
        when 'categories' then exists (
          select 1 from public.task_schedule_categories sc
          where sc.schedule_id = s.id
            and sc.category_name = coalesce(l.location_category, 'غير مصنف')
        )
        when 'selected' then exists (
          select 1 from public.task_schedule_locations sl
          where sl.schedule_id = s.id and sl.location_id = l.id
        )
        else false
      end
  )
  select
    e.schedule_id,
    e.schedule_name,
    e.project_id,
    p.name as project_name,
    e.work_type_id,
    wt.name as work_type_name,
    e.location_id,
    l.name as location_name,
    l.location_code,
    l.location_category,
    case
      when exists (
        select 1 from public.workflow_runs wr
        where wr.scheduled_date = p_scheduled_date
          and wr.project_id = e.project_id
          and wr.location_id = e.location_id
          and wr.work_type_id = e.work_type_id
          and wr.status <> 'cancelled'
      ) then 'existing'
      when not exists (
        select 1 from public.workflow_definitions wd
        where wd.work_type_id = e.work_type_id
          and wd.status = 'published'
          and wd.active
      ) then 'no_workflow'
      else 'ready'
    end as generation_status
  from eligible_locations e
  join public.projects p on p.id = e.project_id
  join public.work_types wt on wt.id = e.work_type_id
  join public.locations l on l.id = e.location_id
  order by p.name, wt.sort_order nulls last, wt.name, l.location_code nulls last, l.name;
$$;

-- التوليد الفعلي. الدالة آمنة ضد التكرار ويمكن تشغيلها أكثر من مرة لنفس اليوم.
create or replace function public.generate_daily_tasks(
  p_scheduled_date date default current_date,
  p_project_id uuid default null,
  p_requested_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_run_id uuid;
  v_batch_id uuid;
  v_generated integer := 0;
  v_existing integer := 0;
  v_no_workflow integer := 0;
begin
  -- قفل منطقي لليوم والمشروع لمنع طلبين متزامنين.
  perform pg_advisory_xact_lock(
    hashtext('daily-task-generator:' || p_scheduled_date::text || ':' || coalesce(p_project_id::text, 'all'))
  );

  for r in
    select * from public.preview_daily_tasks(p_scheduled_date, p_project_id)
  loop
    if r.generation_status = 'existing' then
      v_existing := v_existing + 1;
    elsif r.generation_status = 'no_workflow' then
      v_no_workflow := v_no_workflow + 1;
    else
      begin
        v_run_id := public.start_workflow_run(
          r.work_type_id,
          r.project_id,
          r.location_id,
          p_scheduled_date,
          p_requested_by
        );
        v_generated := v_generated + 1;
      exception
        when unique_violation then
          v_existing := v_existing + 1;
      end;
    end if;
  end loop;

  insert into public.daily_task_generation_batches(
    scheduled_date, project_id, requested_by,
    generated_count, skipped_existing_count, skipped_no_workflow_count, summary
  ) values (
    p_scheduled_date, p_project_id, p_requested_by,
    v_generated, v_existing, v_no_workflow,
    jsonb_build_object(
      'generated', v_generated,
      'existing', v_existing,
      'no_workflow', v_no_workflow,
      'date', p_scheduled_date
    )
  ) returning id into v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'scheduled_date', p_scheduled_date,
    'generated', v_generated,
    'existing', v_existing,
    'no_workflow', v_no_workflow
  );
end $$;

alter table public.task_schedules enable row level security;
alter table public.task_schedule_categories enable row level security;
alter table public.task_schedule_locations enable row level security;
alter table public.daily_task_generation_batches enable row level security;

drop policy if exists task_schedules_all on public.task_schedules;
create policy task_schedules_all on public.task_schedules for all to anon, authenticated using (true) with check (true);
drop policy if exists task_schedule_categories_all on public.task_schedule_categories;
create policy task_schedule_categories_all on public.task_schedule_categories for all to anon, authenticated using (true) with check (true);
drop policy if exists task_schedule_locations_all on public.task_schedule_locations;
create policy task_schedule_locations_all on public.task_schedule_locations for all to anon, authenticated using (true) with check (true);
drop policy if exists daily_task_generation_batches_all on public.daily_task_generation_batches;
create policy daily_task_generation_batches_all on public.daily_task_generation_batches for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.task_schedules to anon, authenticated;
grant select, insert, update, delete on public.task_schedule_categories to anon, authenticated;
grant select, insert, update, delete on public.task_schedule_locations to anon, authenticated;
grant select, insert, update, delete on public.daily_task_generation_batches to anon, authenticated;
grant execute on function public.preview_daily_tasks(date,uuid) to anon, authenticated;
grant execute on function public.generate_daily_tasks(date,uuid,text) to anon, authenticated;

notify pgrst, 'reload schema';
