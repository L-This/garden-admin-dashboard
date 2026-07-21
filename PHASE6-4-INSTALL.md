# تفعيل المرحلة 6.4 — بوابات فرق العمل

## 1. تفعيل قاعدة البيانات

نفّذ الملف التالي في Supabase SQL Editor:

`supabase-field-operations-phase6-4-role-portals.sql`

## 2. إنشاء حسابات الفريق

من Supabase افتح:

`Authentication > Users > Add user`

أنشئ حسابًا لكل مقاول أو مشرف أو مدير باستخدام البريد الإلكتروني وكلمة المرور.

## 3. ربط الحساب بالدور والمشاريع

انسخ `User UID` و`Project UUID`، ثم نفّذ مثالًا مناسبًا لكل حساب:

```sql
-- مقاول لمشروع محدد
insert into public.field_operator_profiles(user_id, display_name, role, project_ids)
values (
  'USER_UUID',
  'اسم المقاول',
  'contractor',
  array['PROJECT_UUID']::uuid[]
);

-- مشرف لمشروع محدد
insert into public.field_operator_profiles(user_id, display_name, role, project_ids)
values (
  'USER_UUID',
  'اسم المشرف',
  'supervisor',
  array['PROJECT_UUID']::uuid[]
);

-- مدير يرى جميع المشاريع
insert into public.field_operator_profiles(user_id, display_name, role, project_ids)
values (
  'USER_UUID',
  'اسم المدير',
  'manager',
  array[]::uuid[]
);
```

يمكن وضع أكثر من مشروع داخل المصفوفة مفصولًا بفاصلة.

## 4. الدخول

افتح المسار:

`/field/login`

كل حساب سيرى مهام دوره ومشاريعه، وستظهر له إجراءات التنفيذ أو المراجعة أو الاعتماد المناسبة فقط.
