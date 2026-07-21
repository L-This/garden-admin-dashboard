import Link from 'next/link';
import { OperationTask } from './operations-types';

export default function AlertsPanel({ tasks }: { tasks: OperationTask[] }) {
  const alerts = tasks.flatMap((task) => {
    const rows: { kind: string; title: string; text: string }[] = [];
    const ageHours = (Date.now() - new Date(task.last_updated).getTime()) / 3600000;
    if (!['completed', 'cancelled'].includes(task.status) && ageHours >= 4) rows.push({ kind: 'stalled', title: 'مهمة متوقفة', text: `دون تحديث منذ ${Math.floor(ageHours)} ساعات` });
    if (task.status === 'in_progress' && task.attachment_count === 0) rows.push({ kind: 'evidence', title: 'بدون مرفقات', text: 'بدأ التنفيذ ولم ترفع أدلة بعد' });
    if (['under_review', 'approved'].includes(task.status)) rows.push({ kind: 'review', title: 'بانتظار المراجعة', text: task.current_step_name || 'تحتاج إجراء المشرف' });
    if (task.status === 'rejected') rows.push({ kind: 'rejected', title: 'مهمة مرفوضة', text: 'تحتاج معالجة ومتابعة' });
    return rows.map((row) => ({ ...row, task }));
  }).slice(0, 8);

  return <section className="platform-panel alerts-panel"><div className="panel-heading"><div><h2>تنبيهات العمليات</h2><p>الحالات التي تحتاج تدخلًا سريعًا</p></div><b>{alerts.length}</b></div><div className="operations-alerts">
    {alerts.map((alert, index) => <Link href={`/platform/tasks/${alert.task.id}`} key={`${alert.task.id}-${alert.kind}-${index}`}><i className={alert.kind}>!</i><div><strong>{alert.title}</strong><span>{alert.task.location_name} · {alert.text}</span></div><em>←</em></Link>)}
    {!alerts.length && <div className="platform-empty">لا توجد تنبيهات حالية.</div>}
  </div></section>;
}
