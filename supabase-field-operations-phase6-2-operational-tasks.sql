-- منصة الأعمال الميدانية
-- المرحلة 6.2: إنشاء السجل التشغيلي الحقيقي للمهام
-- يُنفذ بعد ملفات المرحلة 6.1 ومحاكاة التوليد.

create sequence if not exists public.daily_task_number_seq start 1;

alter table public.workflow_runs
  add column if not exists task_number text,
  add column if not exists source_schedule_id uuid references public.task_schedules(id) on delete set null,
  add column if not exists generation_batch_id uuid references public.daily_task_generation_batches(id) on delete set null;

create unique index if not exists workflow_runs_task_number_unique
  on public.workflow_runs(task_number)
  where task_number is not null;

create unique index if not exists workflow_runs_one_daily_task_unique
  on public.workflow_runs(project_id, location_id, work_type_id, scheduled_date)
  where status <> 'cancelled';

create or replace function public.assign_daily_task_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.task_number is null then
    new.task_number :=
      'TSK-' ||
      to_char(coalesce(new.scheduled_date, current_date), 'YYYYMMDD') ||
      '-' ||
      lpad(nextval('public.daily_task_number_seq')::text, 6, '0');
  end if;
  return new;
end $$;

drop trigger if exists workflow_runs_assign_task_number on public.workflow_runs;
create trigger workflow_runs_assign_task_number
before insert on public.workflow_runs
for each row execute function public.assign_daily_task_number();

update public.workflow_runs
set task_number =
  'TSK-' ||
  to_char(coalesce(scheduled_date, created_at::date), 'YYYYMMDD') ||
  '-' ||
  lpad(nextval('public.daily_task_number_seq')::text, 6, '0')
where task_number is null;

-- التوليد الحقيقي للمهام، ويستخدم نتيجة المحاكاة نفسها حتى تتطابق المعاينة مع الإنشاء.
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
  v_excluded integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtext('daily-task-generator:' || p_scheduled_date::text || ':' || coalesce(p_project_id::text, 'all'))
  );

  insert into public.daily_task_generation_batches(
    scheduled_date, project_id, requested_by,
    generated_count, skipped_existing_count, skipped_no_workflow_count, summary
  ) values (
    p_scheduled_date, p_project_id, p_requested_by,
    0, 0, 0, '{}'::jsonb
  ) returning id into v_batch_id;

  for r in
    select * from public.simulate_daily_tasks(p_scheduled_date, p_project_id)
  loop
    case r.generation_status
      when 'existing' then
        v_existing := v_existing + 1;
      when 'no_workflow' then
        v_no_workflow := v_no_workflow + 1;
      when 'ready' then
        begin
          v_run_id := public.start_workflow_run(
            r.work_type_id,
            r.project_id,
            r.location_id,
            p_scheduled_date,
            p_requested_by
          );

          update public.workflow_runs
          set source_schedule_id = r.schedule_id,
              generation_batch_id = v_batch_id
          where id = v_run_id;

          update public.workflow_run_steps
          set status = 'in_progress',
              started_at = coalesce(started_at, now())
          where run_id = v_run_id
            and step_order = 1;

          v_generated := v_generated + 1;
        exception
          when unique_violation then
            v_existing := v_existing + 1;
        end;
      else
        v_excluded := v_excluded + 1;
    end case;
  end loop;

  update public.daily_task_generation_batches
  set generated_count = v_generated,
      skipped_existing_count = v_existing,
      skipped_no_workflow_count = v_no_workflow,
      summary = jsonb_build_object(
        'generated', v_generated,
        'existing', v_existing,
        'no_workflow', v_no_workflow,
        'excluded', v_excluded,
        'date', p_scheduled_date
      )
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'scheduled_date', p_scheduled_date,
    'generated', v_generated,
    'existing', v_existing,
    'no_workflow', v_no_workflow,
    'excluded', v_excluded
  );
end $$;

create or replace view public.daily_tasks_overview as
select
  wr.id,
  wr.task_number,
  wr.scheduled_date,
  wr.status,
  wr.current_step_order,
  wr.started_at,
  wr.completed_at,
  wr.created_at,
  wr.project_id,
  p.name as project_name,
  wr.work_type_id,
  wt.name as work_type_name,
  wt.icon as work_type_icon,
  wr.location_id,
  l.name as location_name,
  l.location_code,
  l.location_category,
  current_step.name as current_step_name,
  current_step.actor_role as current_actor_role,
  current_step.status as current_step_status,
  counts.total_steps,
  counts.completed_steps
from public.workflow_runs wr
join public.projects p on p.id = wr.project_id
join public.work_types wt on wt.id = wr.work_type_id
join public.locations l on l.id = wr.location_id
left join public.workflow_run_steps current_step
  on current_step.run_id = wr.id
 and current_step.step_order = wr.current_step_order
left join lateral (
  select
    count(*)::integer as total_steps,
    count(*) filter (where s.status in ('completed','skipped'))::integer as completed_steps
  from public.workflow_run_steps s
  where s.run_id = wr.id
) counts on true;

grant select on public.daily_tasks_overview to anon, authenticated;
grant execute on function public.generate_daily_tasks(date, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
