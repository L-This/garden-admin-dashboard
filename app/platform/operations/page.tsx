'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import OperationsStats from '@/components/platform/OperationsStats';
import FiltersBar from '@/components/platform/FiltersBar';
import TasksTable from '@/components/platform/TasksTable';
import ProjectsSummary from '@/components/platform/ProjectsSummary';
import AlertsPanel from '@/components/platform/AlertsPanel';
import OperationsMap from '@/components/platform/OperationsMap';
import LiveCounters from '@/components/platform/LiveCounters';
import { OperationFilters, OperationTask } from '@/components/platform/operations-types';
import '../platform.css';

type Option = { id: string; name: string };
type TaskEvent = { run_id: string; created_at: string };
type TaskAttachment = { run_id: string };

const EMPTY_FILTERS: OperationFilters = { projectId: '', workTypeId: '', status: '', actorRole: '', query: '' };

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function OperationsDashboardPage() {
  const [date, setDate] = useState(localDate());
  const [tasks, setTasks] = useState<OperationTask[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [workTypes, setWorkTypes] = useState<Option[]>([]);
  const [filters, setFilters] = useState<OperationFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [connected, setConnected] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const loadOptions = useCallback(async () => {
    const [projectResult, workTypeResult] = await Promise.all([
      supabase.from('projects').select('id,name').order('name'),
      supabase.from('work_types').select('id,name').eq('active', true).order('sort_order'),
    ]);
    setProjects((projectResult.data || []) as Option[]);
    setWorkTypes((workTypeResult.data || []) as Option[]);
  }, []);

  const loadTasks = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setMessage('');
    const { data, error } = await supabase.from('daily_tasks_overview').select('*').eq('scheduled_date', date).order('created_at', { ascending: false });
    if (error) {
      setTasks([]);
      setLoading(false);
      return setMessage(`تعذر تحميل لوحة العمليات: ${error.message}`);
    }

    const baseRows = (data || []) as Omit<OperationTask, 'last_updated' | 'attachment_count'>[];
    const ids = baseRows.map((task) => task.id);
    let events: TaskEvent[] = [];
    let attachments: TaskAttachment[] = [];
    if (ids.length) {
      const [eventResult, attachmentResult] = await Promise.all([
        supabase.from('workflow_task_events').select('run_id,created_at').in('run_id', ids).order('created_at', { ascending: false }),
        supabase.from('workflow_task_attachments').select('run_id').in('run_id', ids),
      ]);
      events = (eventResult.data || []) as TaskEvent[];
      attachments = (attachmentResult.data || []) as TaskAttachment[];
    }

    const latestByTask = new Map<string, string>();
    events.forEach((event) => { if (!latestByTask.has(event.run_id)) latestByTask.set(event.run_id, event.created_at); });
    const attachmentCounts = attachments.reduce<Record<string, number>>((result, item) => ({ ...result, [item.run_id]: (result[item.run_id] || 0) + 1 }), {});
    setTasks(baseRows.map((task) => ({ ...task, last_updated: latestByTask.get(task.id) || task.completed_at || task.started_at || task.created_at, attachment_count: attachmentCounts[task.id] || 0 })) as OperationTask[]);
    setLastSync(new Date());
    setLoading(false);
  }, [date]);

  useEffect(() => { void loadOptions(); }, [loadOptions]);
  useEffect(() => { void loadTasks(); }, [loadTasks]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadTasks(true), 350);
    };
    const channel = supabase.channel('operations-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_runs' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_run_steps' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_task_events' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_task_attachments' }, refresh)
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));
    return () => { if (refreshTimer) clearTimeout(refreshTimer); void supabase.removeChannel(channel); };
  }, [loadTasks]);

  const filteredTasks = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filters.projectId && task.project_id !== filters.projectId) return false;
      if (filters.workTypeId && task.work_type_id !== filters.workTypeId) return false;
      if (filters.status && task.status !== filters.status) return false;
      if (filters.actorRole && task.current_actor_role !== filters.actorRole) return false;
      if (query && !`${task.task_number || ''} ${task.location_name} ${task.location_code || ''} ${task.project_name}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [tasks, filters]);

  return <main className="platform-shell operations-dashboard" dir="rtl">
    <aside className="platform-sidebar">
      <div className="platform-brand-mark">م</div>
      <div><strong>منصة الأعمال الميدانية</strong><span>مركز متابعة العمليات المباشرة</span></div>
      <nav>
        <Link href="/platform">المشاريع</Link><Link href="/platform/locations">سجل المواقع المركزي</Link><Link href="/platform/imports">استيراد المواقع</Link><Link href="/platform/work-types">أنواع الأعمال</Link><Link href="/platform/workflows">سير الأعمال</Link><Link href="/platform/task-generator">مولد المهام</Link><Link href="/platform/tasks">المهام التشغيلية</Link><Link className="active" href="/platform/operations">لوحة العمليات</Link><Link href="/">النظام السابق</Link>
      </nav>
    </aside>

    <section className="platform-content">
      <header className="operations-header">
        <div><span className="eyebrow">المرحلة 6.3</span><h1>لوحة متابعة العمليات</h1><p>صورة مباشرة لتنفيذ المهام، أداء المشاريع، والتنبيهات التي تحتاج تدخلك.</p></div>
        <div className="operations-header-tools"><label><span>تاريخ المتابعة</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><LiveCounters connected={connected} lastSync={lastSync} /></div>
      </header>

      {message && <div className="import-message">{message}</div>}
      <OperationsStats tasks={tasks} />
      <FiltersBar filters={filters} projects={projects} workTypes={workTypes} onChange={setFilters} onReset={() => setFilters(EMPTY_FILTERS)} />
      <TasksTable tasks={filteredTasks} loading={loading} />
      <section className="operations-insights-grid"><ProjectsSummary tasks={filteredTasks} /><AlertsPanel tasks={filteredTasks} /></section>
      <OperationsMap tasks={filteredTasks} />
    </section>
  </main>;
}
