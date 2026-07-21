-- منصة الأعمال الميدانية
-- استكمال المرحلة 6.2: بطاقة التشغيل الكاملة للمهمة
-- يُنفذ بعد supabase-field-operations-phase6-2-operational-tasks.sql

create extension if not exists pgcrypto;

create table if not exists public.workflow_task_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  run_step_id uuid references public.workflow_run_steps(id) on delete set null,
  event_type text not null,
  title text not null,
  details text,
  actor_name text,
  actor_role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workflow_task_events_run_idx
  on public.workflow_task_events(run_id, created_at);

create table if not exists public.workflow_task_attachments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  run_step_id uuid references public.workflow_run_steps(id) on delete set null,
  file_name text not null,
  file_type text,
  storage_path text,
  public_url text,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create index if not exists workflow_task_attachments_run_idx
  on public.workflow_task_attachments(run_id, created_at desc);

create table if not exists public.workflow_task_comments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  run_step_id uuid references public.workflow_run_steps(id) on delete set null,
  body text not null,
  author_name text,
  author_role text,
  created_at timestamptz not null default now()
);

create index if not exists workflow_task_comments_run_idx
  on public.workflow_task_comments(run_id, created_at desc);

-- إنشاء حدث تلقائي عند إنشاء أي مهمة جديدة، بما في ذلك المهام الثلاث الحالية إن لم يكن لها حدث.
insert into public.workflow_task_events(run_id, event_type, title, details, actor_role, created_at)
select wr.id, 'created', 'تم إنشاء المهمة', 'تم توليد المهمة من جدول التشغيل وربطها بسير العمل المنشور.', 'system', wr.created_at
from public.workflow_runs wr
where not exists (
  select 1 from public.workflow_task_events e
  where e.run_id = wr.id and e.event_type = 'created'
);

create or replace function public.start_task_run(
  p_run_id uuid,
  p_actor_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.workflow_runs%rowtype;
  v_step public.workflow_run_steps%rowtype;
begin
  select * into v_run from public.workflow_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  if v_run.status <> 'pending' then raise exception 'TASK_ALREADY_STARTED'; end if;

  select * into v_step
  from public.workflow_run_steps
  where run_id = p_run_id and step_order = v_run.current_step_order
  for update;

  update public.workflow_runs
  set status = 'in_progress',
      started_at = coalesce(started_at, now())
  where id = p_run_id;

  update public.workflow_run_steps
  set status = 'in_progress',
      assigned_to = coalesce(p_actor_name, assigned_to),
      started_at = coalesce(started_at, now())
  where id = v_step.id;

  insert into public.workflow_task_events(
    run_id, run_step_id, event_type, title, details, actor_name, actor_role
  ) values (
    p_run_id, v_step.id, 'started', 'بدأ تنفيذ المهمة',
    'تم بدء الخطوة: ' || v_step.name,
    p_actor_name, v_step.actor_role
  );

  return jsonb_build_object('run_id', p_run_id, 'status', 'in_progress');
end $$;

create or replace function public.complete_task_step(
  p_run_id uuid,
  p_actor_name text default null,
  p_notes text default null,
  p_quantity numeric default null,
  p_gps text default null,
  p_reject boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.workflow_runs%rowtype;
  v_run_step public.workflow_run_steps%rowtype;
  v_step public.workflow_steps%rowtype;
  v_attachment_count integer := 0;
  v_comment_count integer := 0;
  v_result jsonb;
begin
  select * into v_run from public.workflow_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  if v_run.status in ('completed','cancelled','rejected') then raise exception 'TASK_IS_CLOSED'; end if;

  select * into v_run_step
  from public.workflow_run_steps
  where run_id = p_run_id and step_order = v_run.current_step_order
  for update;

  select * into v_step
  from public.workflow_steps
  where id = v_run_step.workflow_step_id;

  select count(*)::int into v_attachment_count
  from public.workflow_task_attachments
  where run_id = p_run_id
    and (run_step_id = v_run_step.id or run_step_id is null);

  select count(*)::int into v_comment_count
  from public.workflow_task_comments
  where run_id = p_run_id
    and (run_step_id = v_run_step.id or run_step_id is null);

  if not p_reject then
    if coalesce(v_step.requires_photos,false) and v_attachment_count = 0 then
      raise exception 'PHOTOS_REQUIRED';
    end if;
    if coalesce(v_step.requires_notes,false)
       and nullif(trim(coalesce(p_notes,'')), '') is null
       and v_comment_count = 0 then
      raise exception 'NOTES_REQUIRED';
    end if;
    if coalesce(v_step.requires_quantity,false) and p_quantity is null then
      raise exception 'QUANTITY_REQUIRED';
    end if;
    if coalesce(v_step.requires_gps,false)
       and nullif(trim(coalesce(p_gps,'')), '') is null then
      raise exception 'GPS_REQUIRED';
    end if;
  end if;

  if p_reject and not coalesce(v_step.can_reject,false) then
    raise exception 'STEP_CANNOT_REJECT';
  end if;

  v_result := public.advance_workflow_run(
    p_run_id,
    jsonb_build_object(
      'quantity', p_quantity,
      'gps', p_gps,
      'actor_name', p_actor_name,
      'attachment_count', v_attachment_count
    ),
    p_notes,
    p_reject
  );

  insert into public.workflow_task_events(
    run_id, run_step_id, event_type, title, details, actor_name, actor_role, metadata
  ) values (
    p_run_id,
    v_run_step.id,
    case when p_reject then 'rejected' else 'step_completed' end,
    case when p_reject then 'تم رفض المهمة' else 'اكتملت خطوة: ' || v_run_step.name end,
    p_notes,
    p_actor_name,
    v_run_step.actor_role,
    jsonb_build_object('quantity', p_quantity, 'gps', p_gps)
  );

  return v_result;
end $$;

-- تسجيل المرفقات والملاحظات داخل سجل الأحداث.
create or replace function public.log_task_attachment_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.workflow_task_events(
    run_id, run_step_id, event_type, title, details, actor_name
  ) values (
    new.run_id, new.run_step_id, 'attachment_added', 'تم رفع مرفق', new.file_name, new.uploaded_by
  );
  return new;
end $$;

drop trigger if exists workflow_task_attachment_event on public.workflow_task_attachments;
create trigger workflow_task_attachment_event
after insert on public.workflow_task_attachments
for each row execute function public.log_task_attachment_event();

create or replace function public.log_task_comment_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.workflow_task_events(
    run_id, run_step_id, event_type, title, details, actor_name, actor_role
  ) values (
    new.run_id, new.run_step_id, 'comment_added', 'تمت إضافة ملاحظة', new.body, new.author_name, new.author_role
  );
  return new;
end $$;

drop trigger if exists workflow_task_comment_event on public.workflow_task_comments;
create trigger workflow_task_comment_event
after insert on public.workflow_task_comments
for each row execute function public.log_task_comment_event();

alter table public.workflow_task_events enable row level security;
alter table public.workflow_task_attachments enable row level security;
alter table public.workflow_task_comments enable row level security;

drop policy if exists workflow_task_events_all on public.workflow_task_events;
create policy workflow_task_events_all on public.workflow_task_events for all to anon, authenticated using (true) with check (true);
drop policy if exists workflow_task_attachments_all on public.workflow_task_attachments;
create policy workflow_task_attachments_all on public.workflow_task_attachments for all to anon, authenticated using (true) with check (true);
drop policy if exists workflow_task_comments_all on public.workflow_task_comments;
create policy workflow_task_comments_all on public.workflow_task_comments for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.workflow_task_events to anon, authenticated;
grant select, insert, update, delete on public.workflow_task_attachments to anon, authenticated;
grant select, insert, update, delete on public.workflow_task_comments to anon, authenticated;
grant execute on function public.start_task_run(uuid,text) to anon, authenticated;
grant execute on function public.complete_task_step(uuid,text,text,numeric,text,boolean) to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('task-evidence', 'task-evidence', true)
on conflict (id) do update set public = true;

drop policy if exists task_evidence_public_read on storage.objects;
create policy task_evidence_public_read
on storage.objects for select
to public
using (bucket_id = 'task-evidence');

drop policy if exists task_evidence_upload on storage.objects;
create policy task_evidence_upload
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'task-evidence');

drop policy if exists task_evidence_update on storage.objects;
create policy task_evidence_update
on storage.objects for update
to anon, authenticated
using (bucket_id = 'task-evidence')
with check (bucket_id = 'task-evidence');

notify pgrst, 'reload schema';
