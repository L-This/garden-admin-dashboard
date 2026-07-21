'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import '../platform.css';

type Project = { id: string; name: string };
type WorkType = { id: string; name: string; code: string; icon?: string | null; active?: boolean | null };
type Location = {
  id: string;
  project_id: string;
  name: string;
  location_code?: string | null;
  location_category?: string | null;
  active?: boolean | null;
};
type Schedule = {
  id: string;
  name: string;
  project_id: string;
  work_type_id: string;
  recurrence_type: 'daily' | 'weekly' | 'once';
  start_date: string;
  end_date: string | null;
  weekdays: number[];
  scope_mode: 'all' | 'categories' | 'selected';
  active: boolean;
  notes: string | null;
  projects?: { name?: string } | null;
  work_types?: { name?: string; icon?: string | null } | null;
};
type PreviewRow = {
  schedule_id: string;
  schedule_name: string;
  project_id: string;
  project_name: string;
  work_type_id: string;
  work_type_name: string;
  location_id: string;
  location_name: string;
  location_code: string | null;
  location_category: string | null;
  generation_status:
    | 'ready'
    | 'existing'
    | 'no_workflow'
    | 'excluded_scope'
    | 'excluded_project'
    | 'excluded_category'
    | 'excluded_location';
  reason_text: string;
};
type Batch = {
  id: string;
  scheduled_date: string;
  generated_count: number;
  skipped_existing_count: number;
  skipped_no_workflow_count: number;
  created_at: string;
  projects?: { name?: string } | null;
};

type ScheduleDraft = {
  name: string;
  project_id: string;
  work_type_id: string;
  recurrence_type: 'daily' | 'weekly' | 'once';
  start_date: string;
  end_date: string;
  weekdays: number[];
  scope_mode: 'all' | 'categories' | 'selected';
  active: boolean;
  notes: string;
};

const DAYS = [
  { value: 0, label: 'الأحد' },
  { value: 1, label: 'الاثنين' },
  { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
  { value: 6, label: 'السبت' },
];

function localDate() {
  const value = new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emptyDraft(): ScheduleDraft {
  return {
    name: '',
    project_id: '',
    work_type_id: '',
    recurrence_type: 'weekly',
    start_date: localDate(),
    end_date: '',
    weekdays: [],
    scope_mode: 'all',
    active: true,
    notes: '',
  };
}

export default function DailyTaskGeneratorPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleCategories, setScheduleCategories] = useState<{ schedule_id: string; category_name: string }[]>([]);
  const [scheduleLocations, setScheduleLocations] = useState<{ schedule_id: string; location_id: string }[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [draft, setDraft] = useState<ScheduleDraft>(emptyDraft());
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);

  const [generationDate, setGenerationDate] = useState(localDate());
  const [generationProjectId, setGenerationProjectId] = useState('');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { void loadAll(); }, []);

  async function loadAll(preferredScheduleId?: string) {
    setLoading(true);
    const [projectsResult, workTypesResult, locationsResult, schedulesResult, categoriesResult, locationsLinksResult, batchesResult] = await Promise.all([
      supabase.from('projects').select('id,name').order('name'),
      supabase.from('work_types').select('id,name,code,icon,active').eq('active', true).order('sort_order').order('name'),
      supabase.from('locations').select('id,project_id,name,location_code,location_category,active').eq('active', true).order('location_code').order('name'),
      supabase.from('task_schedules').select('*,projects(name),work_types(name,icon)').order('created_at', { ascending: false }),
      supabase.from('task_schedule_categories').select('schedule_id,category_name'),
      supabase.from('task_schedule_locations').select('schedule_id,location_id'),
      supabase.from('daily_task_generation_batches').select('id,scheduled_date,generated_count,skipped_existing_count,skipped_no_workflow_count,created_at,projects(name)').order('created_at', { ascending: false }).limit(12),
    ]);

    const error = projectsResult.error || workTypesResult.error || locationsResult.error || schedulesResult.error || categoriesResult.error || locationsLinksResult.error || batchesResult.error;
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const loadedSchedules = (schedulesResult.data || []) as Schedule[];
    const loadedCategoryLinks = (categoriesResult.data || []) as { schedule_id: string; category_name: string }[];
    const loadedLocationLinks = (locationsLinksResult.data || []) as { schedule_id: string; location_id: string }[];

    setProjects((projectsResult.data || []) as Project[]);
    setWorkTypes((workTypesResult.data || []) as WorkType[]);
    setLocations((locationsResult.data || []) as Location[]);
    setSchedules(loadedSchedules);
    setScheduleCategories(loadedCategoryLinks);
    setScheduleLocations(loadedLocationLinks);
    setBatches((batchesResult.data || []) as Batch[]);

    const targetId = preferredScheduleId || selectedScheduleId;
    if (targetId) {
      const selected = loadedSchedules.find((item) => item.id === targetId);
      if (selected) selectScheduleFrom(selected, loadedCategoryLinks, loadedLocationLinks);
    }
    setLoading(false);
  }

  function selectScheduleFrom(
    schedule: Schedule,
    categoryLinks = scheduleCategories,
    locationLinks = scheduleLocations,
  ) {
    setSelectedScheduleId(schedule.id);
    setDraft({
      name: schedule.name,
      project_id: schedule.project_id,
      work_type_id: schedule.work_type_id,
      recurrence_type: schedule.recurrence_type,
      start_date: schedule.start_date,
      end_date: schedule.end_date || '',
      weekdays: schedule.weekdays || [],
      scope_mode: schedule.scope_mode,
      active: schedule.active,
      notes: schedule.notes || '',
    });
    setSelectedCategories(categoryLinks.filter((item) => item.schedule_id === schedule.id).map((item) => item.category_name));
    setSelectedLocations(locationLinks.filter((item) => item.schedule_id === schedule.id).map((item) => item.location_id));
    setMessage('');
  }

  function startNewSchedule() {
    setSelectedScheduleId('');
    setDraft(emptyDraft());
    setSelectedCategories([]);
    setSelectedLocations([]);
    setMessage('');
  }

  const projectLocations = useMemo(
    () => locations.filter((item) => item.project_id === draft.project_id),
    [locations, draft.project_id],
  );
  const availableCategories = useMemo(
    () => Array.from(new Set(projectLocations.map((item) => item.location_category || 'غير مصنف'))).sort(),
    [projectLocations],
  );

  function toggleWeekday(value: number) {
    setDraft((current) => ({
      ...current,
      weekdays: current.weekdays.includes(value)
        ? current.weekdays.filter((day) => day !== value)
        : [...current.weekdays, value].sort(),
    }));
  }

  function toggleCategory(value: string) {
    setSelectedCategories((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function toggleLocation(value: string) {
    setSelectedLocations((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function saveSchedule(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    if (!draft.name.trim() || !draft.project_id || !draft.work_type_id || !draft.start_date) {
      return setMessage('أكمل اسم الجدول والمشروع ونوع العمل وتاريخ البداية.');
    }
    if (draft.recurrence_type === 'weekly' && !draft.weekdays.length) {
      return setMessage('اختر يومًا واحدًا على الأقل للجدول الأسبوعي.');
    }
    if (draft.scope_mode === 'categories' && !selectedCategories.length) {
      return setMessage('اختر تصنيفًا واحدًا على الأقل.');
    }
    if (draft.scope_mode === 'selected' && !selectedLocations.length) {
      return setMessage('اختر موقعًا واحدًا على الأقل.');
    }

    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      project_id: draft.project_id,
      work_type_id: draft.work_type_id,
      recurrence_type: draft.recurrence_type,
      start_date: draft.start_date,
      end_date: draft.end_date || null,
      weekdays: draft.recurrence_type === 'weekly' ? draft.weekdays : [],
      scope_mode: draft.scope_mode,
      active: draft.active,
      notes: draft.notes.trim() || null,
    };

    const result = selectedScheduleId
      ? await supabase.from('task_schedules').update(payload).eq('id', selectedScheduleId).select('id').single()
      : await supabase.from('task_schedules').insert(payload).select('id').single();

    if (result.error || !result.data) {
      setSaving(false);
      return setMessage(result.error?.message || 'تعذر حفظ الجدول.');
    }

    const scheduleId = result.data.id as string;
    const deleteCategories = await supabase.from('task_schedule_categories').delete().eq('schedule_id', scheduleId);
    if (deleteCategories.error) { setSaving(false); return setMessage(deleteCategories.error.message); }
    const deleteLocations = await supabase.from('task_schedule_locations').delete().eq('schedule_id', scheduleId);
    if (deleteLocations.error) { setSaving(false); return setMessage(deleteLocations.error.message); }

    if (draft.scope_mode === 'categories' && selectedCategories.length) {
      const categoriesInsert = await supabase.from('task_schedule_categories').insert(
        selectedCategories.map((category_name) => ({ schedule_id: scheduleId, category_name })),
      );
      if (categoriesInsert.error) { setSaving(false); return setMessage(categoriesInsert.error.message); }
    }
    if (draft.scope_mode === 'selected' && selectedLocations.length) {
      const locationsInsert = await supabase.from('task_schedule_locations').insert(
        selectedLocations.map((location_id) => ({ schedule_id: scheduleId, location_id })),
      );
      if (locationsInsert.error) { setSaving(false); return setMessage(locationsInsert.error.message); }
    }

    setSaving(false);
    setMessage(selectedScheduleId ? 'تم تحديث جدول المهام.' : 'تم إنشاء جدول المهام.');
    await loadAll(scheduleId);
  }

  async function deleteSchedule() {
    if (!selectedScheduleId || !confirm('حذف جدول التوليد نهائيًا؟ المهام التي وُلدت سابقًا لن تُحذف.')) return;
    const { error } = await supabase.from('task_schedules').delete().eq('id', selectedScheduleId);
    if (error) return setMessage(error.message);
    startNewSchedule();
    setMessage('تم حذف الجدول.');
    await loadAll();
  }

  async function previewTasks() {
    setMessage('');
    setSaving(true);
    const { data, error } = await supabase.rpc('simulate_daily_tasks', {
      p_scheduled_date: generationDate,
      p_project_id: generationProjectId || null,
    });
    setSaving(false);
    if (error) return setMessage(error.message);
    setPreview((data || []) as PreviewRow[]);
    if (!(data || []).length) setMessage('لا توجد جداول مستحقة أو مواقع نشطة في التاريخ المحدد.');
  }

  async function generateTasks() {
    const readyCount = preview.filter((item) => item.generation_status === 'ready').length;
    if (!readyCount) return setMessage('نفّذ المعاينة أولًا، ولا توجد مهام جاهزة للتوليد حاليًا.');
    if (!confirm(`سيتم إنشاء ${readyCount} مهمة بتاريخ ${generationDate}. متابعة؟`)) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('generate_daily_tasks', {
      p_scheduled_date: generationDate,
      p_project_id: generationProjectId || null,
      p_requested_by: 'admin-dashboard',
    });
    setSaving(false);
    if (error) return setMessage(error.message);
    const result = data as { generated?: number; existing?: number; no_workflow?: number; excluded?: number } | null;
    setMessage(`تم التوليد الفعلي: ${result?.generated || 0} مهمة جديدة، ${result?.existing || 0} موجودة مسبقًا، ${result?.no_workflow || 0} بدون سير منشور، ${result?.excluded || 0} مستبعدة.`);
    if ((result?.generated || 0) > 0) {
      window.setTimeout(() => {
        window.location.href = `/platform/tasks?date=${generationDate}`;
      }, 900);
    }
    await loadAll(selectedScheduleId);
    await previewTasks();
  }

  const previewStats = useMemo(() => ({
    total: preview.length,
    ready: preview.filter((item) => item.generation_status === 'ready').length,
    existing: preview.filter((item) => item.generation_status === 'existing').length,
    noWorkflow: preview.filter((item) => item.generation_status === 'no_workflow').length,
    excluded: preview.filter((item) =>
      ['excluded_scope', 'excluded_project', 'excluded_category', 'excluded_location'].includes(item.generation_status),
    ).length,
  }), [preview]);

  const activeSchedules = schedules.filter((item) => item.active).length;

  return (
    <main className="platform-shell task-generator-admin" dir="rtl">
      <aside className="platform-sidebar">
        <div className="platform-brand-mark">م</div>
        <div><strong>منصة الأعمال الميدانية</strong><span>جدولة وتوليد المهام اليومية</span></div>
        <nav>
          <Link href="/platform">المشاريع</Link>
          <Link href="/platform/locations">سجل المواقع المركزي</Link>
          <Link href="/platform/imports">استيراد المواقع</Link>
          <Link href="/platform/work-types">أنواع الأعمال</Link>
          <Link href="/platform/workflows">سير الأعمال</Link>
          <Link className="active" href="/platform/task-generator">مولد المهام</Link>
          <Link href="/platform/tasks">المهام التشغيلية</Link>
          <Link href="/platform/operations">لوحة العمليات</Link>
          <Link href="/">النظام السابق</Link>
        </nav>
      </aside>

      <section className="platform-content">
        <header className="platform-header">
          <div>
            <span className="eyebrow">المرحلة 6.2</span>
            <h1>مولد المهام اليومية</h1>
            <p>أنشئ جداول تشغيل، عاين مهام اليوم، ثم ولّدها دون تكرار وباستخدام سير العمل المنشور.</p>
          </div>
          <div className="platform-header-actions">
            <Link className="secondary-action" href="/platform/tasks">عرض المهام التشغيلية</Link>
            <button className="primary-action" onClick={startNewSchedule}>+ جدول تشغيل جديد</button>
          </div>
        </header>

        <section className="platform-stats">
          <article><span>جداول التشغيل</span><strong>{schedules.length}</strong></article>
          <article><span>الجداول النشطة</span><strong>{activeSchedules}</strong></article>
          <article><span>المهام الجاهزة في المعاينة</span><strong>{previewStats.ready}</strong></article>
          <article><span>دفعات التوليد المسجلة</span><strong>{batches.length}</strong></article>
        </section>

        {message && <div className="import-message">{message}</div>}

        <div className="task-generator-layout">
          <section className="platform-panel task-schedule-list-panel">
            <div className="panel-heading">
              <div><h2>جداول التشغيل</h2><p>كل جدول يحدد العمل والمشروع والتكرار ونطاق المواقع.</p></div>
            </div>
            <div className="task-schedule-list">
              {loading ? <div className="platform-empty">جاري التحميل...</div> : schedules.length ? schedules.map((schedule) => (
                <button
                  key={schedule.id}
                  className={selectedScheduleId === schedule.id ? 'active' : ''}
                  onClick={() => selectScheduleFrom(schedule)}
                >
                  <div className="schedule-list-icon">{schedule.work_types?.icon || '◆'}</div>
                  <div>
                    <strong>{schedule.name}</strong>
                    <span>{schedule.projects?.name || '—'} · {schedule.work_types?.name || '—'}</span>
                    <small>{schedule.recurrence_type === 'daily' ? 'يومي' : schedule.recurrence_type === 'once' ? 'مرة واحدة' : 'أسبوعي'} · {schedule.scope_mode === 'all' ? 'كل المواقع' : schedule.scope_mode === 'categories' ? 'حسب التصنيفات' : 'مواقع محددة'}</small>
                  </div>
                  <em className={schedule.active ? 'pill' : 'pill off'}>{schedule.active ? 'نشط' : 'موقوف'}</em>
                </button>
              )) : <div className="platform-empty">لا توجد جداول تشغيل بعد.</div>}
            </div>
          </section>

          <form className="platform-panel task-schedule-editor" onSubmit={saveSchedule}>
            <div className="panel-heading">
              <div><h2>{selectedScheduleId ? 'تعديل جدول التشغيل' : 'جدول تشغيل جديد'}</h2><p>الجدول لا ينشئ المهمة إلا إذا كان لنوع العمل سير منشور.</p></div>
              {selectedScheduleId && <button type="button" className="danger-outline" onClick={deleteSchedule}>حذف</button>}
            </div>

            <div className="task-form-grid">
              <label className="wide"><span>اسم الجدول</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="مثال: ري زونات الغابة الشرقية" /></label>
              <label><span>المشروع</span><select value={draft.project_id} onChange={(event) => { setDraft({ ...draft, project_id: event.target.value }); setSelectedCategories([]); setSelectedLocations([]); }}><option value="">اختر المشروع</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label><span>نوع العمل</span><select value={draft.work_type_id} onChange={(event) => setDraft({ ...draft, work_type_id: event.target.value })}><option value="">اختر نوع العمل</option>{workTypes.map((workType) => <option key={workType.id} value={workType.id}>{workType.name}</option>)}</select></label>
              <label><span>التكرار</span><select value={draft.recurrence_type} onChange={(event) => setDraft({ ...draft, recurrence_type: event.target.value as ScheduleDraft['recurrence_type'] })}><option value="weekly">أسبوعي</option><option value="daily">يومي</option><option value="once">مرة واحدة</option></select></label>
              <label><span>تاريخ البداية</span><input type="date" value={draft.start_date} onChange={(event) => setDraft({ ...draft, start_date: event.target.value })} /></label>
              <label><span>تاريخ النهاية — اختياري</span><input type="date" value={draft.end_date} onChange={(event) => setDraft({ ...draft, end_date: event.target.value })} /></label>
              <label className="task-active-toggle"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>الجدول نشط</span></label>
            </div>

            {draft.recurrence_type === 'weekly' && <div className="task-editor-section"><h3>أيام التنفيذ</h3><div className="weekday-picker">{DAYS.map((day) => <button type="button" key={day.value} className={draft.weekdays.includes(day.value) ? 'active' : ''} onClick={() => toggleWeekday(day.value)}>{day.label}</button>)}</div></div>}

            <div className="task-editor-section">
              <h3>نطاق المواقع</h3>
              <div className="scope-picker">
                <button type="button" className={draft.scope_mode === 'all' ? 'active' : ''} onClick={() => setDraft({ ...draft, scope_mode: 'all' })}>كل المواقع المؤهلة</button>
                <button type="button" className={draft.scope_mode === 'categories' ? 'active' : ''} onClick={() => setDraft({ ...draft, scope_mode: 'categories' })}>تصنيفات محددة</button>
                <button type="button" className={draft.scope_mode === 'selected' ? 'active' : ''} onClick={() => setDraft({ ...draft, scope_mode: 'selected' })}>مواقع محددة</button>
              </div>

              {draft.scope_mode === 'categories' && <div className="task-choice-grid">{availableCategories.length ? availableCategories.map((category) => <label key={category}><input type="checkbox" checked={selectedCategories.includes(category)} onChange={() => toggleCategory(category)} /><span>{category}</span></label>) : <div className="platform-empty full-span">اختر المشروع أولًا.</div>}</div>}

              {draft.scope_mode === 'selected' && <div className="task-choice-grid locations">{projectLocations.length ? projectLocations.map((location) => <label key={location.id}><input type="checkbox" checked={selectedLocations.includes(location.id)} onChange={() => toggleLocation(location.id)} /><span><strong>{location.name}</strong><small>{location.location_code || 'بدون كود'} · {location.location_category || 'غير مصنف'}</small></span></label>) : <div className="platform-empty full-span">اختر المشروع أولًا.</div>}</div>}
            </div>

            <label className="task-notes"><span>ملاحظات الجدول</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="تعليمات داخلية أو وصف للخطة..." /></label>
            <div className="import-actions"><button className="primary-action" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ جدول التشغيل'}</button></div>
          </form>
        </div>

        <section className="platform-panel generation-console">
          <div className="panel-heading">
            <div><h2>محاكاة وتوليد مهام اليوم</h2><p>المحاكاة تعرض كل موقع وسبب إنشائه أو استبعاده، ولا تحفظ أي مهمة.</p></div>
          </div>
          <div className="generation-controls">
            <label><span>تاريخ المهام</span><input type="date" value={generationDate} onChange={(event) => setGenerationDate(event.target.value)} /></label>
            <label><span>المشروع</span><select value={generationProjectId} onChange={(event) => setGenerationProjectId(event.target.value)}><option value="">جميع المشاريع</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <button className="secondary-action" onClick={previewTasks} disabled={saving}>{saving ? 'جاري المحاكاة...' : 'محاكاة التوليد'}</button>
            <button className="primary-action" onClick={generateTasks} disabled={saving || !previewStats.ready}>توليد {previewStats.ready || ''} مهمة</button>
          </div>

          <div className="generation-stats simulation-stats">
            <article><span>إجمالي المواقع المفحوصة</span><strong>{previewStats.total}</strong></article>
            <article className="ready"><span>ستُنشأ</span><strong>{previewStats.ready}</strong></article>
            <article><span>موجودة مسبقًا</span><strong>{previewStats.existing}</strong></article>
            <article className="warning"><span>بدون سير منشور</span><strong>{previewStats.noWorkflow}</strong></article>
            <article className="excluded"><span>مستبعدة بالإعدادات</span><strong>{previewStats.excluded}</strong></article>
          </div>

          <div className="generation-preview-table">
            {preview.length ? (
              <table>
                <thead><tr><th>المشروع</th><th>نوع العمل</th><th>الموقع</th><th>التصنيف</th><th>النتيجة</th><th>السبب</th></tr></thead>
                <tbody>{preview.map((row) => {
                  const statusLabel =
                    row.generation_status === 'ready' ? 'ستُنشأ'
                    : row.generation_status === 'existing' ? 'موجودة'
                    : row.generation_status === 'no_workflow' ? 'بدون سير'
                    : 'مستبعدة';
                  return (
                    <tr key={`${row.schedule_id}-${row.location_id}`}>
                      <td>{row.project_name}</td>
                      <td>{row.work_type_name}<small>{row.schedule_name}</small></td>
                      <td><strong>{row.location_name}</strong><small>{row.location_code || 'بدون كود'}</small></td>
                      <td>{row.location_category || 'غير مصنف'}</td>
                      <td><span className={`task-preview-status ${row.generation_status}`}>{statusLabel}</span></td>
                      <td className="simulation-reason">{row.reason_text}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            ) : <div className="platform-empty">اضغط «محاكاة التوليد» لعرض المواقع والقرارات وأسباب الاستبعاد.</div>}
          </div>
        </section>

        <section className="platform-panel generation-history">
          <div className="panel-heading"><div><h2>سجل دفعات التوليد</h2><p>سجل دائم لكل عملية توليد يوضح الجديد والمتكرر وغير الجاهز.</p></div></div>
          <div className="data-list">{batches.length ? batches.map((batch) => <article key={batch.id}><div><strong>{new Date(`${batch.scheduled_date}T12:00:00`).toLocaleDateString('ar-SA')}</strong><span>{batch.projects?.name || 'جميع المشاريع'} · {new Date(batch.created_at).toLocaleString('ar-SA')}</span></div><div className="batch-generation-numbers"><span>جديد <b>{batch.generated_count}</b></span><span>موجود <b>{batch.skipped_existing_count}</b></span><span>بدون سير <b>{batch.skipped_no_workflow_count}</b></span></div></article>) : <div className="platform-empty">لا توجد دفعات توليد بعد.</div>}</div>
        </section>
      </section>
    </main>
  );
}
