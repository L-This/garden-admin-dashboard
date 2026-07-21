'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OperationTask, ROLE_LABELS, STATUS_LABELS, taskProgress } from '@/components/platform/operations-types';
import '../platform/platform.css';

type Profile = { id: string; display_name: string; role: 'contractor' | 'supervisor' | 'manager'; project_ids: string[]; active: boolean };
type ViewFilter = 'mine' | 'active' | 'completed' | 'rejected';

function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }

const ROLE_COPY = {
  contractor: { title: 'مساحة تنفيذ المقاول', subtitle: 'ابدأ المهام وارفع الأدلة وسلّم العمل للمراجعة.', action: 'بدء التنفيذ' },
  supervisor: { title: 'مساحة مراجعة المشرف', subtitle: 'راجع التنفيذ والأدلة، ثم اعتمد أو أعد المهمة.', action: 'مراجعة المهمة' },
  manager: { title: 'مساحة متابعة المدير', subtitle: 'تابع جميع مهام مشاريعك واتخذ قرارات الاعتماد.', action: 'فتح المهمة' },
};

export default function FieldWorkspacePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<OperationTask[]>([]);
  const [date, setDate] = useState(localDate());
  const [filter, setFilter] = useState<ViewFilter>('mine');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadWorkspace = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { router.replace('/field/login'); return; }
    const [profileResult, tasksResult] = await Promise.all([
      supabase.rpc('my_field_profile'),
      supabase.rpc('my_field_tasks', { p_scheduled_date: date }),
    ]);
    if (profileResult.error || !profileResult.data?.length) {
      setMessage('الحساب مسجّل لكنه غير مربوط بملف تشغيلي. راجع مدير النظام.'); setLoading(false); return;
    }
    setProfile(profileResult.data[0] as Profile);
    if (tasksResult.error) setMessage(tasksResult.error.message);
    else { setTasks((tasksResult.data || []).map((task: any) => ({ ...task, last_updated: task.completed_at || task.started_at || task.created_at, attachment_count: 0 })) as OperationTask[]); setMessage(''); }
    setLoading(false);
  }, [date, router]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => {
    const channel = supabase.channel('field-workspace-live').on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_runs' }, () => void loadWorkspace(true)).on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_run_steps' }, () => void loadWorkspace(true)).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadWorkspace]);

  const visible = useMemo(() => tasks.filter((task) => {
    if (filter === 'active' && !['pending', 'in_progress', 'under_review', 'approved'].includes(task.status)) return false;
    if (filter === 'completed' && task.status !== 'completed') return false;
    if (filter === 'rejected' && task.status !== 'rejected') return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${task.task_number || ''} ${task.location_name} ${task.project_name}`.toLowerCase().includes(needle);
  }), [tasks, filter, query]);

  async function logout() { await supabase.auth.signOut(); router.replace('/field/login'); }
  const copy = profile ? ROLE_COPY[profile.role] : null;

  if (loading) return <main className="field-loading" dir="rtl"><i>م</i><p>جاري تجهيز مساحة العمل...</p></main>;

  return <main className="field-workspace" dir="rtl">
    <header className="field-topbar"><div className="field-mini-brand"><i>م</i><div><strong>الأعمال الميدانية</strong><span>بوابة التشغيل</span></div></div><div className="field-user"><div><strong>{profile?.display_name || 'مستخدم'}</strong><span>{profile ? ROLE_LABELS[profile.role] : 'غير مربوط'}</span></div><button onClick={logout}>تسجيل الخروج</button></div></header>
    <section className="field-content">
      <header className="field-hero"><div><span className="eyebrow">المرحلة 6.4</span><h1>{copy?.title || 'مساحة العمل'}</h1><p>{copy?.subtitle || message}</p></div><label><span>تاريخ المهام</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></header>
      {message && <div className="field-auth-message wide">{message}</div>}
      <section className="field-role-stats"><article><span>المهام الظاهرة</span><strong>{tasks.length}</strong></article><article><span>تحتاج إجراءك</span><strong>{tasks.filter((task) => !['completed','rejected','cancelled'].includes(task.status) && task.current_actor_role === profile?.role).length}</strong></article><article><span>قيد الدورة</span><strong>{tasks.filter((task) => ['in_progress','under_review','approved'].includes(task.status)).length}</strong></article><article><span>مكتملة</span><strong>{tasks.filter((task) => task.status === 'completed').length}</strong></article></section>
      <section className="field-toolbar"><div>{([['mine','الكل'],['active','نشطة'],['completed','مكتملة'],['rejected','مرفوضة']] as [ViewFilter,string][]).map(([value,label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث برقم المهمة أو الموقع..." /></section>
      <section className="field-task-grid">{visible.map((task) => { const progress = taskProgress(task); const needsAction = task.current_actor_role === profile?.role && !['completed','rejected','cancelled'].includes(task.status); return <article key={task.id} className={needsAction ? 'needs-action' : ''}>
        <div className="field-task-head"><span className={`task-state ${task.status}`}>{STATUS_LABELS[task.status] || task.status}</span><b>{task.task_number || 'مهمة'}</b></div><h2>{task.location_name}</h2><p>{task.work_type_name} · {task.project_name}</p><div className="field-task-meta"><span><small>الخطوة الحالية</small><strong>{task.current_step_name || '—'}</strong></span><span><small>المسؤول</small><strong>{ROLE_LABELS[task.current_actor_role || ''] || '—'}</strong></span></div><div className="field-task-progress"><div><i style={{ width: `${progress}%` }} /></div><b>{progress}%</b></div><Link href={`/field/tasks/${task.id}`}>{needsAction ? copy?.action : 'عرض التفاصيل'} <span>←</span></Link>
      </article>; })}{!visible.length && <div className="platform-empty full-span">لا توجد مهام مطابقة في هذا التاريخ.</div>}</section>
    </section>
  </main>;
}
