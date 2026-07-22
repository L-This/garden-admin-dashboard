'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import '../../platform/platform.css';

export default function FieldLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { void supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace('/field'); }); }, [router]);

  async function login(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage('');
    const normalized = identifier.trim().toLowerCase();
    const email = normalized.includes('@') ? normalized : `${normalized}@field.local`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setMessage('بيانات الدخول غير صحيحة أو الحساب غير مفعّل.');
    router.replace('/field'); router.refresh();
  }

  return <main className="field-login-page" dir="rtl"><section className="field-login-card">
    <div className="field-login-brand"><i>م</i><div><strong>منصة الأعمال الميدانية</strong><span>بوابة فرق التنفيذ والمتابعة</span></div></div>
    <div className="field-login-copy"><span className="eyebrow">المرحلة 6.4</span><h1>مرحبًا بك في مساحة عملك</h1><p>سجّل الدخول للوصول إلى المهام المخصصة لدورك ومشاريعك فقط.</p></div>
    <form onSubmit={login}><label><span>اسم المستخدم أو البريد الإلكتروني</span><input type="text" autoComplete="username" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="مثال: supervisor" /></label><label><span>كلمة المرور</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label>{message && <div className="field-auth-message">{message}</div>}<button disabled={loading}>{loading ? 'جاري التحقق...' : 'دخول آمن'}</button></form>
    <small>صلاحيات العرض والتنفيذ تحدد تلقائيًا حسب حسابك.</small>
  </section><aside><div><span>مهام اليوم</span><strong>نفّذ، راجع، واعتمد من مكان واحد.</strong><p>واجهة سريعة ومناسبة للعمل الميداني على الجوال.</p></div></aside></main>;
}
