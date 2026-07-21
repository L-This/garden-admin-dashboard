'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import '../platform.css';

type WorkType = { id: string; name: string; code: string; icon: string | null; color: string | null; active: boolean | null };
type Workflow = {
  id: string;
  work_type_id: string;
  name: string;
  description: string | null;
  version: number;
  status: 'draft' | 'published' | 'archived';
  active: boolean;
  published_at: string | null;
};
type Step = {
  id: string;
  workflow_id: string;
  step_key: string;
  name: string;
  description: string | null;
  step_order: number;
  step_type: 'execution' | 'review' | 'approval' | 'completion';
  actor_role: 'contractor' | 'supervisor' | 'manager' | 'system';
  status_after: string;
  required: boolean;
  can_reject: boolean;
  sla_hours: number | null;
  requires_photos: boolean;
  requires_notes: boolean;
  requires_quantity: boolean;
  requires_gps: boolean;
};

type StepDraft = Omit<Step, 'id' | 'workflow_id'>;

const TYPE_LABELS: Record<Step['step_type'], string> = {
  execution: 'تنفيذ', review: 'مراجعة', approval: 'اعتماد', completion: 'إغلاق',
};
const ROLE_LABELS: Record<Step['actor_role'], string> = {
  contractor: 'المقاول', supervisor: 'المشرف', manager: 'المدير', system: 'النظام',
};

function emptyStep(order: number): StepDraft {
  return {
    step_key: `step_${order}`,
    name: 'خطوة جديدة',
    description: '',
    step_order: order,
    step_type: 'execution',
    actor_role: 'contractor',
    status_after: 'in_progress',
    required: true,
    can_reject: false,
    sla_hours: null,
    requires_photos: false,
    requires_notes: false,
    requires_quantity: false,
    requires_gps: false,
  };
}

export default function WorkflowsPage() {
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [selectedWorkTypeId, setSelectedWorkTypeId] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [selectedStepId, setSelectedStepId] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [stepDraft, setStepDraft] = useState<StepDraft>(emptyStep(1));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { void loadAll(); }, []);

  async function loadAll(preferredWorkType?: string, preferredWorkflow?: string) {
    setLoading(true);
    const [typesResult, workflowsResult, stepsResult] = await Promise.all([
      supabase.from('work_types').select('id,name,code,icon,color,active').order('sort_order').order('name'),
      supabase.from('workflow_definitions').select('*').order('work_type_id').order('version', { ascending: false }),
      supabase.from('workflow_steps').select('*').order('workflow_id').order('step_order'),
    ]);
    const error = typesResult.error || workflowsResult.error || stepsResult.error;
    if (error) { setMessage(error.message); setLoading(false); return; }

    const loadedTypes = (typesResult.data || []) as WorkType[];
    const loadedWorkflows = (workflowsResult.data || []) as Workflow[];
    const loadedSteps = (stepsResult.data || []) as Step[];
    setWorkTypes(loadedTypes); setWorkflows(loadedWorkflows); setSteps(loadedSteps);

    const workTypeId = preferredWorkType || selectedWorkTypeId || loadedTypes[0]?.id || '';
    const available = loadedWorkflows.filter((item) => item.work_type_id === workTypeId);
    const workflowId = preferredWorkflow || selectedWorkflowId || available.find((item) => item.status === 'draft')?.id || available[0]?.id || '';
    setSelectedWorkTypeId(workTypeId);
    selectWorkflowFrom(workflowId, loadedWorkflows, loadedSteps);
    setLoading(false);
  }

  function selectWorkflowFrom(id: string, workflowRows = workflows, stepRows = steps) {
    setSelectedWorkflowId(id);
    const workflow = workflowRows.find((item) => item.id === id);
    setWorkflowName(workflow?.name || '');
    setWorkflowDescription(workflow?.description || '');
    const firstStep = stepRows.filter((item) => item.workflow_id === id).sort((a, b) => a.step_order - b.step_order)[0];
    if (firstStep) selectStep(firstStep); else { setSelectedStepId(''); setStepDraft(emptyStep(1)); }
  }

  async function chooseWorkType(id: string) {
    setMessage('');
    setSelectedWorkTypeId(id);
    let draft = workflows.find((item) => item.work_type_id === id && item.status === 'draft');
    if (!draft) {
      const { data, error } = await supabase.rpc('ensure_workflow_draft', { p_work_type_id: id });
      if (error) { setMessage(error.message); return; }
      await loadAll(id, String(data));
      return;
    }
    selectWorkflowFrom(draft.id);
  }

  function selectStep(step: Step) {
    setSelectedStepId(step.id);
    setStepDraft({
      step_key: step.step_key, name: step.name, description: step.description || '', step_order: step.step_order,
      step_type: step.step_type, actor_role: step.actor_role, status_after: step.status_after,
      required: step.required, can_reject: step.can_reject, sla_hours: step.sla_hours,
      requires_photos: step.requires_photos, requires_notes: step.requires_notes,
      requires_quantity: step.requires_quantity, requires_gps: step.requires_gps,
    });
  }

  const currentWorkflow = workflows.find((item) => item.id === selectedWorkflowId);
  const currentSteps = useMemo(
    () => steps.filter((item) => item.workflow_id === selectedWorkflowId).sort((a, b) => a.step_order - b.step_order),
    [steps, selectedWorkflowId],
  );
  const publishedWorkflow = workflows.find((item) => item.work_type_id === selectedWorkTypeId && item.status === 'published');

  async function saveWorkflowMeta(event: FormEvent) {
    event.preventDefault();
    if (!selectedWorkflowId || currentWorkflow?.status !== 'draft') return;
    if (!workflowName.trim()) return setMessage('اكتب اسم سير العمل.');
    setSaving(true);
    const { error } = await supabase.from('workflow_definitions').update({
      name: workflowName.trim(), description: workflowDescription.trim() || null,
    }).eq('id', selectedWorkflowId);
    setSaving(false);
    if (error) return setMessage(error.message);
    setMessage('تم حفظ بيانات سير العمل.');
    await loadAll(selectedWorkTypeId, selectedWorkflowId);
  }

  async function saveStep(event: FormEvent) {
    event.preventDefault();
    if (!selectedWorkflowId || currentWorkflow?.status !== 'draft') return;
    if (!stepDraft.name.trim() || !stepDraft.step_key.trim()) return setMessage('اكتب اسم الخطوة والمفتاح الداخلي.');
    setSaving(true);
    const payload = {
      ...stepDraft,
      workflow_id: selectedWorkflowId,
      name: stepDraft.name.trim(),
      step_key: stepDraft.step_key.trim().toLowerCase().replace(/\s+/g, '_'),
      description: stepDraft.description.trim() || null,
      sla_hours: stepDraft.sla_hours === null ? null : Number(stepDraft.sla_hours),
    };
    const result = selectedStepId
      ? await supabase.from('workflow_steps').update(payload).eq('id', selectedStepId).select('id').single()
      : await supabase.from('workflow_steps').insert(payload).select('id').single();
    setSaving(false);
    if (result.error || !result.data) return setMessage(result.error?.message || 'تعذر حفظ الخطوة.');
    setMessage(selectedStepId ? 'تم تحديث الخطوة.' : 'تمت إضافة الخطوة.');
    await loadAll(selectedWorkTypeId, selectedWorkflowId);
    setSelectedStepId(result.data.id);
  }

  function startNewStep() {
    const nextOrder = currentSteps.length ? Math.max(...currentSteps.map((item) => item.step_order)) + 1 : 1;
    setSelectedStepId(''); setStepDraft(emptyStep(nextOrder)); setMessage('');
  }

  async function deleteStep() {
    if (!selectedStepId || currentWorkflow?.status !== 'draft') return;
    if (!confirm('حذف هذه الخطوة من المسودة؟')) return;
    const { error } = await supabase.from('workflow_steps').delete().eq('id', selectedStepId);
    if (error) return setMessage(error.message);
    setMessage('تم حذف الخطوة.');
    await loadAll(selectedWorkTypeId, selectedWorkflowId);
  }

  async function moveStep(step: Step, direction: -1 | 1) {
    if (currentWorkflow?.status !== 'draft') return;
    const target = currentSteps.find((item) => item.step_order === step.step_order + direction);
    if (!target) return;
    const temporary = 100000 + step.step_order;
    const first = await supabase.from('workflow_steps').update({ step_order: temporary }).eq('id', step.id);
    if (first.error) return setMessage(first.error.message);
    const second = await supabase.from('workflow_steps').update({ step_order: step.step_order }).eq('id', target.id);
    if (second.error) return setMessage(second.error.message);
    const third = await supabase.from('workflow_steps').update({ step_order: target.step_order }).eq('id', step.id);
    if (third.error) return setMessage(third.error.message);
    await loadAll(selectedWorkTypeId, selectedWorkflowId);
  }

  async function publish() {
    if (!selectedWorkflowId || currentWorkflow?.status !== 'draft') return;
    if (!confirm('سيتم نشر هذه النسخة وأرشفة النسخة المنشورة السابقة. متابعة؟')) return;
    setSaving(true);
    const { error } = await supabase.rpc('publish_workflow', { p_workflow_id: selectedWorkflowId });
    setSaving(false);
    if (error) return setMessage(error.message);
    setMessage('تم نشر سير العمل وأصبح جاهزًا للتشغيل.');
    await loadAll(selectedWorkTypeId);
  }

  async function createNewDraftVersion() {
    if (!selectedWorkTypeId) return;
    const existingDraft = workflows.find((item) => item.work_type_id === selectedWorkTypeId && item.status === 'draft');
    if (existingDraft) return selectWorkflowFrom(existingDraft.id);
    const { data: newId, error } = await supabase.rpc('ensure_workflow_draft', { p_work_type_id: selectedWorkTypeId });
    if (error) return setMessage(error.message);
    await loadAll(selectedWorkTypeId, String(newId));
  }

  return (
    <main className="platform-shell workflow-admin" dir="rtl">
      <aside className="platform-sidebar">
        <div className="platform-brand-mark">م</div>
        <div><strong>منصة الأعمال الميدانية</strong><span>تصميم دورة التنفيذ والاعتماد</span></div>
        <nav>
          <Link href="/platform">المشاريع</Link>
          <Link href="/platform/locations">سجل المواقع المركزي</Link>
          <Link href="/platform/imports">استيراد المواقع</Link>
          <Link href="/platform/work-types">أنواع الأعمال</Link>
          <Link className="active" href="/platform/workflows">سير الأعمال</Link>
          <Link href="/">النظام السابق</Link>
        </nav>
      </aside>

      <section className="platform-content">
        <header className="platform-header">
          <div><span className="eyebrow">المرحلة الخامسة</span><h1>محرك سير الأعمال</h1><p>حدد من ينفذ، ومن يراجع، وما المتطلبات، ومتى تُغلق المهمة.</p></div>
          <Link className="secondary-action" href="/platform/work-types">إدارة أنواع الأعمال</Link>
        </header>

        <section className="platform-stats">
          <article><span>أنواع الأعمال</span><strong>{workTypes.length}</strong></article>
          <article><span>مسودات السير</span><strong>{workflows.filter((item) => item.status === 'draft').length}</strong></article>
          <article><span>النسخ المنشورة</span><strong>{workflows.filter((item) => item.status === 'published').length}</strong></article>
          <article><span>إجمالي الخطوات</span><strong>{steps.length}</strong></article>
        </section>

        {message && <div className="import-message">{message}</div>}

        <div className="workflow-layout">
          <section className="platform-panel workflow-types-panel">
            <div className="panel-heading"><div><h2>أنواع الأعمال</h2><p>اختر نوعًا لتصميم دورة تنفيذه.</p></div></div>
            {loading ? <div className="platform-empty">جاري التحميل...</div> : <div className="workflow-work-list">
              {workTypes.map((item) => {
                const draft = workflows.find((row) => row.work_type_id === item.id && row.status === 'draft');
                const published = workflows.find((row) => row.work_type_id === item.id && row.status === 'published');
                return <button key={item.id} className={selectedWorkTypeId === item.id ? 'active' : ''} onClick={() => void chooseWorkType(item.id)}>
                  <span className="work-type-icon" style={{ background: item.color || '#5b3da8' }}>{item.icon || '◆'}</span>
                  <span><b>{item.name}</b><small>{published ? `منشور v${published.version}` : 'غير منشور'} · {draft ? 'مسودة موجودة' : 'بدون مسودة'}</small></span>
                </button>;
              })}
            </div>}
          </section>

          <section className="platform-panel workflow-canvas-panel">
            <div className="panel-heading">
              <div><h2>{currentWorkflow?.name || 'سير العمل'}</h2><p>{currentWorkflow ? `الإصدار ${currentWorkflow.version} · ${currentWorkflow.status === 'draft' ? 'مسودة' : currentWorkflow.status === 'published' ? 'منشور' : 'مؤرشف'}` : 'اختر نوع عمل'}</p></div>
              {currentWorkflow?.status === 'draft' ? <button className="primary-action" onClick={publish} disabled={saving}>نشر سير العمل</button> : <button className="secondary-action" onClick={() => void createNewDraftVersion()}>إنشاء مسودة جديدة</button>}
            </div>

            {publishedWorkflow && <div className="workflow-published-note">النسخة المنشورة الحالية: v{publishedWorkflow.version} · {publishedWorkflow.published_at ? new Date(publishedWorkflow.published_at).toLocaleDateString('ar-SA') : '—'}</div>}

            {currentWorkflow && <form className="workflow-meta-form" onSubmit={saveWorkflowMeta}>
              <label><span>اسم سير العمل</span><input value={workflowName} disabled={currentWorkflow.status !== 'draft'} onChange={(e) => setWorkflowName(e.target.value)} /></label>
              <label><span>الوصف</span><input value={workflowDescription} disabled={currentWorkflow.status !== 'draft'} onChange={(e) => setWorkflowDescription(e.target.value)} /></label>
              {currentWorkflow.status === 'draft' && <button className="secondary-action" disabled={saving}>حفظ التعريف</button>}
            </form>}

            <div className="workflow-canvas">
              {currentSteps.map((step, index) => <div key={step.id} className="workflow-node-wrap">
                <button className={`workflow-node ${selectedStepId === step.id ? 'active' : ''}`} onClick={() => selectStep(step)}>
                  <span className={`workflow-node-number type-${step.step_type}`}>{step.step_order}</span>
                  <span className="workflow-node-body"><b>{step.name}</b><small>{TYPE_LABELS[step.step_type]} · {ROLE_LABELS[step.actor_role]}{step.sla_hours !== null ? ` · ${step.sla_hours} ساعة` : ''}</small></span>
                  <span className="workflow-node-tools">
                    <i onClick={(e) => { e.stopPropagation(); void moveStep(step, -1); }}>↑</i>
                    <i onClick={(e) => { e.stopPropagation(); void moveStep(step, 1); }}>↓</i>
                  </span>
                </button>
                {index < currentSteps.length - 1 && <div className="workflow-arrow">↓</div>}
              </div>)}
              {currentWorkflow?.status === 'draft' && <button className="workflow-add-step" onClick={startNewStep}>+ إضافة خطوة</button>}
              {!currentSteps.length && <div className="platform-empty">لا توجد خطوات في هذا السير.</div>}
            </div>
          </section>

          <form className="platform-panel workflow-step-editor" onSubmit={saveStep}>
            <div className="panel-heading"><div><h2>{selectedStepId ? 'إعداد الخطوة' : 'خطوة جديدة'}</h2><p>المتطلبات هنا تخص هذه المرحلة فقط.</p></div>{selectedStepId && currentWorkflow?.status === 'draft' && <button type="button" className="danger-action" onClick={deleteStep}>حذف</button>}</div>
            {!currentWorkflow ? <div className="platform-empty">اختر سير عمل أولًا.</div> : <>
              <div className="workflow-editor-grid">
                <label><span>اسم الخطوة</span><input disabled={currentWorkflow.status !== 'draft'} value={stepDraft.name} onChange={(e) => setStepDraft({ ...stepDraft, name: e.target.value })} /></label>
                <label><span>المفتاح الداخلي</span><input disabled={currentWorkflow.status !== 'draft'} value={stepDraft.step_key} onChange={(e) => setStepDraft({ ...stepDraft, step_key: e.target.value })} /></label>
                <label className="full-span"><span>الوصف</span><textarea disabled={currentWorkflow.status !== 'draft'} value={stepDraft.description || ''} onChange={(e) => setStepDraft({ ...stepDraft, description: e.target.value })} /></label>
                <label><span>نوع المرحلة</span><select disabled={currentWorkflow.status !== 'draft'} value={stepDraft.step_type} onChange={(e) => setStepDraft({ ...stepDraft, step_type: e.target.value as Step['step_type'] })}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><span>المسؤول</span><select disabled={currentWorkflow.status !== 'draft'} value={stepDraft.actor_role} onChange={(e) => setStepDraft({ ...stepDraft, actor_role: e.target.value as Step['actor_role'] })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><span>الحالة بعد الإكمال</span><select disabled={currentWorkflow.status !== 'draft'} value={stepDraft.status_after} onChange={(e) => setStepDraft({ ...stepDraft, status_after: e.target.value })}><option value="in_progress">قيد التنفيذ</option><option value="under_review">تحت المراجعة</option><option value="approved">معتمد</option><option value="completed">مكتمل</option></select></label>
                <label><span>المهلة بالساعات</span><input disabled={currentWorkflow.status !== 'draft'} type="number" min={0} value={stepDraft.sla_hours ?? ''} onChange={(e) => setStepDraft({ ...stepDraft, sla_hours: e.target.value === '' ? null : Number(e.target.value) })} /></label>
              </div>

              <h3 className="editor-section-title">الصلاحيات والمتطلبات</h3>
              <div className="requirement-grid workflow-requirements">
                <label><input disabled={currentWorkflow.status !== 'draft'} type="checkbox" checked={stepDraft.required} onChange={(e) => setStepDraft({ ...stepDraft, required: e.target.checked })} /><span>خطوة إلزامية</span></label>
                <label><input disabled={currentWorkflow.status !== 'draft'} type="checkbox" checked={stepDraft.can_reject} onChange={(e) => setStepDraft({ ...stepDraft, can_reject: e.target.checked })} /><span>يسمح بالرفض</span></label>
                <label><input disabled={currentWorkflow.status !== 'draft'} type="checkbox" checked={stepDraft.requires_photos} onChange={(e) => setStepDraft({ ...stepDraft, requires_photos: e.target.checked })} /><span>يتطلب صورًا</span></label>
                <label><input disabled={currentWorkflow.status !== 'draft'} type="checkbox" checked={stepDraft.requires_notes} onChange={(e) => setStepDraft({ ...stepDraft, requires_notes: e.target.checked })} /><span>يتطلب ملاحظات</span></label>
                <label><input disabled={currentWorkflow.status !== 'draft'} type="checkbox" checked={stepDraft.requires_quantity} onChange={(e) => setStepDraft({ ...stepDraft, requires_quantity: e.target.checked })} /><span>يتطلب كمية</span></label>
                <label><input disabled={currentWorkflow.status !== 'draft'} type="checkbox" checked={stepDraft.requires_gps} onChange={(e) => setStepDraft({ ...stepDraft, requires_gps: e.target.checked })} /><span>يتطلب GPS</span></label>
              </div>
              {currentWorkflow.status === 'draft' && <div className="editor-save-bar"><button className="primary-action" disabled={saving}>{saving ? 'جاري الحفظ...' : selectedStepId ? 'حفظ الخطوة' : 'إضافة الخطوة'}</button></div>}
            </>}
          </form>
        </div>
      </section>
    </main>
  );
}
