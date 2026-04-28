'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type UserRole = 'مشرف' | 'مدير';

type AdminUser = {
  id: string;
  username: string;
  password: string;
  role: UserRole;
  active: boolean;
};

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
  created_at: string | null;
  insufficient_watering: boolean | null;
  sidewalk_runoff: boolean | null;
  insufficient_note?: string | null;
  sidewalk_runoff_note?: string | null;
  notes?: string | null;
};

type Photo = {
  id: string;
  report_id: string;
  file_url: string;
};

type OpenSection = 'watered' | 'not_watered' | 'insufficient' | 'sidewalk' | null;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value?: string | null) {
  if (!value) return 'بدون وقت';
  return new Date(value).toLocaleString('ar-SA');
}

export default function AdminHome() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [loading, setLoading] = useState(true);

  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<OpenSection>(null);

  const isManager = user?.role === 'مدير';

  useEffect(() => {
    const saved = localStorage.getItem('adminUser');
    if (saved) setUser(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (user) loadData();
  }, [user, selectedDate]);

  async function login() {
    if (!username || !password) {
      alert('أدخل اسم المستخدم وكلمة المرور');
      return;
    }

    setLoginLoading(true);

    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .eq('active', true)
      .single();

    setLoginLoading(false);

    if (error || !data) {
      alert('بيانات الدخول غير صحيحة');
      return;
    }

    setUser(data);
    localStorage.setItem('adminUser', JSON.stringify(data));
  }

  function logout() {
    localStorage.removeItem('adminUser');
    setUser(null);
  }

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
      .select(
        'id, garden_id, report_date, created_at, insufficient_watering, sidewalk_runoff, insufficient_note, sidewalk_runoff_note, notes'
      )
      .eq('report_date', selectedDate);

    const reportIds = (reportsData || []).map((r) => r.id);

    let photosData: Photo[] = [];
    if (reportIds.length) {
      const { data } = await supabase
        .from('photos')
        .select('id, report_id, file_url')
        .in('report_id', reportIds);

      photosData = data || [];
    }

    setProjects(projectsData || []);
    setGardens(gardensData || []);
    setReports(reportsData || []);
    setPhotos(photosData);
    setLoading(false);
  }

  function openProject(projectId: string) {
    if (openProjectId === projectId) {
      setOpenProjectId(null);
      setOpenSection(null);
    } else {
      setOpenProjectId(projectId);
      setOpenSection(null);
    }
  }

  function toggleSection(section: OpenSection) {
    setOpenSection(openSection === section ? null : section);
  }

  async function updateReportStatus(
    reportId: string,
    status: 'watered' | 'not_watered' | 'insufficient' | 'sidewalk'
  ) {
    if (!isManager) return;

    if (status === 'watered') {
      await supabase
        .from('reports')
        .update({
          insufficient_watering: false,
          sidewalk_runoff: false,
          reviewed_by: 'admin',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', reportId);
    }

    if (status === 'insufficient') {
      await supabase
        .from('reports')
        .update({
          insufficient_watering: true,
          sidewalk_runoff: false,
          reviewed_by: 'admin',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', reportId);
    }

    if (status === 'sidewalk') {
      await supabase
        .from('reports')
        .update({
          sidewalk_runoff: true,
          insufficient_watering: false,
          reviewed_by: 'admin',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', reportId);
    }

    if (status === 'not_watered') {
      const ok = confirm('نقل الحديقة إلى لم يتم الري يعني حذف تسجيل الري لهذا اليوم. هل أنت متأكد؟');
      if (!ok) return;

      await supabase.from('photos').delete().eq('report_id', reportId);
      await supabase.from('reports').delete().eq('id', reportId);
    }

    await loadData();
  }

  const reportByGardenId = useMemo(() => {
    const map = new Map<string, Report>();
    reports.forEach((report) => map.set(report.garden_id, report));
    return map;
  }, [reports]);

  const photosByReportId = useMemo(() => {
    const map = new Map<string, Photo[]>();
    photos.forEach((photo) => {
      const existing = map.get(photo.report_id) || [];
      existing.push(photo);
      map.set(photo.report_id, existing);
    });
    return map;
  }, [photos]);

  const wateredGardenIds = useMemo(
    () => new Set(reports.map((report) => report.garden_id)),
    [reports]
  );

  const totals = useMemo(() => {
    const totalGardens = gardens.length;
    const watered = gardens.filter((garden) => wateredGardenIds.has(garden.id)).length;
    const notWatered = totalGardens - watered;
    const insufficient = reports.filter((r) => r.insufficient_watering).length;
    const sidewalk = reports.filter((r) => r.sidewalk_runoff).length;

    return { totalGardens, watered, notWatered, insufficient, sidewalk };
  }, [gardens, wateredGardenIds, reports]);

  if (!user) {
    return (
      <main className="login-page" dir="rtl">
        <div className="login-card">
          <h1>تسجيل دخول لوحة الإدارة</h1>

          <input
            placeholder="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <input
            type="password"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button onClick={login}>{loginLoading ? 'جارٍ الدخول...' : 'دخول'}</button>

          <div className="login-help">
            <p>مدير: manager / 123456</p>
            <p>مشرف: supervisor / 123456</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main dir="rtl" className="admin-page">
      <section className="admin-hero professional">
        <div>
          <span className="admin-badge">مرحبًا {user.username}</span>
          <h1>لوحة إدارة ري الحدائق</h1>
          <p>الصلاحية الحالية: {user.role}</p>
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
          <button onClick={() => window.print()}>طباعة التقرير</button>
          <button onClick={logout}>خروج</button>
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
        <div>
          <span>خروج الري للرصيف</span>
          <strong>{totals.sidewalk}</strong>
        </div>
      </section>

      {loading ? (
        <div className="loading">جاري تحميل البيانات...</div>
      ) : (
        <section className="projects-admin-grid">
          {projects.map((project) => {
            const projectGardens = gardens.filter((garden) => garden.project_id === project.id);

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

            const sidewalkGardens = wateredGardens.filter((garden) => {
              const report = reportByGardenId.get(garden.id);
              return report?.sidewalk_runoff;
            });

            const isOpen = openProjectId === project.id;

            return (
              <article key={project.id} className="admin-project-card project-click-card">
                <div className="project-header" onClick={() => openProject(project.id)}>
                  <div>
                    <h2>{project.name}</h2>
                    <p>{project.district || 'بدون نطاق'}</p>
                  </div>

                  <div className="completion-badge success-badge">
                    {wateredGardens.length}
                  </div>
                </div>

                {isOpen && (
                  <>
                    <div className="project-stats">
                      <button className="stat-button" onClick={() => toggleSection('watered')}>
                        <span>تم ريها</span>
                        <strong>{wateredGardens.length}</strong>
                      </button>

                      <button className="stat-button" onClick={() => toggleSection('not_watered')}>
                        <span>لم يتم ريها</span>
                        <strong>{notWateredGardens.length}</strong>
                      </button>

                      <button className="stat-button" onClick={() => toggleSection('insufficient')}>
                        <span>عدم كفاية ري</span>
                        <strong>{insufficientGardens.length}</strong>
                      </button>

                      <button className="stat-button" onClick={() => toggleSection('sidewalk')}>
                        <span>خروج الري للرصيف</span>
                        <strong>{sidewalkGardens.length}</strong>
                      </button>
                    </div>

                    {openSection === 'watered' && (
                      <section className="details-section">
                        <h3>تفاصيل الحدائق التي تم ريها</h3>

                        {wateredGardens.length ? (
                          <div className="report-cards-grid">
                            {wateredGardens.map((garden) => {
                              const report = reportByGardenId.get(garden.id);
                              if (!report) return null;

                              const reportPhotos = photosByReportId.get(report.id) || [];
                              const firstPhoto = reportPhotos[0];

                              return (
                                <div key={garden.id} className="report-card">
                                  <div className="report-card-head">
                                    <h4>{garden.name}</h4>
                                    <span>{project.name}</span>
                                  </div>
                                {isManager && (
  <button
    className="card-more-btn"
    onClick={() => {
      const ok = confirm(
        `هل تريد حذف سجل ${garden.name}؟\nسيتم حذف الصورة والبيانات لهذا اليوم.`
      );

      if (ok) updateReportStatus(report.id, 'not_watered');
    }}
    title="حذف السجل"
  >
    ⋮
  </button>
)}
                                  <div className="report-meta">
                                    <p>التاريخ/الوقت: {formatDateTime(report.created_at)}</p>
                                    <p>
                                      حالة الري:{' '}
                                      {report.sidewalk_runoff
                                        ? 'خروج الري للرصيف'
                                        : report.insufficient_watering
                                        ? 'عدم كفاية ري'
                                        : 'تم الري'}
                                    </p>
                                    <p>
                                      الملاحظات:{' '}
                                      {report.notes ||
                                        report.insufficient_note ||
                                        report.sidewalk_runoff_note ||
                                        'لا توجد'}
                                    </p>
                                  </div>

                                  <div className="report-image-box">
                                    {firstPhoto?.file_url ? (
                                      <img src={firstPhoto.file_url} alt={garden.name} />
                                    ) : (
                                      <div className="no-image">لا توجد صورة</div>
                                    )}
                                  </div>

                                  {isManager && (
                                    <div className="report-actions-4">
                                      <button onClick={() => updateReportStatus(report.id, 'watered')}>
                                        تم الري
                                      </button>
                                      <button onClick={() => updateReportStatus(report.id, 'not_watered')}>
                                        لم يتم الري
                                      </button>
                                      <button onClick={() => updateReportStatus(report.id, 'insufficient')}>
                                        عدم كفاية ري
                                      </button>
                                      <button onClick={() => updateReportStatus(report.id, 'sidewalk')}>
                                        خروج الري للرصيف
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="empty-list">لا توجد تسجيلات ري لهذا اليوم</p>
                        )}
                      </section>
                    )}

                    {openSection === 'not_watered' && (
                      <section className="details-section">
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
                      </section>
                    )}

                    {openSection === 'insufficient' && (
                      <section className="details-section insufficient-box">
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
                      </section>
                    )}

                    {openSection === 'sidewalk' && (
                      <section className="details-section sidewalk-box">
                        <h3>الحدائق عليها خروج ري للرصيف</h3>
                        {sidewalkGardens.length ? (
                          <ul>
                            {sidewalkGardens.map((garden) => (
                              <li key={garden.id}>{garden.name}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="empty-list">لا توجد حدائق عليها خروج ري للرصيف</p>
                        )}
                      </section>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
