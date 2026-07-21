'use client';

import Link from 'next/link';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import '../../platform.css';

type Task = {
  id: string;
  task_number: string | null;
  scheduled_date: string | null;
  status: string;
  current_step_order: number;
  started_at: string | null;
  completed_at: string | null;
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
  total_steps: number;
  completed_steps: number;
};

type RunStep = {
  id: string;
  workflow_step_id: string;
  step_order: number;
  name: string;
  actor_role: string;
  status: string;
  assigned_to: string | null;
  payload: Record<string, unknown> | null;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  requirements?: {
    description: string | null;
    step_type: string;
    can_reject: boolean;
    sla_hours: number | null;
    requires_photos: boolean;
    requires_notes: boolean;
    requires_quantity: boolean;
    requires_gps: boolean;
  };
};

type EventRow = {
  id: string;
  event_type: string;
  title: string;
  details: string | null;
  actor_name: string | null;
  actor_role: string | null;
  created_at: string;
};

type Attachment = {
  id: string;
  file_name: string;
  file_type: string | null;
  public_url: string | null;
  created_at: string;
};

type Comment = {
  id: string;
  body: string;
  author_name: string | null;
  author_role: string | null;
  created_at: string;
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

const EVENT_LABELS: Record<string, string> = {
  created: 'إنشاء المهمة',
  started: 'بدء التنفيذ',
  step_completed: 'إكمال خطوة',
  rejected: 'رفض المهمة',
  comment_added: 'إضافة ملاحظة',
  attachment_added: 'رفع مرفق',
};

export default function TaskOperationPage() {
  const params = useParams();
  const taskId = String(params.id || '');

  const [task, setTask] = useState<Task | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [actorName, setActorName] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState('');
  const [gps, setGps] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { if (taskId) void loadTask(); }, [taskId]);

  async function loadTask() {
    setLoading(true);
    setMessage('');

    const { data: taskData, error: taskError } = await supabase
      .from('daily_tasks_overview')
      .select('*')
      .eq('id', taskId)
      .single();

    if (taskError || !taskData) {
      setLoading(false);
      return setMessage(taskError?.message || 'تعذر تحميل المهمة.');
    }

    const { data: stepData, error: stepError } = await supabase
      .from('workflow_run_steps')
      .select(`
        id,workflow_step_id,step_order,name,actor_role,status,assigned_to,payload,notes,started_at,completed_at,
        workflow_steps(description,step_type,can_reject,sla_hours,requires_photos,requires_notes,requires_quantity,requires_gps)
      `)
      .eq('run_id', taskId)
      .order('step_order');

    if (stepError) {
      setLoading(false);
      return setMessage(stepError.message);
    }

    const normalizedSteps = (stepData || []).map((row: any) => ({
      ...row,
      requirements: Array.isArray(row.workflow_steps) ? row.workflow_steps[0] : row.workflow_steps,
    })) as RunStep[];

    const [eventsResult, attachmentsResult, commentsResult] = await Promise.all([
      supabase.from('workflow_task_events').select('*').eq('run_id', taskId).order('created_at'),
      supabase.from('workflow_task_attachments').select('*').eq('run_id', taskId).order('created_at', { ascending: false }),
      supabase.from('workflow_task_comments').select('*').eq('run_id', taskId).order('created_at', { ascending: false }),
    ]);

    setTask(taskData as Task);
    setSteps(normalizedSteps);
    setEvents((eventsResult.data || []) as EventRow[]);
    setAttachments((attachmentsResult.data || []) as Attachment[]);
    setComments((commentsResult.data || []) as Comment[]);
    setLoading(false);
  }

  const currentStep = useMemo(
    () => steps.find((step) => step.step_order === task?.current_step_order) || null,
    [steps, task],
  );

  const progress = task?.total_steps
    ? Math.round((task.completed_steps / task.total_steps) * 100)
    : 0;

  const canStart = task?.status === 'pending';
  const canComplete = task && !['completed', 'rejected', 'cancelled'].includes(task.status) && currentStep;
  const canReject = Boolean(currentStep?.requirements?.can_reject);

  async function startTask() {
    if (!task) return;
    setSaving(true);
    setMessage('');
    const { error } = await supabase.rpc('start_task_run', {
      p_run_id: task.id,
      p_actor_name: actorName.trim() || null,
    });
    setSaving(false);
    if (error) return setMessage(error.message);
    setMessage('تم بدء تنفيذ المهمة.');
    await loadTask();
  }

  async function completeStep(reject = false) {
    if (!task || !currentStep) return;
    setSaving(true);
    setMessage('');

    const { data, error } = await supabase.rpc('complete_task_step', {
      p_run_id: task.id,
      p_actor_name: actorName.trim() || null,
      p_notes: notes.trim() || null,
      p_quantity: quantity.trim() ? Number(quantity) : null,
      p_gps: gps.trim() || null,
      p_reject: reject,
    });

    setSaving(false);
    if (error) return setMessage(error.message);

    const result = data as { status?: string } | null;
    setMessage(reject ? 'تم رفض المهمة.' : result?.status === 'completed' ? 'اكتملت المهمة وأُغلقت.' : 'تم إكمال الخطوة والانتقال للمرحلة التالية.');
    setNotes('');
    setQuantity('');
    setGps('');
    await loadTask();
  }

  async function addComment() {
    if (!task || !comment.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('workflow_task_comments').insert({
      run_id: task.id,
      body: comment.trim(),
      author_name: actorName.trim() || null,
      author_role: currentStep?.actor_role || null,
    });
    setSaving(false);
    if (error) return setMessage(error.message);
    setComment('');
    setMessage('تمت إضافة الملاحظة.');
    await loadTask();
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    if (!task || !event.target.files?.length) return;
    setUploading(true);
    setMessage('');

    for (const file of Array.from(event.target.files)) {
      const extension =
  file.name.split(".").pop()?.toLowerCase() || "bin";

const storagePath =
  `${task.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('task-evidence')
        .upload(storagePath, file, { upsert: false });

      if (uploadError) {
  console.log(uploadError);
  console.error(uploadError);

  setUploading(false);

  return setMessage(
    JSON.stringify(uploadError, null, 2)
  );
}

      const { data: publicData } = supabase.storage.from('task-evidence').getPublicUrl(storagePath);
      const { error: rowError } = await supabase.from('workflow_task_attachments').insert({
        run_id: task.id,
        run_step_id: currentStep?.id || null,
        file_name: file.name,
        file_type: file.type || 'file',
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        uploaded_by: actorName.trim() || null,
      });

      if (rowError) {
        setUploading(false);
        return setMessage(rowError.message);
      }
    }

    setUploading(false);
    event.target.value = '';
    setMessage('تم رفع المرفقات.');
    await loadTask();
  }

  if (loading) {
    return <main className="simple-platform-page" dir="rtl"><div className="platform-empty">جاري تحميل ملف المهمة...</div></main>;
  }

  if (!task) {
    return <main className="simple-platform-page" dir="rtl"><div className="import-message">{message || 'المهمة غير موجودة.'}</div></main>;
  }

  return (
    <main className="platform-shell task-operation-page" dir="rtl">
      <aside className="platform-sidebar">
        <div className="platform-brand-mark">م</div>
        <div><strong>منصة الأعمال الميدانية</strong><span>ملف التشغيل الكامل للمهمة</span></div>
        <nav>
          <Link href="/platform">المشاريع</Link>
          <Link href="/platform/locations">سجل المواقع المركزي</Link>
          <Link href="/platform/work-types">أنواع الأعمال</Link>
          <Link href="/platform/workflows">سير الأعمال</Link>
          <Link href="/platform/task-generator">مولد المهام</Link>
          <Link className="active" href="/platform/tasks">المهام التشغيلية</Link>
          <Link href="/">النظام السابق</Link>
        </nav>
      </aside>

      <section className="platform-content">
        <div className="breadcrumbs">
          <Link href={`/platform/tasks?date=${task.scheduled_date || ''}`}>المهام التشغيلية</Link>
          <span>/</span>
          <strong>{task.task_number || 'المهمة'}</strong>
        </div>

        <header className="task-operation-header">
          <div>
            <span className="eyebrow">بطاقة تشغيل كاملة</span>
            <h1>{task.location_name}</h1>
            <p>{task.project_name} · {task.work_type_name} · {task.task_number}</p>
          </div>
          <span className={`task-state large ${task.status}`}>{STATUS_LABELS[task.status] || task.status}</span>
        </header>

        {message && <div className="import-message">{message}</div>}

        <section className="task-operation-hero">
          <article><span>الموقع</span><strong>{task.location_name}</strong><small>{task.location_code || 'بدون كود'} · {task.location_category || 'غير مصنف'}</small></article>
          <article><span>تاريخ التنفيذ</span><strong>{new Date(`${task.scheduled_date}T12:00:00`).toLocaleDateString('ar-SA')}</strong><small>تاريخ المهمة المعتمد</small></article>
          <article><span>المسؤول الحالي</span><strong>{ROLE_LABELS[task.current_actor_role || ''] || '—'}</strong><small>{task.current_step_name || 'لا توجد خطوة'}</small></article>
          <article><span>التقدم</span><strong>{progress}%</strong><small>{task.completed_steps} من {task.total_steps} خطوات</small></article>
        </section>

        <div className="task-operation-progress"><span style={{ width: `${progress}%` }} /></div>

        <section className="task-operation-grid">
          <div className="task-operation-main">
            <section className="platform-panel current-operation-card">
              <div className="panel-heading">
                <div>
                  <h2>{currentStep?.name || 'تم إغلاق المهمة'}</h2>
                  <p>{currentStep?.requirements?.description || 'لا يوجد وصف إضافي لهذه المرحلة.'}</p>
                </div>
                {currentStep && <span className={`step-status ${currentStep.status}`}>{currentStep.status === 'in_progress' ? 'جارية' : currentStep.status === 'pending' ? 'بانتظار البدء' : currentStep.status}</span>}
              </div>

              {currentStep && (
                <>
                  <div className="current-step-meta">
                    <article><span>نوع المرحلة</span><strong>{currentStep.requirements?.step_type || '—'}</strong></article>
                    <article><span>المسؤول</span><strong>{ROLE_LABELS[currentStep.actor_role] || currentStep.actor_role}</strong></article>
                    <article><span>المهلة</span><strong>{currentStep.requirements?.sla_hours == null ? 'غير محددة' : `${currentStep.requirements.sla_hours} ساعة`}</strong></article>
                  </div>

                  <div className="requirements-checklist">
                    <div className={currentStep.requirements?.requires_photos ? 'required' : ''}><b>{currentStep.requirements?.requires_photos ? '✓' : '—'}</b><span>صور إثبات</span><small>{attachments.length} مرفق</small></div>
                    <div className={currentStep.requirements?.requires_notes ? 'required' : ''}><b>{currentStep.requirements?.requires_notes ? '✓' : '—'}</b><span>ملاحظات</span><small>{comments.length} ملاحظة</small></div>
                    <div className={currentStep.requirements?.requires_quantity ? 'required' : ''}><b>{currentStep.requirements?.requires_quantity ? '✓' : '—'}</b><span>كمية منفذة</span><small>تُدخل قبل الإكمال</small></div>
                    <div className={currentStep.requirements?.requires_gps ? 'required' : ''}><b>{currentStep.requirements?.requires_gps ? '✓' : '—'}</b><span>موقع GPS</span><small>إحداثيات أو رابط</small></div>
                  </div>

                  <div className="operation-form">
                    <label><span>اسم المنفذ أو المراجع</span><input value={actorName} onChange={(event) => setActorName(event.target.value)} placeholder="الاسم..." /></label>
                    <label className="full-span"><span>ملاحظات إكمال المرحلة</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="اكتب تفاصيل التنفيذ أو قرار المراجعة..." /></label>
                    {currentStep.requirements?.requires_quantity && <label><span>الكمية المنفذة</span><input type="number" min="0" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>}
                    {currentStep.requirements?.requires_gps && <label><span>GPS</span><input value={gps} onChange={(event) => setGps(event.target.value)} placeholder="21.0000, 39.0000 أو رابط الخريطة" /></label>}
                  </div>

                  <div className="task-operation-actions">
                    {canStart && <button className="primary-action" onClick={startTask} disabled={saving}>{saving ? 'جاري البدء...' : 'بدء التنفيذ'}</button>}
                    {!canStart && canComplete && <button className="primary-action" onClick={() => completeStep(false)} disabled={saving}>{saving ? 'جاري الحفظ...' : currentStep.requirements?.step_type === 'review' ? 'اعتماد المراجعة والانتقال' : 'إكمال المرحلة والانتقال'}</button>}
                    {!canStart && canReject && <button className="danger-action" onClick={() => completeStep(true)} disabled={saving}>رفض المهمة</button>}
                  </div>
                </>
              )}
            </section>

            <section className="platform-panel">
              <div className="panel-heading"><div><h2>المرفقات والأدلة</h2><p>ترتبط الصور والملفات بالمهمة والخطوة الحالية.</p></div><label className="secondary-action upload-task-files">{uploading ? 'جاري الرفع...' : 'رفع صور أو ملفات'}<input type="file" multiple accept="image/*,.pdf" onChange={uploadFiles} disabled={uploading} /></label></div>
              <div className="task-attachments-grid">
                {attachments.length ? attachments.map((attachment) => (
                  <a key={attachment.id} href={attachment.public_url || '#'} target="_blank" rel="noreferrer">
                    <div>{attachment.file_type?.startsWith('image/') ? '🖼️' : '📎'}</div>
                    <strong>{attachment.file_name}</strong>
                    <span>{new Date(attachment.created_at).toLocaleString('ar-SA')}</span>
                  </a>
                )) : <div className="platform-empty full-span">لا توجد مرفقات بعد.</div>}
              </div>
            </section>

            <section className="platform-panel">
              <div className="panel-heading"><div><h2>الملاحظات</h2><p>ملاحظات تشغيلية مرتبطة بالمهمة.</p></div></div>
              <div className="task-comment-form">
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="أضف ملاحظة..." />
                <button className="primary-action" onClick={addComment} disabled={saving || !comment.trim()}>إضافة</button>
              </div>
              <div className="task-comments-list">
                {comments.length ? comments.map((item) => <article key={item.id}><strong>{item.author_name || ROLE_LABELS[item.author_role || ''] || 'مستخدم'}</strong><p>{item.body}</p><span>{new Date(item.created_at).toLocaleString('ar-SA')}</span></article>) : <div className="platform-empty">لا توجد ملاحظات.</div>}
              </div>
            </section>
          </div>

          <aside className="task-operation-side">
            <section className="platform-panel">
              <h2>خطوات سير العمل</h2>
              <div className="task-step-timeline">
                {steps.map((step) => <article key={step.id} className={`${step.status} ${step.step_order === task.current_step_order ? 'current' : ''}`}><b>{step.step_order}</b><div><strong>{step.name}</strong><span>{ROLE_LABELS[step.actor_role] || step.actor_role}</span></div><em>{step.status === 'completed' ? 'مكتملة' : step.status === 'in_progress' ? 'جارية' : step.status === 'rejected' ? 'مرفوضة' : 'معلقة'}</em></article>)}
              </div>
            </section>

            <section className="platform-panel">
              <h2>سجل الأحداث</h2>
              <div className="task-event-timeline">
                {events.length ? events.map((event) => <article key={event.id}><i /><div><strong>{event.title || EVENT_LABELS[event.event_type] || event.event_type}</strong>{event.details && <p>{event.details}</p>}<span>{event.actor_name || ROLE_LABELS[event.actor_role || ''] || 'النظام'} · {new Date(event.created_at).toLocaleString('ar-SA')}</span></div></article>) : <div className="platform-empty">لا توجد أحداث بعد.</div>}
              </div>
            </section>

            <Link className="secondary-action task-location-link" href={`/platform/locations/${task.location_id}`}>فتح سجل الموقع المركزي</Link>
          </aside>
        </section>
      </section>
    </main>
  );
}
