import Link from 'next/link';
import { OperationTask, STATUS_LABELS } from './operations-types';

export default function OperationsMap({ tasks }: { tasks: OperationTask[] }) {
  const locations = Array.from(new Map(tasks.map((task) => [task.location_id, task])).values()).slice(0, 24);
  return <section className="platform-panel operations-map-panel"><div className="panel-heading"><div><h2>خريطة المواقع التشغيلية</h2><p>عرض أولي للمواقع حسب حالة آخر مهمة</p></div><div className="map-legend"><span className="completed">مكتملة</span><span className="in_progress">تنفيذ</span><span className="under_review">مراجعة</span><span className="rejected">متوقفة</span></div></div>
    <div className="operations-map" role="img" aria-label="مخطط مواقع المهام حسب الحالة">
      <div className="map-road one" /><div className="map-road two" /><div className="map-road three" />
      {locations.map((task, index) => <Link title={`${task.location_name} — ${STATUS_LABELS[task.status] || task.status}`} className={`map-pin ${task.status}`} style={{ right: `${8 + ((index * 17) % 84)}%`, top: `${12 + ((index * 29) % 72)}%` }} href={`/platform/tasks/${task.id}`} key={task.location_id}><i /><span>{task.location_name}</span></Link>)}
      {!locations.length && <div className="map-empty">لا توجد مواقع لعرضها.</div>}
    </div>
  </section>;
}
