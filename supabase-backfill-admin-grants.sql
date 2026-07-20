-- لوحة الإدارة الحالية تستخدم مفتاح Supabase العام مع تسجيل دخول داخلي،
-- لذلك تحتاج دوال إدارة التعويض إلى صلاحية التنفيذ لدور anon أيضًا.
-- نفّذ هذا الملف بعد ملف supabase-backfill-selected-gardens-fixed.sql.

grant execute on function public.open_daily_report_backfill(
  uuid, date, timestamptz, text, uuid[], text, text
) to anon, authenticated;

grant execute on function public.close_daily_report_backfill(uuid)
to anon, authenticated;

grant execute on function public.list_daily_report_backfills(uuid)
to anon, authenticated;
