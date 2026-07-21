-- منصة الأعمال الميدانية
-- المرحلة 6.3: لوحة متابعة العمليات والتحديث المباشر
-- يُنفذ بعد ملفات المرحلة 6.2.

-- إضافة جداول التشغيل إلى بث Supabase Realtime.
-- كتلة الاستثناء تجعل الملف آمنًا عند إعادة تنفيذه إذا كان الجدول مضافًا مسبقًا.
do $$
begin
  alter publication supabase_realtime add table public.workflow_runs;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.workflow_run_steps;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.workflow_task_events;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.workflow_task_attachments;
exception when duplicate_object then null;
end $$;

-- يمنح لوحة العمليات قراءة البيانات التي تعتمد عليها المؤشرات والتنبيهات.
grant select on public.daily_tasks_overview to anon, authenticated;
grant select on public.workflow_task_events to anon, authenticated;
grant select on public.workflow_task_attachments to anon, authenticated;

notify pgrst, 'reload schema';
