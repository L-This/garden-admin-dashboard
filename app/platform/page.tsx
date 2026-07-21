'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import './platform.css';

type Project = { id: string; name: string; district?: string | null };
type LocationRow = { project_id: string; active?: boolean | null };
type WorkType = { id: string; name: string; code: string; active?: boolean | null };

export default function FieldOperationsPlatform() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void loadPlatform();
  }, []);

  async function loadPlatform() {
    setLoading(true);
    const [projectsResult, locationsResult, workTypesResult] = await Promise.all([
      supabase.from('projects').select('id,name,district').order('name'),
      supabase.from('locations').select('project_id,active'),
      supabase.from('work_types').select('id,name,code,active').eq('active', true).order('sort_order'),
    ]);

    setProjects(projectsResult.data || []);
    setLocations(locationsResult.data || []);
    setWorkTypes(workTypesResult.data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      `${project.name} ${project.district || ''}`.toLowerCase().includes(needle),
    );
  }, [projects, query]);

  const activeLocations = locations.filter((location) => location.active !== false).length;

  return (
    <main className="platform-shell" dir="rtl">
      <aside className="platform-sidebar">
        <div className="platform-brand-mark">م</div>
        <div>
          <strong>منصة الأعمال الميدانية</strong>
          <span>إدارة موحدة للمشاريع والمواقع والأعمال</span>
        </div>
        <nav>
          <Link className="active" href="/platform">نظرة عامة</Link>
          <Link href="/platform/locations">سجل المواقع المركزي</Link>
          <Link href="/platform/imports">استيراد المواقع</Link>
          <Link href="/platform/work-types">أنواع الأعمال</Link>
          <Link href="/legacy">النظام السابق</Link>
        </nav>
      </aside>

      <section className="platform-content">
        <header className="platform-header">
          <div>
            <span className="eyebrow">النسخة الجديدة</span>
            <h1>المشاريع</h1>
            <p>اختر مشروعًا، ثم تنقل بين المواقع والأعمال والتقارير دون إغراق الشاشة.</p>
          </div>
          <div className="platform-header-actions">
            <Link className="secondary-action" href="/platform/locations">إدارة المواقع</Link>
          </div>
        </header>

        <section className="platform-stats">
          <article><span>المشاريع</span><strong>{projects.length}</strong></article>
          <article><span>المواقع النشطة</span><strong>{activeLocations}</strong></article>
          <article><span>أنواع الأعمال</span><strong>{workTypes.length}</strong></article>
          <article><span>بنية النظام</span><strong className="status-ready">جاهزة للاستيراد</strong></article>
        </section>

        <section className="platform-panel">
          <div className="panel-heading">
            <div><h2>بوابة المشاريع</h2><p>كل مشروع يفتح في صفحة مستقلة بأقسام مختصرة.</p></div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن مشروع..." />
          </div>

          {loading ? (
            <div className="platform-empty">جاري تحميل بنية المنصة...</div>
          ) : filtered.length ? (
            <div className="project-grid">
              {filtered.map((project) => {
                const count = locations.filter((location) => location.project_id === project.id && location.active !== false).length;
                return (
                  <Link key={project.id} className="project-tile" href={`/platform/project/${project.id}`}>
                    <div className="project-icon">م</div>
                    <div className="project-tile-body">
                      <h3>{project.name}</h3>
                      <p>{project.district || 'بدون نطاق مسجل'}</p>
                      <div className="project-meta"><span>{count} موقع</span><span>{workTypes.length} أنواع أعمال</span></div>
                    </div>
                    <span className="project-arrow">←</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="platform-empty">لا توجد مشاريع مطابقة.</div>
          )}
        </section>
      </section>
    </main>
  );
}
