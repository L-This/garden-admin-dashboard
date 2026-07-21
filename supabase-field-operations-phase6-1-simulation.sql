-- منصة الأعمال الميدانية
-- تحسين المرحلة 6.1: محاكاة توليد المهام وشرح أسباب الاستبعاد
-- يُنفذ بعد supabase-field-operations-phase6-1-daily-task-generator.sql

create or replace function public.simulate_daily_tasks(
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
  generation_status text,
  reason_text text
)
language sql
stable
security definer
set search_path = public
as $$
  with due_schedules as (
    select s.*
    from public.task_schedules s
    where public.task_schedule_matches_date(s, p_scheduled_date)
      and (p_project_id is null or s.project_id = p_project_id)
  ),
  candidates as (
    select
      s.id as schedule_id,
      s.name as schedule_name,
      s.project_id,
      p.name as project_name,
      s.work_type_id,
      wt.name as work_type_name,
      s.scope_mode,
      l.id as location_id,
      l.name as location_name,
      l.location_code,
      l.location_category,

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
      ) as project_allowed,

      (
        not exists (
          select 1 from public.work_type_categories wtc
          where wtc.work_type_id = s.work_type_id
        )
        or exists (
          select 1 from public.work_type_categories wtc
          where wtc.work_type_id = s.work_type_id
            and wtc.category_name = coalesce(l.location_category, 'غير مصنف')
        )
      ) as category_allowed,

      (
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
      ) as direct_location_allowed,

      case s.scope_mode
        when 'all' then true
        when 'categories' then exists (
          select 1 from public.task_schedule_categories sc
          where sc.schedule_id = s.id
            and sc.category_name = coalesce(l.location_category, 'غير مصنف')
        )
        when 'selected' then exists (
          select 1 from public.task_schedule_locations sl
          where sl.schedule_id = s.id
            and sl.location_id = l.id
        )
        else false
      end as schedule_scope_allowed,

      exists (
        select 1 from public.workflow_runs wr
        where wr.scheduled_date = p_scheduled_date
          and wr.project_id = s.project_id
          and wr.location_id = l.id
          and wr.work_type_id = s.work_type_id
          and wr.status <> 'cancelled'
      ) as task_exists,

      exists (
        select 1 from public.workflow_definitions wd
        where wd.work_type_id = s.work_type_id
          and wd.status = 'published'
          and wd.active
      ) as has_published_workflow

    from due_schedules s
    join public.projects p on p.id = s.project_id
    join public.work_types wt on wt.id = s.work_type_id
    join public.locations l
      on l.project_id = s.project_id
     and coalesce(l.active, true)
  )
  select
    c.schedule_id,
    c.schedule_name,
    c.project_id,
    c.project_name,
    c.work_type_id,
    c.work_type_name,
    c.location_id,
    c.location_name,
    c.location_code,
    c.location_category,
    case
      when not c.project_allowed then 'excluded_project'
      when not c.category_allowed then 'excluded_category'
      when not c.direct_location_allowed then 'excluded_location'
      when not c.schedule_scope_allowed then 'excluded_scope'
      when c.task_exists then 'existing'
      when not c.has_published_workflow then 'no_workflow'
      else 'ready'
    end as generation_status,
    case
      when not c.project_allowed then 'نوع العمل غير مرتبط بهذا المشروع.'
      when not c.category_allowed then 'تصنيف الموقع غير مسموح لهذا النوع من الأعمال.'
      when not c.direct_location_allowed then 'الموقع غير موجود ضمن المواقع المباشرة المسموحة لنوع العمل.'
      when not c.schedule_scope_allowed then
        case c.scope_mode
          when 'selected' then 'الموقع غير محدد في جدول التشغيل.'
          when 'categories' then 'تصنيف الموقع غير محدد في جدول التشغيل.'
          else 'الموقع خارج نطاق جدول التشغيل.'
        end
      when c.task_exists then 'تم إنشاء مهمة لهذا الموقع ونوع العمل والتاريخ مسبقًا.'
      when not c.has_published_workflow then 'لا توجد نسخة منشورة وفعالة من سير العمل.'
      else 'جميع الشروط مكتملة وستُنشأ المهمة عند الضغط على التوليد.'
    end as reason_text
  from candidates c
  order by c.project_name, c.work_type_name, c.location_code nulls last, c.location_name;
$$;

grant execute on function public.simulate_daily_tasks(date, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
