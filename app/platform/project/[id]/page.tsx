'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import '../../platform.css';

type Tab = 'overview' | 'locations' | 'work' | 'reports';

export default function PlatformProjectPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [workTypes, setWorkTypes] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [query, setQuery] = useState('');

  useEffect(() => { void load(); }, [params.id]);

  async function load() {
    const [p, l, w, a] = await Promise.all([
      supabase.from('projects').select('*').eq('id', params.id).single(),
      supabase.from('locations').select('*').eq('project_id', params.id).order('name'),
      supabase.from('work_types').select('*').eq('active', true).order('sort_order'),
      supabase.from('location_work_types').select('*').eq('project_id', params.id).eq('active', true),
    ]);
    setProject(p.data);
    setLocations(l.data || []);
    setWorkTypes(w.data || []);
    setAssignments(a.data || []);
  }

  const visibleLocations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return locations.filter((location) => !needle || `${location.name} ${location.location_code || ''}`.toLowerCase().includes(needle));
  }, [locations, query]);

  return (
    <main className="project-workspace" dir="rtl">
      <header className="workspace-header">
        <div className="breadcrumbs"><Link href="/platform">المشاريع</Link><span>/</span><strong>{project?.name || 'المشروع'}</strong></div>
        <div className="workspace-title"><div><h1>{project?.name || 'جاري التحميل...'}</h1><p>صفحة موحدة للموقع والأعمال والتقارير.</p></div><Link className="secondary-action" href="/platform">عودة للمشاريع</Link></div>
        <nav className="workspace-tabs">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>الملخص</button>
          <button className={tab === 'locations' ? 'active' : ''} onClick={() => setTab('locations')}>المواقع</button>
          <button className={tab === 'work' ? 'active' : ''} onClick={() => setTab('work')}>الأعمال</button>
          <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>التقارير</button>
        </nav>
      </header>

      <section className="workspace-body">
        {tab === 'overview' && <>
          <div className="platform-stats compact"><article><span>المواقع</span><strong>{locations.length}</strong></article><article><span>الأعمال المفعلة</span><strong>{assignments.length}</strong></article><article><span>أنواع الأعمال</span><strong>{workTypes.length}</strong></article><article><span>حالة المشروع</span><strong className="status-ready">نشط</strong></article></div>
          <div className="split-panels">
            <section className="platform-panel"><div className="panel-heading"><div><h2>الوصول السريع</h2><p>افتح القسم المطلوب فقط.</p></div></div><div className="quick-grid"><button onClick={() => setTab('locations')}>سجل المواقع<span>عرض المواقع التابعة للمشروع</span></button><button onClick={() => setTab('work')}>أنواع الأعمال<span>إدارة الأعمال المرتبطة بالمواقع</span></button><button onClick={() => setTab('reports')}>التقارير<span>تقارير يومية وفترية</span></button></div></section>
            <section className="platform-panel"><div className="panel-heading"><div><h2>هيكل المشروع</h2><p>المشروع ← الموقع ← نوع العمل.</p></div></div><div className="structure-flow"><span>{project?.name || 'المشروع'}</span><b>←</b><span>{locations.length} موقع</span><b>←</b><span>{assignments.length} ارتباط عمل</span></div></section>
          </div>
        </>}

        {tab === 'locations' && <section className="platform-panel"><div className="panel-heading"><div><h2>مواقع المشروع</h2><p>قائمة مختصرة؛ تفاصيل الموقع تفتح عند اختياره لاحقًا.</p></div><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالاسم أو الكود..." /></div><div className="data-list">{visibleLocations.map((location) => <article key={location.id}><div><strong>{location.name}</strong><span>{location.location_code || 'بدون كود'} · {location.location_type || 'غير مصنف'}</span></div><span className={location.active === false ? 'pill off' : 'pill'}>{location.active === false ? 'موقوف' : 'نشط'}</span></article>)}{!visibleLocations.length && <div className="platform-empty">ستظهر المواقع هنا بعد تشغيل ملف قاعدة البيانات واستيراد Excel.</div>}</div></section>}

        {tab === 'work' && <section className="platform-panel"><div className="panel-heading"><div><h2>أنواع الأعمال</h2><p>كل بطاقة تعرض نوع عمل واحد فقط.</p></div></div><div className="work-grid">{workTypes.map((work) => { const count = assignments.filter((item) => item.work_type_id === work.id).length; return <article key={work.id}><div className="work-code">{work.code}</div><h3>{work.name}</h3><p>{count} موقع مرتبط</p><button>فتح العمل</button></article>; })}{!workTypes.length && <div className="platform-empty">نفّذ ملف قاعدة البيانات لإضافة أنواع الأعمال الأساسية.</div>}</div></section>}

        {tab === 'reports' && <section className="platform-panel"><div className="panel-heading"><div><h2>التقارير</h2><p>سيتم فصل التقارير حسب المشروع ونوع العمل والفترة.</p></div></div><div className="report-options"><button>تقرير اليوم<span>ملخص المهام المنفذة والمتبقية</span></button><button>تقرير الفترة<span>تحديد بداية ونهاية</span></button><button>تقرير موقع<span>كامل تاريخ الموقع</span></button><button>تقرير نوع عمل<span>مقارنة الإنجاز حسب العمل</span></button></div></section>}
      </section>
    </main>
  );
}
