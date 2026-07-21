import { OperationFilters, ROLE_LABELS, STATUS_LABELS } from './operations-types';

type Option = { id: string; name: string };

export default function FiltersBar({ filters, projects, workTypes, onChange, onReset }: {
  filters: OperationFilters;
  projects: Option[];
  workTypes: Option[];
  onChange: (next: OperationFilters) => void;
  onReset: () => void;
}) {
  const set = (key: keyof OperationFilters, value: string) => onChange({ ...filters, [key]: value });
  return <section className="operations-filters" aria-label="فلاتر المهام">
    <label><span>المشروع</span><select value={filters.projectId} onChange={(event) => set('projectId', event.target.value)}><option value="">كل المشاريع</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label><span>نوع العمل</span><select value={filters.workTypeId} onChange={(event) => set('workTypeId', event.target.value)}><option value="">كل الأعمال</option>{workTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label><span>الحالة</span><select value={filters.status} onChange={(event) => set('status', event.target.value)}><option value="">كل الحالات</option>{Object.entries(STATUS_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    <label><span>المسؤول</span><select value={filters.actorRole} onChange={(event) => set('actorRole', event.target.value)}><option value="">كل المسؤولين</option>{Object.entries(ROLE_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    <label className="operations-search"><span>البحث</span><input value={filters.query} onChange={(event) => set('query', event.target.value)} placeholder="رقم المهمة أو الموقع..." /></label>
    <button type="button" onClick={onReset}>مسح الفلاتر</button>
  </section>;
}
