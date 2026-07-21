'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import '../platform.css';

type WorkType = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean | null;
  sort_order: number | null;
  icon: string | null;
  color: string | null;
  requires_photos: boolean | null;
  min_photos: number | null;
  max_photos: number | null;
  requires_notes: boolean | null;
  requires_quantity: boolean | null;
  default_unit: string | null;
  requires_before_after: boolean | null;
  requires_gps: boolean | null;
};

type Project = { id: string; name: string };
type Location = { id: string; project_id: string; name: string; location_category: string | null };
type ProjectLink = { work_type_id: string; project_id: string };
type CategoryLink = { work_type_id: string; category_name: string };
type LocationLink = { work_type_id: string; location_id: string };

type Draft = {
  name: string;
  code: string;
  description: string;
  icon: string;
  color: string;
  sort_order: number;
  active: boolean;
  requires_photos: boolean;
  min_photos: number;
  max_photos: number;
  requires_notes: boolean;
  requires_quantity: boolean;
  default_unit: string;
  requires_before_after: boolean;
  requires_gps: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: '',
  code: '',
  description: '',
  icon: '◆',
  color: '#5b3da8',
  sort_order: 100,
  active: true,
  requires_photos: true,
  min_photos: 1,
  max_photos: 5,
  requires_notes: false,
  requires_quantity: false,
  default_unit: '',
  requires_before_after: false,
  requires_gps: false,
};

function toDraft(row: WorkType): Draft {
  return {
    name: row.name || '',
    code: row.code || '',
    description: row.description || '',
    icon: row.icon || '◆',
    color: row.color || '#5b3da8',
    sort_order: row.sort_order ?? 100,
    active: row.active !== false,
    requires_photos: row.requires_photos !== false,
    min_photos: row.min_photos ?? 1,
    max_photos: row.max_photos ?? 5,
    requires_notes: row.requires_notes === true,
    requires_quantity: row.requires_quantity === true,
    default_unit: row.default_unit || '',
    requires_before_after: row.requires_before_after === true,
    requires_gps: row.requires_gps === true,
  };
}

export default function WorkTypesPage() {
  const [rows, setRows] = useState<WorkType[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [projectLinks, setProjectLinks] = useState<ProjectLink[]>([]);
  const [categoryLinks, setCategoryLinks] = useState<CategoryLink[]>([]);
  const [locationLinks, setLocationLinks] = useState<LocationLink[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll(preferredId?: string) {
    setLoading(true);
    setMessage('');

    const [workResult, projectResult, locationResult, projectLinkResult, categoryLinkResult, locationLinkResult] = await Promise.all([
      supabase.from('work_types').select('*').order('sort_order').order('name'),
      supabase.from('projects').select('id,name').order('name'),
      supabase.from('locations').select('id,project_id,name,location_category').eq('active', true).order('name'),
      supabase.from('work_type_projects').select('work_type_id,project_id'),
      supabase.from('work_type_categories').select('work_type_id,category_name'),
      supabase.from('work_type_locations').select('work_type_id,location_id'),
    ]);

    const firstError = [workResult, projectResult, locationResult, projectLinkResult, categoryLinkResult, locationLinkResult]
      .map((result) => result.error)
      .find(Boolean);

    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    const loadedRows = (workResult.data || []) as WorkType[];
    setRows(loadedRows);
    setProjects((projectResult.data || []) as Project[]);
    setLocations((locationResult.data || []) as Location[]);
    setProjectLinks((projectLinkResult.data || []) as ProjectLink[]);
    setCategoryLinks((categoryLinkResult.data || []) as CategoryLink[]);
    setLocationLinks((locationLinkResult.data || []) as LocationLink[]);

    const nextId = preferredId || selectedId || loadedRows[0]?.id || '';
    setSelectedId(nextId);
    const selected = loadedRows.find((row) => row.id === nextId);
    setDraft(selected ? toDraft(selected) : EMPTY_DRAFT);
    setLoading(false);
  }

  function selectWorkType(row: WorkType) {
    setSelectedId(row.id);
    setDraft(toDraft(row));
    setMessage('');
  }

  function startNew() {
    setSelectedId('');
    setDraft({ ...EMPTY_DRAFT, sort_order: (rows.at(-1)?.sort_order ?? rows.length * 10) + 10 });
    setMessage('');
  }

  async function saveWorkType(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.code.trim()) {
      setMessage('اكتب اسم نوع العمل والكود.');
      return;
    }
    if (draft.min_photos < 0 || draft.max_photos < draft.min_photos) {
      setMessage('تأكد من عدد الصور الأدنى والأقصى.');
      return;
    }

    setSaving(true);
    setMessage('');
    const payload = {
      name: draft.name.trim(),
      code: draft.code.trim().toUpperCase(),
      description: draft.description.trim() || null,
      icon: draft.icon.trim() || '◆',
      color: draft.color || '#5b3da8',
      sort_order: Number(draft.sort_order) || 0,
      active: draft.active,
      requires_photos: draft.requires_photos,
      min_photos: draft.requires_photos ? Number(draft.min_photos) || 0 : 0,
      max_photos: draft.requires_photos ? Number(draft.max_photos) || 0 : 0,
      requires_notes: draft.requires_notes,
      requires_quantity: draft.requires_quantity,
      default_unit: draft.requires_quantity ? draft.default_unit.trim() || null : null,
      requires_before_after: draft.requires_before_after,
      requires_gps: draft.requires_gps,
      updated_at: new Date().toISOString(),
    };

    const result = selectedId
      ? await supabase.from('work_types').update(payload).eq('id', selectedId).select('id').single()
      : await supabase.from('work_types').insert(payload).select('id').single();

    setSaving(false);
    if (result.error || !result.data) {
      setMessage(result.error?.message || 'تعذر حفظ نوع العمل.');
      return;
    }

    setMessage(selectedId ? 'تم تحديث نوع العمل.' : 'تم إنشاء نوع العمل.');
    await loadAll(result.data.id);
  }

  async function toggleProject(projectId: string, checked: boolean) {
    if (!selectedId) return;
    const result = checked
      ? await supabase.from('work_type_projects').upsert({ work_type_id: selectedId, project_id: projectId })
      : await supabase.from('work_type_projects').delete().eq('work_type_id', selectedId).eq('project_id', projectId);
    if (result.error) return setMessage(result.error.message);
    setProjectLinks((current) => checked
      ? [...current.filter((item) => !(item.work_type_id === selectedId && item.project_id === projectId)), { work_type_id: selectedId, project_id: projectId }]
      : current.filter((item) => !(item.work_type_id === selectedId && item.project_id === projectId)));
  }

  async function toggleCategory(category: string, checked: boolean) {
    if (!selectedId) return;
    const result = checked
      ? await supabase.from('work_type_categories').upsert({ work_type_id: selectedId, category_name: category })
      : await supabase.from('work_type_categories').delete().eq('work_type_id', selectedId).eq('category_name', category);
    if (result.error) return setMessage(result.error.message);
    setCategoryLinks((current) => checked
      ? [...current.filter((item) => !(item.work_type_id === selectedId && item.category_name === category)), { work_type_id: selectedId, category_name: category }]
      : current.filter((item) => !(item.work_type_id === selectedId && item.category_name === category)));
  }

  async function toggleLocation(locationId: string, checked: boolean) {
    if (!selectedId) return;
    const result = checked
      ? await supabase.from('work_type_locations').upsert({ work_type_id: selectedId, location_id: locationId })
      : await supabase.from('work_type_locations').delete().eq('work_type_id', selectedId).eq('location_id', locationId);
    if (result.error) return setMessage(result.error.message);
    setLocationLinks((current) => checked
      ? [...current.filter((item) => !(item.work_type_id === selectedId && item.location_id === locationId)), { work_type_id: selectedId, location_id: locationId }]
      : current.filter((item) => !(item.work_type_id === selectedId && item.location_id === locationId)));
  }

  const categories = useMemo(
    () => Array.from(new Set(locations.map((location) => location.location_category || 'غير مصنف'))).sort(),
    [locations],
  );

  const selectedProjectIds = useMemo(
    () => new Set(projectLinks.filter((item) => item.work_type_id === selectedId).map((item) => item.project_id)),
    [projectLinks, selectedId],
  );
  const selectedCategories = useMemo(
    () => new Set(categoryLinks.filter((item) => item.work_type_id === selectedId).map((item) => item.category_name)),
    [categoryLinks, selectedId],
  );
  const selectedLocationIds = useMemo(
    () => new Set(locationLinks.filter((item) => item.work_type_id === selectedId).map((item) => item.location_id)),
    [locationLinks, selectedId],
  );

  const visibleLocations = useMemo(() => {
    return locations.filter((location) => {
      const projectAllowed = selectedProjectIds.size === 0 || selectedProjectIds.has(location.project_id);
      const category = location.location_category || 'غير مصنف';
      const categoryAllowed = selectedCategories.size === 0 || selectedCategories.has(category);
      return projectAllowed && categoryAllowed;
    });
  }, [locations, selectedProjectIds, selectedCategories]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.name} ${row.code} ${row.description || ''}`.toLowerCase().includes(needle));
  }, [rows, query]);

  return (
    <main className="platform-shell work-types-admin" dir="rtl">
      <aside className="platform-sidebar">
        <div className="platform-brand-mark">م</div>
        <div><strong>منصة الأعمال الميدانية</strong><span>إدارة أنواع الأعمال وربطها</span></div>
        <nav>
          <Link href="/platform">المشاريع</Link>
          <Link href="/platform/locations">سجل المواقع المركزي</Link>
          <Link href="/platform/imports">استيراد المواقع</Link>
          <Link className="active" href="/platform/work-types">أنواع الأعمال</Link>
          <Link href="/">النظام السابق</Link>
        </nav>
      </aside>

      <section className="platform-content">
        <header className="platform-header">
          <div><span className="eyebrow">المرحلة الرابعة</span><h1>محرك أنواع الأعمال</h1><p>أنشئ العمل، حدد متطلباته، واربطه بالمشاريع والتصنيفات والمواقع.</p></div>
          <button className="primary-action" onClick={startNew}>+ نوع عمل جديد</button>
        </header>

        <section className="platform-stats">
          <article><span>أنواع الأعمال</span><strong>{rows.length}</strong></article>
          <article><span>الأنواع النشطة</span><strong>{rows.filter((row) => row.active !== false).length}</strong></article>
          <article><span>روابط المشاريع</span><strong>{projectLinks.length}</strong></article>
          <article><span>روابط المواقع المباشرة</span><strong>{locationLinks.length}</strong></article>
        </section>

        {message && <div className="import-message">{message}</div>}

        <div className="work-engine-layout">
          <section className="platform-panel work-types-list-panel">
            <div className="panel-heading">
              <div><h2>أنواع الأعمال</h2><p>اختر بطاقة لإدارة إعداداتها.</p></div>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالاسم أو الكود..." />
            </div>
            {loading ? <div className="platform-empty">جاري التحميل...</div> : (
              <div className="work-type-admin-list">
                {filteredRows.map((row) => {
                  const projectCount = projectLinks.filter((item) => item.work_type_id === row.id).length;
                  const locationCount = locationLinks.filter((item) => item.work_type_id === row.id).length;
                  return (
                    <button key={row.id} className={selectedId === row.id ? 'active' : ''} onClick={() => selectWorkType(row)}>
                      <span className="work-type-icon" style={{ background: row.color || '#5b3da8' }}>{row.icon || '◆'}</span>
                      <span className="work-type-list-body"><b>{row.name}</b><small>{row.code} · {projectCount} مشروع · {locationCount} موقع مباشر</small></span>
                      <span className={row.active === false ? 'pill off' : 'pill'}>{row.active === false ? 'موقوف' : 'نشط'}</span>
                    </button>
                  );
                })}
                {!filteredRows.length && <div className="platform-empty">لا توجد أنواع مطابقة.</div>}
              </div>
            )}
          </section>

          <form className="platform-panel work-type-editor" onSubmit={saveWorkType}>
            <div className="panel-heading"><div><h2>{selectedId ? 'إدارة نوع العمل' : 'نوع عمل جديد'}</h2><p>الحفظ هنا يجهز النوع للجدولة والمهام اليومية.</p></div></div>

            <div className="work-editor-grid">
              <label><span>اسم العمل</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="مثال: ري الحدائق" /></label>
              <label><span>الكود</span><input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="IRRIGATION" /></label>
              <label className="full-span"><span>الوصف</span><textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="وصف مختصر لطبيعة العمل" /></label>
              <label><span>الأيقونة</span><input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} /></label>
              <label><span>لون البطاقة</span><input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
              <label><span>ترتيب الظهور</span><input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} /></label>
              <label className="switch-row"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /><span>نوع العمل نشط</span></label>
            </div>

            <h3 className="editor-section-title">متطلبات التنفيذ</h3>
            <div className="requirement-grid">
              <label><input type="checkbox" checked={draft.requires_photos} onChange={(e) => setDraft({ ...draft, requires_photos: e.target.checked })} /><span>يتطلب صورًا</span></label>
              <label><input type="checkbox" checked={draft.requires_notes} onChange={(e) => setDraft({ ...draft, requires_notes: e.target.checked })} /><span>يتطلب ملاحظات</span></label>
              <label><input type="checkbox" checked={draft.requires_quantity} onChange={(e) => setDraft({ ...draft, requires_quantity: e.target.checked })} /><span>يتطلب كمية</span></label>
              <label><input type="checkbox" checked={draft.requires_before_after} onChange={(e) => setDraft({ ...draft, requires_before_after: e.target.checked })} /><span>صور قبل وبعد</span></label>
              <label><input type="checkbox" checked={draft.requires_gps} onChange={(e) => setDraft({ ...draft, requires_gps: e.target.checked })} /><span>يتطلب GPS</span></label>
            </div>

            {draft.requires_photos && <div className="work-editor-grid compact-fields">
              <label><span>الحد الأدنى للصور</span><input type="number" min={0} value={draft.min_photos} onChange={(e) => setDraft({ ...draft, min_photos: Number(e.target.value) })} /></label>
              <label><span>الحد الأعلى للصور</span><input type="number" min={0} value={draft.max_photos} onChange={(e) => setDraft({ ...draft, max_photos: Number(e.target.value) })} /></label>
            </div>}
            {draft.requires_quantity && <div className="work-editor-grid compact-fields"><label><span>وحدة القياس الافتراضية</span><input value={draft.default_unit} onChange={(e) => setDraft({ ...draft, default_unit: e.target.value })} placeholder="م²، شجرة، متر طولي..." /></label></div>}

            <div className="editor-save-bar"><button className="primary-action" disabled={saving}>{saving ? 'جاري الحفظ...' : selectedId ? 'حفظ التعديلات' : 'إنشاء نوع العمل'}</button></div>

            {selectedId && <>
              <h3 className="editor-section-title">المشاريع</h3>
              <div className="assignment-grid">
                {projects.map((project) => <label key={project.id}><input type="checkbox" checked={selectedProjectIds.has(project.id)} onChange={(e) => void toggleProject(project.id, e.target.checked)} /><span>{project.name}</span></label>)}
              </div>

              <h3 className="editor-section-title">التصنيفات المسموحة</h3>
              <p className="editor-help">تركها كلها بدون تحديد يعني أن العمل متاح لجميع التصنيفات.</p>
              <div className="assignment-grid">
                {categories.map((category) => <label key={category}><input type="checkbox" checked={selectedCategories.has(category)} onChange={(e) => void toggleCategory(category, e.target.checked)} /><span>{category}</span></label>)}
              </div>

              <h3 className="editor-section-title">المواقع المباشرة</h3>
              <p className="editor-help">اختياري. المواقع الظاهرة تتبع المشاريع والتصنيفات المختارة.</p>
              <div className="location-assignment-list">
                {visibleLocations.map((location) => {
                  const project = projects.find((item) => item.id === location.project_id);
                  return <label key={location.id}><input type="checkbox" checked={selectedLocationIds.has(location.id)} onChange={(e) => void toggleLocation(location.id, e.target.checked)} /><span><b>{location.name}</b><small>{project?.name || '—'} · {location.location_category || 'غير مصنف'}</small></span></label>;
                })}
                {!visibleLocations.length && <div className="platform-empty">لا توجد مواقع ضمن الاختيارات الحالية.</div>}
              </div>
            </>}
          </form>
        </div>
      </section>
    </main>
  );
}
