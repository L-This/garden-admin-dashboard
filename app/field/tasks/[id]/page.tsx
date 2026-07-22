'use client';

import Link from 'next/link';
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ROLE_LABELS, STATUS_LABELS } from '@/components/platform/operations-types';
import '../../../platform/platform.css';

type Profile = { display_name: string; role: string };
type Task = { id:string; task_number:string|null; status:string; scheduled_date:string; project_name:string; location_name:string; location_code:string|null; work_type_name:string; current_step_order:number; current_step_name:string|null; current_actor_role:string|null; total_steps:number; completed_steps:number };
type Step = { id:string; step_order:number; name:string; actor_role:string; status:string; workflow_steps:any };
type Attachment = { id:string; file_name:string; file_type:string|null; public_url:string|null; created_at:string };

export default function FieldTaskPage() {
  const params = useParams(); const router = useRouter(); const taskId = String(params.id || '');
  const [profile,setProfile] = useState<Profile|null>(null); const [task,setTask] = useState<Task|null>(null); const [steps,setSteps] = useState<Step[]>([]); const [attachments,setAttachments] = useState<Attachment[]>([]);
  const [notes,setNotes] = useState(''); const [quantity,setQuantity] = useState(''); const [gps,setGps] = useState(''); const [loading,setLoading] = useState(true); const [saving,setSaving] = useState(false); const [message,setMessage] = useState('');

  const load = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession(); if (!session.session) { router.replace('/field/login'); return; }
    const [profileResult, allowedTasks] = await Promise.all([supabase.rpc('my_field_profile'), supabase.rpc('my_field_task', { p_run_id: taskId })]);
    if (profileResult.error || !profileResult.data?.length) { setMessage('الحساب غير مربوط بملف تشغيلي.'); setLoading(false); return; }
    setProfile(profileResult.data[0] as Profile);
    const allowedTask = (allowedTasks.data || [])[0];
    if (!allowedTask) { setMessage('المهمة غير موجودة أو غير متاحة لحسابك.'); setLoading(false); return; }
    const [stepResult, attachmentResult] = await Promise.all([
      supabase.from('workflow_run_steps').select('id,step_order,name,actor_role,status,workflow_steps(description,can_reject,requires_photos,requires_notes,requires_quantity,requires_gps)').eq('run_id',taskId).order('step_order'),
      supabase.from('workflow_task_attachments').select('id,file_name,file_type,public_url,created_at').eq('run_id',taskId).order('created_at',{ascending:false}),
    ]);
    setTask(allowedTask as Task); setSteps((stepResult.data || []) as Step[]); setAttachments((attachmentResult.data || []) as Attachment[]); setLoading(false);
  },[router,taskId]);
  useEffect(()=>{void load();},[load]);
  const currentStep = useMemo(()=>steps.find((step)=>step.step_order===task?.current_step_order)||null,[steps,task]);
  const requirements = Array.isArray(currentStep?.workflow_steps) ? currentStep?.workflow_steps[0] : currentStep?.workflow_steps;
  const canAct = Boolean(task && profile && task.current_actor_role === profile.role && !['completed','rejected','cancelled'].includes(task.status));

  function friendlyError(value:string) { if(value.includes('ROLE_NOT_ALLOWED'))return 'لا يطابق دور الحساب المسؤول الحالي عن هذه الخطوة. حدّث الصفحة وحاول مجددًا.'; if(value.includes('PHOTOS_REQUIRED'))return 'يجب رفع صورة واحدة على الأقل قبل إكمال الخطوة.'; if(value.includes('NOTES_REQUIRED'))return 'يجب كتابة ملاحظات الإجراء قبل الإكمال.'; if(value.includes('QUANTITY_REQUIRED'))return 'يجب إدخال الكمية المنفذة.'; if(value.includes('GPS_REQUIRED'))return 'يجب إدخال إحداثيات الموقع.'; return value; }
  async function start() { setSaving(true); const {error}=await supabase.rpc('start_my_field_task',{p_run_id:taskId}); setSaving(false); if(error)return setMessage(friendlyError(error.message)); setMessage('تم بدء المهمة.'); await load(); }
  async function complete(reject=false) { setSaving(true); const {error}=await supabase.rpc('complete_my_field_task_step',{p_run_id:taskId,p_notes:notes.trim()||null,p_quantity:quantity?Number(quantity):null,p_gps:gps.trim()||null,p_reject:reject}); setSaving(false); if(error)return setMessage(friendlyError(error.message)); setMessage(reject?'تم رفض المهمة وإرسال القرار.':'تم إكمال الخطوة بنجاح.'); setNotes('');setQuantity('');setGps('');await load(); }
  async function upload(event:ChangeEvent<HTMLInputElement>) { if(!event.target.files?.length||!currentStep)return; setSaving(true); for(const file of Array.from(event.target.files)){const path=`${taskId}/${crypto.randomUUID()}.${file.name.split('.').pop()||'bin'}`;const {error}=await supabase.storage.from('task-evidence').upload(path,file);if(error){setSaving(false);return setMessage(error.message);}const {data:url}=supabase.storage.from('task-evidence').getPublicUrl(path);const {error:rowError}=await supabase.from('workflow_task_attachments').insert({run_id:taskId,run_step_id:currentStep.id,file_name:file.name,file_type:file.type||'file',storage_path:path,public_url:url.publicUrl,uploaded_by:profile?.display_name});if(rowError){setSaving(false);return setMessage(rowError.message);}}setSaving(false);setMessage('تم رفع الأدلة.');event.target.value='';await load(); }
  if(loading)return <main className="field-loading" dir="rtl"><i>م</i><p>جاري تحميل المهمة...</p></main>;
  if(!task)return <main className="field-loading" dir="rtl"><p>{message}</p><Link href="/field">العودة للمهام</Link></main>;
  const progress=task.total_steps?Math.round(task.completed_steps/task.total_steps*100):0;
  return <main className="field-task-page" dir="rtl"><header className="field-task-top"><Link href="/field">→ العودة لمهامي</Link><div><strong>{profile?.display_name}</strong><span>{ROLE_LABELS[profile?.role||'']}</span></div></header><section className="field-task-content">
    <header className="field-task-title"><div><span className="eyebrow">{task.task_number}</span><h1>{task.location_name}</h1><p>{task.project_name} · {task.work_type_name} · {task.location_code||'بدون كود'}</p></div><span className={`task-state large ${task.status}`}>{STATUS_LABELS[task.status]||task.status}</span></header>
    {message&&<div className="field-auth-message wide">{message}</div>}<section className="field-detail-stats"><article><span>تاريخ المهمة</span><strong>{new Date(`${task.scheduled_date}T12:00:00`).toLocaleDateString('ar-SA')}</strong></article><article><span>المسؤول الحالي</span><strong>{ROLE_LABELS[task.current_actor_role||'']||'—'}</strong></article><article><span>الخطوة الحالية</span><strong>{task.current_step_name||'—'}</strong></article><article><span>الإنجاز</span><strong>{progress}%</strong></article></section>
    <section className="field-detail-layout"><div><section className="field-action-card"><div className="panel-heading"><div><h2>{currentStep?.name||'اكتملت دورة المهمة'}</h2><p>{requirements?.description||'نفّذ الإجراء المطلوب ثم أكمل الخطوة.'}</p></div>{currentStep&&<span className="task-state in_progress">{ROLE_LABELS[currentStep.actor_role]||currentStep.actor_role}</span>}</div>
      {canAct&&<><div className="field-requirements"><span className={requirements?.requires_photos?'required':''}>صور وأدلة <b>{attachments.length}</b></span><span className={requirements?.requires_notes?'required':''}>ملاحظات</span><span className={requirements?.requires_quantity?'required':''}>كمية</span><span className={requirements?.requires_gps?'required':''}>GPS</span></div>{task.status!=='pending'&&<div className="field-action-form">{requirements?.requires_quantity&&<label><span>الكمية المنفذة</span><input type="number" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>}{requirements?.requires_gps&&<label><span>إحداثيات الموقع</span><input value={gps} onChange={e=>setGps(e.target.value)} placeholder="21.0000, 39.0000"/></label>}<label className="wide"><span>ملاحظات الإجراء</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="اكتب تفاصيل التنفيذ أو قرار المراجعة..."/></label></div>}<div className="field-action-buttons">{task.status==='pending'?<button onClick={start} disabled={saving}>بدء التنفيذ</button>:<><button onClick={()=>complete(false)} disabled={saving}>{profile?.role==='contractor'?'تسليم للمراجعة':profile?.role==='supervisor'?'اعتماد الخطوة':'إكمال الإجراء'}</button>{requirements?.can_reject&&<button className="reject" onClick={()=>complete(true)} disabled={saving}>رفض المهمة</button>}</>}</div></>}
      {!canAct&&<div className="field-waiting">هذه المهمة ليست بانتظار إجراء من دورك حاليًا.</div>}</section>
      <section className="field-evidence-card"><div className="panel-heading"><div><h2>الأدلة والمرفقات</h2><p>صور التنفيذ والملفات المرتبطة بالمهمة.</p></div>{canAct&&<label className="field-upload">{saving?'جاري الرفع...':'رفع صور'}<input type="file" multiple accept="image/*,.pdf" onChange={upload} disabled={saving}/></label>}</div><div className="field-evidence-grid">{attachments.map(item=><a key={item.id} href={item.public_url||'#'} target="_blank" rel="noreferrer"><i>{item.file_type?.startsWith('image/')?'▧':'◇'}</i><strong>{item.file_name}</strong><span>{new Date(item.created_at).toLocaleString('ar-SA')}</span></a>)}{!attachments.length&&<div className="platform-empty full-span">لا توجد مرفقات بعد.</div>}</div></section></div>
      <aside className="field-steps-card"><h2>مسار المهمة</h2>{steps.map(step=><article key={step.id} className={`${step.status} ${step.step_order===task.current_step_order?'current':''}`}><b>{step.step_order}</b><div><strong>{step.name}</strong><span>{ROLE_LABELS[step.actor_role]||step.actor_role}</span></div><em>{step.status==='completed'?'مكتملة':step.status==='in_progress'?'جارية':step.status==='rejected'?'مرفوضة':'قادمة'}</em></article>)}</aside>
    </section></section></main>;
}
