import Link from 'next/link';
import { OperationTask, ROLE_LABELS, STATUS_LABELS, taskProgress } from './operations-types';

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return new Date(value).toLocaleDateString('ar-SA');
}

export default function TasksTable({ tasks, loading }: { tasks: OperationTask[]; loading: boolean }) {
  return <section className="platform-panel operations-table-panel">
    <div className="panel-heading"><div><h2>جدول المهام المباشر</h2><p>{tasks.length} مهمة مطابقة للفلاتر الحالية</p></div><span className="live-badge"><i /> مباشر</span></div>
    <div className="operations-table-wrap">
      <table className="operations-table">
        <thead><tr><th>رقم المهمة</th><th>المشروع والموقع</th><th>نوع العمل</th><th>الحالة</th><th>المسؤول الحالي</th><th>الإنجاز</th><th>آخر تحديث</th><th /></tr></thead>
        <tbody>{!loading && tasks.map((task) => { const progress = taskProgress(task); return <tr key={task.id}>
          <td><strong>{task.task_number || '—'}</strong></td>
          <td><strong>{task.location_name}</strong><small>{task.project_name} · {task.location_code || 'بدون كود'}</small></td>
          <td>{task.work_type_name}</td>
          <td><span className={`task-state ${task.status}`}>{STATUS_LABELS[task.status] || task.status}</span></td>
          <td>{ROLE_LABELS[task.current_actor_role || ''] || task.current_actor_role || '—'}<small>{task.current_step_name || '—'}</small></td>
          <td><div className="table-progress"><span><i style={{ width: `${progress}%` }} /></span><b>{progress}%</b></div></td>
          <td>{relativeTime(task.last_updated)}</td>
          <td><Link href={`/platform/tasks/${task.id}`}>فتح البطاقة</Link></td>
        </tr>; })}</tbody>
      </table>
      {loading && <div className="platform-empty">جاري تحديث لوحة العمليات...</div>}
      {!loading && !tasks.length && <div className="platform-empty">لا توجد مهام مطابقة.</div>}
    </div>
  </section>;
}
