-- إصلاح تحقق صلاحية الدور في بوابات المرحلة 6.4
-- يمكن تنفيذه بأمان بعد ملف المرحلة 6.4 الأساسي.

create or replace function public.start_my_field_task(p_run_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_profile public.field_operator_profiles%rowtype;
begin
  select * into v_profile
  from public.field_operator_profiles
  where user_id = auth.uid() and active
  limit 1;

  if v_profile.id is null then raise exception 'PROFILE_NOT_AUTHORIZED'; end if;

  if not exists (
    select 1
    from public.daily_tasks_overview task
    where task.id = p_run_id
      and (cardinality(v_profile.project_ids) = 0 or task.project_id = any(v_profile.project_ids))
      and lower(trim(coalesce(task.current_actor_role, ''))) = lower(trim(v_profile.role))
  ) then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

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
  select * into v_profile
  from public.field_operator_profiles
  where user_id = auth.uid() and active
  limit 1;

  if v_profile.id is null then raise exception 'PROFILE_NOT_AUTHORIZED'; end if;

  if not exists (
    select 1
    from public.daily_tasks_overview task
    where task.id = p_run_id
      and (cardinality(v_profile.project_ids) = 0 or task.project_id = any(v_profile.project_ids))
      and lower(trim(coalesce(task.current_actor_role, ''))) = lower(trim(v_profile.role))
      and task.status not in ('completed', 'rejected', 'cancelled')
  ) then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  return public.complete_task_step(
    p_run_id,
    v_profile.display_name,
    p_notes,
    p_quantity,
    p_gps,
    p_reject
  );
end $$;

grant execute on function public.start_my_field_task(uuid) to authenticated;
grant execute on function public.complete_my_field_task_step(uuid,text,numeric,text,boolean) to authenticated;

notify pgrst, 'reload schema';
