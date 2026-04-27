'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Project = {
  id: string;
  name: string;
  district: string | null;
};

type Garden = {
  id: string;
  project_id: string;
  name: string;
};

type Report = {
  id: string;
  garden_id: string;
  report_date: string;
  insufficient_watering: boolean | null;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminHome() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [loading, setLoading] = useState(true);
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  async function loadData() {
    setLoading(true);

    const { data: projectsData } = await supabase
      .from('projects')
      .select('id, name, district')
      .order('created_at', { ascending: true });

    const { data: gardensData } = await supabase
      .from('gardens')
      .select('id, project_id, name')
      .eq('active', true)
      .order('created_at', { ascending: true });

    const { data: reportsData } = await supabase
      .from('reports')
      .select('id, garden_id, report_date, insufficient_watering')
      .eq('report_date', selectedDate);

    setProjects(projectsData || []);
    setGardens(gardensData || []);
    setReports(reportsData || []);
    setLoading(false);
  }

  async function deleteReport(reportId: string, gardenName: string) {
    const ok = confirm(`هل تريد حذف تسجيل الري للحديقة: ${gardenName}؟`);
    if (!ok) return;

    await supabase.from('photos').delete().eq('report_id', reportId);
    await supabase.from('reports').delete().eq('id', reportId);

    await loadData();
  }

  async function toggleInsufficient(reportId: string, currentValue: boolean | null) {
    await supabase
      .from('reports')
      .update({
        insufficient_watering: !currentValue,
        reviewed_by: 'admin',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    await loadData();
  }

  const reportByGardenId = useMemo(() => {
    const map = new Map<string, Report>();
    reports.forEach((report) => map.set(report.garden_id, report));
    return map;
  }, [reports]);

  const wateredGardenIds = useMemo(
    () => new Set(reports.map((report) => report.garden_id)),
    [reports]
  );

  const totals = useMemo(() => {
    const totalGardens = gardens.length;
    const watered = gardens.filter((garden) => wateredGardenIds.has(garden.id)).length;
    const notWatered = totalGardens - watered;
    const insufficient = reports.filter((r) => r.insufficient_watering).length;

    return { totalGardens, watered, notWatered, insufficient };
  }, [gardens, wateredGardenIds, reports]);

  return (
    <main dir="rtl" className="admin-page">
      <section className="admin-hero professional">
        <div>
          <span className="admin-badge">لوحة مراقبة يومية</span>
          <h1>لوحة إدارة ري الحدائق</h1>
          <p>استعراض المشاريع والحدائق غير المروية وعدم كفاية الري حسب التاريخ المحدد</p>
        </div>

        <div className="hero-controls">
          <label>
            <span>تحديد التاريخ</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>

          <button onClick={loadData}>تحديث البيانات</button>
        </div>
      </section>

      <section className="admin-overview">
        <div>
          <span>إجمالي الحدائق</span>
          <strong>{totals.totalGardens}</strong>
        </div>
        <div>
          <span>تم ريها</span>
          <strong>{totals.watered}</strong>
        </div>
        <div>
          <span>لم يتم ريها</span>
          <strong>{totals.notWatered}</strong>
        </div>
        <div>
          <span>عدم كفاية ري</span>
          <strong>{totals.insufficient}</strong>
        </div>
      </section>

      {loading ? (
        <div className="loading">جاري تحميل البيانات...</div>
      ) : (
        <section className="projects-admin-grid">
          {projects.map((project) => {
            const projectGardens = gardens.filter(
              (garden) => garden.project_id === project.id
            );

            const wateredGardens = projectGardens.filter((garden) =>
              wateredGardenIds.has(garden.id)
            );

            const notWateredGardens = projectGardens.filter(
              (garden) => !wateredGardenIds.has(garden.id)
            );

            const insufficientGardens = wateredGardens.filter((garden) => {
              const report = reportByGardenId.get(garden.id);
              return report?.insufficient_watering;
            });

            const isOpen = openProjectId === project.id;

            return (
              <article key={project.id} className="admin-project-card">
                <div className="project-header">
                  <div>
                    <h2>{project.name}</h2>
                    <p>{project.district || 'بدون نطاق'}</p>
                  </div>

                  <div className="completion-badge warning-badge">
                    {insufficientGardens.length}
                  </div>
                </div>

                <div className="project-stats">
                  <div>
                    <span>إجمالي الحدائق</span>
                    <strong>{projectGardens.length}</strong>
                  </div>
                  <div>
                    <span>تم ريها</span>
                    <strong>{wateredGardens.length}</strong>
                  </div>
                  <div>
                    <span>لم يتم ريها</span>
                    <strong>{notWateredGardens.length}</strong>
                  </div>
                  <div>
                    <span>عدم كفاية ري</span>
                    <strong>{insufficientGardens.length}</strong>
                  </div>
                </div>

                <div className="not-watered-card">
                  <h3>الحدائق التي لم يتم ريها</h3>

                  {notWateredGardens.length ? (
                    <ul>
                      {notWateredGardens.map((garden) => (
                        <li key={garden.id}>{garden.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="all-done">تم ري جميع حدائق المشروع في هذا اليوم</p>
                  )}
                </div>

                <div className="not-watered-card insufficient-box">
                  <h3>الحدائق عليها عدم كفاية ري</h3>

                  {insufficientGardens.length ? (
                    <ul>
                      {insufficientGardens.map((garden) => (
                        <li key={garden.id}>{garden.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-list">لا توجد حدائق عليها عدم كفاية ري</p>
                  )}
                </div>

                <button
                  className="show-records-btn"
                  onClick={() => setOpenProjectId(isOpen ? null : project.id)}
                >
                  {isOpen ? 'إخفاء تسجيلات اليوم' : 'عرض تسجيلات اليوم'}
                </button>

                {isOpen && (
                  <div className="daily-records-box">
                    <h3>تسجيلات اليوم</h3>

                    {wateredGardens.length ? (
                      <ul>
                        {wateredGardens.map((garden) => {
                          const report = reportByGardenId.get(garden.id);
                          if (!report) return null;

                          return (
                            <li key={garden.id} className="admin-garden-row">
                              <span>{garden.name}</span>

                              <div className="row-actions">
                                <button
                                  className={
                                    report.insufficient_watering
                                      ? 'flag-btn active'
                                      : 'flag-btn'
                                  }
                                  onClick={() =>
                                    toggleInsufficient(
                                      report.id,
                                      report.insufficient_watering
                                    )
                                  }
                                >
                                  {report.insufficient_watering
                                    ? 'إزالة عدم الكفاية'
                                    : 'عدم كفاية ري'}
                                </button>

                                <button
                                  className="delete-report-btn"
                                  onClick={() => deleteReport(report.id, garden.name)}
                                >
                                  حذف التسجيل
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="empty-list">لا توجد تسجيلات ري لهذا المشروع في هذا اليوم</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}