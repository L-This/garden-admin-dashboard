'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import '../platform.css';

type Project = { id: string; name: string };
type TaskRow = {
  id: string;
  task_number: string | null;
  scheduled_date: string | null;
  status: string;
  current_step_order: number;
  created_at: string;
  project_id: string;
  project_name: string;
  work_type_id: string;
  work_type_name: string;
  work_type_icon: string | null;
  location_id: string;
  location_name: string;
  location_code: string | null;
  location_category: string | null;
  current_step_name: string | null;
  current_actor_role: string | null;
  current_step_status: string | null;
  total_steps: number;
  completed_steps: number;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'جديدة',
  in_progress: 'قيد التنفيذ',
  under_review: 'تحت المراجعة',
  approved: 'معتمدة',
  completed: 'مكتملة',
  rejected: 'مرفوضة',
  cancelled: 'ملغاة',
};

const ROLE_LABELS: Record<string, string> = {
  contractor: 'المقاول',
  supervisor: 'المشرف',
  manager: 'المدير',
  system: 'النظام',
};

function localDate() {
  const value = new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function OperationalTasksPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [date, setDate] = useState(localDate());
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void loadProjects();
    const requestedDate =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('date')
        : null;
    if (requestedDate) setDate(requestedDate);
  }, []);
  useEffect(() => { void loadTasks(); }, [date, projectId]);

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('id,name').order('name');
    setProjects((data || []) as Project[]);
  }

  async function loadTasks() {
    setLoading(true);
    setMessage('');
    let request = supabase
      .from('daily_tasks_overview')
      .select('*')
      .eq('scheduled_date', date)
      .order('created_at', { ascending: false });

    if (projectId) request = request.eq('project_id', projectId);

    const { data, error } = await request;
    setLoading(false);
    if (error) {
      setTasks([]);
      setSelectedTask(null);
      return setMessage(error.message);
    }

    const rows = (data || []) as TaskRow[];
    setTasks(rows);
    if (selectedTask) {
      setSelectedTask(rows.find((item) => item.id === selectedTask.id) || null);
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (status !== 'all' && task.status !== status) return false;
      if (!needle) return true;
      return `${task.task_number || ''} ${task.project_name} ${task.work_type_name} ${task.location_name} ${task.location_code || ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [tasks, status, query]);

  const counters = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter((task) => task.status === 'pending').length,
    active: tasks.filter((task) => ['in_progress', 'under_review', 'approved'].includes(task.status)).length,
    completed: tasks.filter((task) => task.status === 'completed').length,
  }), [tasks]);

  return (
    <main className="platform-shell operational-tasks-page" dir="rtl">
      <aside className="platform-sidebar">
        <div className="platform-brand-mark">م</div>
        <div><strong>منصة الأعمال الميدانية</strong><span>سجل المهام التشغيلية الفعلية</span></div>
        <nav>
          <Link href="/platform">المشاريع</Link>
          <Link href="/platform/locations">سجل المواقع المركزي</Link>
          <Link href="/platform/imports">استيراد المواقع</Link>
          <Link href="/platform/work-types">أنواع الأعمال</Link>
          <Link href="/platform/workflows">سير الأعمال</Link>
          <Link href="/platform/task-generator">مولد المهام</Link>
          <Link className="active" href="/platform/tasks">المهام التشغيلية</Link>
          <Link href="/">النظام السابق</Link>
        </nav>
      </aside>

      <section className="platform-content">
        <header className="platform-header">
          <div>
            <span className="eyebrow">المرحلة 6.2</span>
            <h1>المهام التشغيلية</h1>
            <p>كل مهمة مولدة محفوظة برقم مستقل، ومربوطة بالمشروع والموقع ونوع العمل وسير التنفيذ المنشور.</p>
          </div>
          <Link className="primary-action" href="/platform/task-generator">توليد مهام جديدة</Link>
        </header>

        <section className="platform-stats">
          <article><span>إجمالي مهام اليوم</span><strong>{counters.total}</strong></article>
          <article><span>جديدة</span><strong>{counters.pending}</strong></article>
          <article><span>قيد الدورة</span><strong>{counters.active}</strong></article>
          <article><span>مكتملة</span><strong>{counters.completed}</strong></article>
        </section>

        {message && <div className="import-message">{message}</div>}

        <section className="platform-panel task-register-panel">
          <div className="panel-heading task-register-heading">
            <div><h2>سجل المهام</h2><p>اختر التاريخ والمشروع، ثم افتح أي مهمة لرؤية موقعها وخطوتها الحالية.</p></div>
            <div className="task-register-filters">
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">جميع المشاريع</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">كل الحالات</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالرقم أو الموقع..." />
            </div>
          </div>

          <div className="operational-tasks-layout">
            <div className="operational-task-list">
              {loading ? <div className="platform-empty">جاري تحميل المهام...</div> : filtered.length ? filtered.map((task) => (
                <button
                  key={task.id}
                  className={selectedTask?.id === task.id ? 'active' : ''}
                  onClick={() => setSelectedTask(task)}
                >
                  <div className="task-list-icon">{task.work_type_icon || '◆'}</div>
                  <div className="task-list-main">
                    <div className="task-list-title">
                      <strong>{task.location_name}</strong>
                      <span className={`task-state ${task.status}`}>{STATUS_LABELS[task.status] || task.status}</span>
                    </div>
                    <span>{task.work_type_name} · {task.project_name}</span>
                    <small>{task.task_number || 'بدون رقم'} · {task.location_code || 'بدون كود'}</small>
                  </div>
                </button>
              )) : <div className="platform-empty">لا توجد مهام مطابقة في التاريخ المحدد.</div>}
            </div>

            <div className="operational-task-details">
              {selectedTask ? (
                <>
                  <div className="task-detail-head">
                    <div>
                      <span className="eyebrow">{selectedTask.task_number || 'مهمة'}</span>
                      <h2>{selectedTask.location_name}</h2>
                      <p>{selectedTask.project_name} · {selectedTask.work_type_name}</p>
                    </div>
                    <span className={`task-state ${selectedTask.status}`}>{STATUS_LABELS[selectedTask.status] || selectedTask.status}</span>
                  </div>

                  <div className="detail-grid task-detail-grid">
                    <article><span>تاريخ المهمة</span><strong>{new Date(`${selectedTask.scheduled_date}T12:00:00`).toLocaleDateString('ar-SA')}</strong></article>
                    <article><span>رمز الموقع</span><strong>{selectedTask.location_code || '—'}</strong></article>
                    <article><span>تصنيف الموقع</span><strong>{selectedTask.location_category || 'غير مصنف'}</strong></article>
                    <article><span>المسؤول الحالي</span><strong>{ROLE_LABELS[selectedTask.current_actor_role || ''] || selectedTask.current_actor_role || '—'}</strong></article>
                    <article><span>الخطوة الحالية</span><strong>{selectedTask.current_step_name || '—'}</strong></article>
                    <article><span>التقدم</span><strong>{selectedTask.completed_steps} من {selectedTask.total_steps}</strong></article>
                  </div>

                  <div className="task-progress">
                    <div><span style={{ width: `${selectedTask.total_steps ? Math.round((selectedTask.completed_steps / selectedTask.total_steps) * 100) : 0}%` }} /></div>
                    <small>تم نسخ خطوات سير العمل المنشور إلى المهمة، ولن تتأثر بتعديلات الإصدارات المستقبلية.</small>
                  </div>

                  <div className="task-readiness-note">
                    هذه الصفحة سجل إداري للمهام الفعلية. تنفيذ خطوة المقاول والمراجعة سيُربطان بها في المرحلة التالية.
                  </div>
                </>
              ) : <div className="platform-empty">اختر مهمة من القائمة لعرض تفاصيلها.</div>}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
