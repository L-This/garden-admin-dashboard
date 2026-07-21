-- منصة الأعمال الميدانية: المرحلة الخامسة
-- محرك سير الأعمال (Workflow Engine)
-- يُنفذ بعد supabase-field-operations-phase4.sql

create extension if not exists pgcrypto;

-- تعريف سير عمل واحد لكل نوع عمل، مع الاحتفاظ بالإصدارات المنشورة.
create table if not exists public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  work_type_id uuid not null references public.work_types(id) on delete cascade,
  name text not null,
  description text,
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  active boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_definitions_work_version_unique unique(work_type_id, version)
);

create unique index if not exists workflow_definitions_one_draft_per_work
on public.workflow_definitions(work_type_id)
where status = 'draft';

create index if not exists workflow_definitions_work_idx
on public.workflow_definitions(work_type_id, status, version desc);

-- خطوات سير العمل المرتبة.
create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflow_definitions(id) on delete cascade,
  step_key text not null,
  name text not null,
  description text,
  step_order integer not null,
  step_type text not null default 'execution'
    check (step_type in ('execution','review','approval','completion')),
  actor_role text not null default 'contractor'
    check (actor_role in ('contractor','supervisor','manager','system')),
  status_after text not null default 'in_progress',
  required boolean not null default true,
  can_reject boolean not null default false,
  sla_hours integer,
  requires_photos boolean not null default false,
  requires_notes boolean not null default false,
  requires_quantity boolean not null default false,
  requires_gps boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_steps_order_unique unique(workflow_id, step_order),
  constraint workflow_steps_key_unique unique(workflow_id, step_key),
  constraint workflow_steps_sla_check check (sla_hours is null or sla_hours >= 0)
);

create index if not exists workflow_steps_workflow_idx
on public.workflow_steps(workflow_id, step_order);

-- حالات التشغيل الفعلية التي ستنشأ لاحقًا من الجدولة والمهام اليومية.
create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflow_definitions(id) on delete restrict,
  work_type_id uuid not null references public.work_types(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  scheduled_date date,
  status text not null default 'pending'
    check (status in ('pending','in_progress','under_review','approved','completed','rejected','cancelled')),
  current_step_order integer not null default 1,
  started_at timestamptz,
  completed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_runs_daily_idx
on public.workflow_runs(project_id, scheduled_date, status);
create index if not exists workflow_runs_location_idx
on public.workflow_runs(location_id, work_type_id, scheduled_date);

create table if not exists public.workflow_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  workflow_step_id uuid not null references public.workflow_steps(id) on delete restrict,
  step_order integer not null,
  name text not null,
  actor_role text not null,
  status text not null default 'pending'
    check (status in ('pending','in_progress','completed','rejected','skipped')),
  assigned_to text,
  payload jsonb not null default '{}'::jsonb,
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workflow_run_steps_unique unique(run_id, step_order)
);

create index if not exists workflow_run_steps_run_idx
on public.workflow_run_steps(run_id, step_order);

-- تحديث updated_at.
create or replace function public.touch_workflow_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists workflow_definitions_touch_updated_at on public.workflow_definitions;
create trigger workflow_definitions_touch_updated_at
before update on public.workflow_definitions
for each row execute function public.touch_workflow_updated_at();

drop trigger if exists workflow_steps_touch_updated_at on public.workflow_steps;
create trigger workflow_steps_touch_updated_at
before update on public.workflow_steps
for each row execute function public.touch_workflow_updated_at();

drop trigger if exists workflow_runs_touch_updated_at on public.workflow_runs;
create trigger workflow_runs_touch_updated_at
before update on public.workflow_runs
for each row execute function public.touch_workflow_updated_at();

-- إنشاء مسودة افتراضية لنوع عمل إن لم توجد.
create or replace function public.ensure_workflow_draft(p_work_type_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work public.work_types%rowtype;
  v_id uuid;
  v_source_id uuid;
begin
  select * into v_work from public.work_types where id = p_work_type_id;
  if v_work.id is null then raise exception 'WORK_TYPE_NOT_FOUND'; end if;

  select id into v_id
  from public.workflow_definitions
  where work_type_id = p_work_type_id and status = 'draft'
  limit 1;

  if v_id is not null then return v_id; end if;

  insert into public.workflow_definitions(work_type_id, name, description, version, status)
  values (
    p_work_type_id,
    'سير عمل ' || v_work.name,
    'مسودة تشغيلية قابلة للتعديل قبل النشر.',
    coalesce((select max(version) + 1 from public.workflow_definitions where work_type_id = p_work_type_id), 1),
    'draft'
  ) returning id into v_id;

  select id into v_source_id
  from public.workflow_definitions
  where work_type_id = p_work_type_id and status = 'published'
  order by version desc limit 1;

  if v_source_id is not null then
    insert into public.workflow_steps(
      workflow_id, step_key, name, description, step_order, step_type, actor_role,
      status_after, required, can_reject, sla_hours, requires_photos, requires_notes,
      requires_quantity, requires_gps
    )
    select
      v_id, step_key, name, description, step_order, step_type, actor_role,
      status_after, required, can_reject, sla_hours, requires_photos, requires_notes,
      requires_quantity, requires_gps
    from public.workflow_steps
    where workflow_id = v_source_id
    order by step_order;
  else
    insert into public.workflow_steps(
      workflow_id, step_key, name, description, step_order, step_type, actor_role,
      status_after, required, can_reject, requires_photos, requires_notes,
      requires_quantity, requires_gps
    ) values
      (v_id, 'execute', 'تنفيذ العمل', 'ينفذ المقاول العمل ويرفع المتطلبات.', 1, 'execution', 'contractor', 'under_review', true, false,
        coalesce(v_work.requires_photos,false), coalesce(v_work.requires_notes,false),
        coalesce(v_work.requires_quantity,false), coalesce(v_work.requires_gps,false)),
      (v_id, 'review', 'مراجعة المشرف', 'يراجع المشرف التنفيذ والمرفقات.', 2, 'review', 'supervisor', 'approved', true, true, false, true, false, false),
      (v_id, 'close', 'إغلاق المهمة', 'إغلاق واعتماد المهمة في السجل.', 3, 'completion', 'system', 'completed', true, false, false, false, false, false);
  end if;

  return v_id;
end $$;

-- نشر المسودة: يؤرشف المنشور السابق ويثبت المسودة الحالية.
create or replace function public.publish_workflow(p_workflow_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow public.workflow_definitions%rowtype;
  v_steps integer;
begin
  select * into v_workflow from public.workflow_definitions where id = p_workflow_id for update;
  if v_workflow.id is null then raise exception 'WORKFLOW_NOT_FOUND'; end if;
  if v_workflow.status <> 'draft' then raise exception 'ONLY_DRAFT_CAN_BE_PUBLISHED'; end if;

  select count(*) into v_steps from public.workflow_steps where workflow_id = p_workflow_id;
  if v_steps = 0 then raise exception 'WORKFLOW_REQUIRES_STEPS'; end if;

  update public.workflow_definitions
  set status = 'archived', active = false
  where work_type_id = v_workflow.work_type_id
    and status = 'published';

  update public.workflow_definitions
  set status = 'published', active = true, published_at = now(), updated_at = now()
  where id = p_workflow_id;

  return jsonb_build_object('workflow_id', p_workflow_id, 'steps', v_steps, 'status', 'published');
end $$;

-- بدء تشغيل فعلي ونسخ الخطوات إلى سجل المهمة.
create or replace function public.start_workflow_run(
  p_work_type_id uuid,
  p_project_id uuid,
  p_location_id uuid,
  p_scheduled_date date default current_date,
  p_created_by text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow_id uuid;
  v_run_id uuid;
begin
  select id into v_workflow_id
  from public.workflow_definitions
  where work_type_id = p_work_type_id and status = 'published' and active = true
  order by version desc limit 1;

  if v_workflow_id is null then raise exception 'NO_PUBLISHED_WORKFLOW'; end if;

  insert into public.workflow_runs(
    workflow_id, work_type_id, project_id, location_id, scheduled_date,
    status, current_step_order, created_by
  ) values (
    v_workflow_id, p_work_type_id, p_project_id, p_location_id, p_scheduled_date,
    'pending', 1, p_created_by
  ) returning id into v_run_id;

  insert into public.workflow_run_steps(run_id, workflow_step_id, step_order, name, actor_role)
  select v_run_id, id, step_order, name, actor_role
  from public.workflow_steps
  where workflow_id = v_workflow_id
  order by step_order;

  return v_run_id;
end $$;

-- تقدم المهمة خطوة واحدة بعد إكمال الخطوة الحالية.
create or replace function public.advance_workflow_run(
  p_run_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_notes text default null,
  p_reject boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.workflow_runs%rowtype;
  v_step public.workflow_run_steps%rowtype;
  v_definition_step public.workflow_steps%rowtype;
  v_next integer;
  v_max integer;
begin
  select * into v_run from public.workflow_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'RUN_NOT_FOUND'; end if;

  select * into v_step from public.workflow_run_steps
  where run_id = p_run_id and step_order = v_run.current_step_order for update;
  select * into v_definition_step from public.workflow_steps where id = v_step.workflow_step_id;

  if p_reject and not coalesce(v_definition_step.can_reject,false) then
    raise exception 'STEP_CANNOT_REJECT';
  end if;

  update public.workflow_run_steps
  set status = case when p_reject then 'rejected' else 'completed' end,
      payload = coalesce(p_payload,'{}'::jsonb), notes = p_notes,
      started_at = coalesce(started_at, now()), completed_at = now()
  where id = v_step.id;

  if p_reject then
    update public.workflow_runs set status = 'rejected', completed_at = now() where id = p_run_id;
    return jsonb_build_object('run_id',p_run_id,'status','rejected');
  end if;

  select max(step_order) into v_max from public.workflow_run_steps where run_id = p_run_id;
  v_next := v_run.current_step_order + 1;

  if v_next > v_max then
    update public.workflow_runs
    set status = 'completed', completed_at = now(), current_step_order = v_max
    where id = p_run_id;
    return jsonb_build_object('run_id',p_run_id,'status','completed');
  end if;

  update public.workflow_runs
  set status = case
        when v_definition_step.status_after in ('under_review','approved') then v_definition_step.status_after
        else 'in_progress'
      end,
      current_step_order = v_next,
      started_at = coalesce(started_at, now())
  where id = p_run_id;

  update public.workflow_run_steps
  set status = 'in_progress', started_at = now()
  where run_id = p_run_id and step_order = v_next;

  return jsonb_build_object('run_id',p_run_id,'status','in_progress','current_step_order',v_next);
end $$;

-- إنشاء مسودات افتراضية لكل أنواع الأعمال الحالية.
do $$
declare r record;
begin
  for r in select id from public.work_types loop
    perform public.ensure_workflow_draft(r.id);
  end loop;
end $$;

-- RLS والسياسات للواجهة الحالية.
alter table public.workflow_definitions enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.workflow_run_steps enable row level security;

drop policy if exists workflow_definitions_all on public.workflow_definitions;
create policy workflow_definitions_all on public.workflow_definitions for all to anon, authenticated using (true) with check (true);
drop policy if exists workflow_steps_all on public.workflow_steps;
create policy workflow_steps_all on public.workflow_steps for all to anon, authenticated using (true) with check (true);
drop policy if exists workflow_runs_all on public.workflow_runs;
create policy workflow_runs_all on public.workflow_runs for all to anon, authenticated using (true) with check (true);
drop policy if exists workflow_run_steps_all on public.workflow_run_steps;
create policy workflow_run_steps_all on public.workflow_run_steps for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.workflow_definitions to anon, authenticated;
grant select, insert, update, delete on public.workflow_steps to anon, authenticated;
grant select, insert, update, delete on public.workflow_runs to anon, authenticated;
grant select, insert, update, delete on public.workflow_run_steps to anon, authenticated;
grant execute on function public.ensure_workflow_draft(uuid) to anon, authenticated;
grant execute on function public.publish_workflow(uuid) to anon, authenticated;
grant execute on function public.start_workflow_run(uuid,uuid,uuid,date,text) to anon, authenticated;
grant execute on function public.advance_workflow_run(uuid,jsonb,text,boolean) to anon, authenticated;

notify pgrst, 'reload schema';
