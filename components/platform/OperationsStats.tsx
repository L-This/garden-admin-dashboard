import { OperationTask } from './operations-types';

export default function OperationsStats({ tasks }: { tasks: OperationTask[] }) {
  const cards = [
    ['جديدة', tasks.filter((task) => task.status === 'pending').length, 'pending'],
    ['قيد التنفيذ', tasks.filter((task) => task.status === 'in_progress').length, 'in_progress'],
    ['تحت المراجعة', tasks.filter((task) => ['under_review', 'approved'].includes(task.status)).length, 'under_review'],
    ['مرفوضة', tasks.filter((task) => task.status === 'rejected').length, 'rejected'],
    ['مكتملة', tasks.filter((task) => task.status === 'completed').length, 'completed'],
    ['إجمالي اليوم', tasks.length, 'total'],
  ] as const;

  return <section className="operations-stats" aria-label="مؤشرات مهام اليوم">
    {cards.map(([label, value, state]) => <article key={state} className={state}>
      <i aria-hidden="true" />
      <div><span>{label}</span><strong>{value}</strong></div>
    </article>)}
  </section>;
}
