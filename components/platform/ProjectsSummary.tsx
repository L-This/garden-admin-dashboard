import { OperationTask, taskProgress } from './operations-types';

export default function ProjectsSummary({ tasks }: { tasks: OperationTask[] }) {
  const projects = Array.from(new Map(tasks.map((task) => [task.project_id, task.project_name])).entries()).map(([id, name]) => {
    const rows = tasks.filter((task) => task.project_id === id);
    const completion = rows.length ? Math.round(rows.reduce((sum, task) => sum + taskProgress(task), 0) / rows.length) : 0;
    return { id, name, total: rows.length, completion, delayed: rows.filter((task) => !['completed', 'cancelled'].includes(task.status) && Date.now() - new Date(task.last_updated).getTime() > 4 * 3600000).length, active: rows.filter((task) => ['in_progress', 'under_review', 'approved'].includes(task.status)).length, completed: rows.filter((task) => task.status === 'completed').length };
  });

  return <section className="platform-panel projects-summary-panel"><div className="panel-heading"><div><h2>أداء المشاريع</h2><p>ملخص تنفيذ المهام في التاريخ المحدد</p></div></div><div className="projects-operations-grid">
    {projects.map((project) => <article key={project.id}><div><strong>{project.name}</strong><span>{project.total} مهمة</span></div><div className="project-completion"><span><i style={{ width: `${project.completion}%` }} /></span><b>{project.completion}%</b></div><footer><span>نشطة <b>{project.active}</b></span><span>متأخرة <b>{project.delayed}</b></span><span>مكتملة <b>{project.completed}</b></span></footer></article>)}
    {!projects.length && <div className="platform-empty full-span">لا توجد مشاريع ضمن النتائج.</div>}
  </div></section>;
}
