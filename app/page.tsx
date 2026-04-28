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
  notes?: string | null;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminPage() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('adminUser');
    if (saved) {
      const parsed = JSON.parse(saved);
      setUser(parsed);
    }
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
      .select('id,name,district')
      .order('created_at', { ascending: true });

    const { data: gardensData } = await supabase
      .from('gardens')
      .select('id,project_id,name')
      .eq('active', true);

    const { data: reportsData } = await supabase
      .from('reports')
      .select(
        'id,garden_id,report_date,created_at,insufficient_watering,sidewalk_runoff,notes'
      )
      .eq('report_date', selectedDate);

    setProjects(projectsData || []);
    setGardens(gardensData || []);
    setReports(reportsData || []);
    setLoading(false);
  }

  async function deleteReport(id: string) {
    if (user?.role !== 'مدير') return;

    const ok = confirm('حذف التسجيل؟');
    if (!ok) return;

    await supabase.from('photos').delete().eq('report_id', id);
    await supabase.from('reports').delete().eq('id', id);
    loadData();
  }

  async function setStatus(
    reportId: string,
    type: 'watered' | 'insufficient' | 'sidewalk'
  ) {
    if (user?.role !== 'مدير') return;

    const payload =
      type === 'watered'
        ? { insufficient_watering: false, sidewalk_runoff: false }
        : type === 'insufficient'
        ? { insufficient_watering: true, sidewalk_runoff: false }
        : { insufficient_watering: false, sidewalk_runoff: true };

    await supabase.from('reports').update(payload).eq('id', reportId);
    loadData();
  }

  const reportByGarden = useMemo(() => {
    const map = new Map<string, Report>();
    reports.forEach((r) => map.set(r.garden_id, r));
    return map;
  }, [reports]);

  const wateredIds = new Set(reports.map((r) => r.garden_id));

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

          <button onClick={login}>
            {loginLoading ? 'جارٍ الدخول...' : 'دخول'}
          </button>

          <div className="login-help">
            <p>مدير: manager / 123456</p>
            <p>مشرف: supervisor / 123456</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-page" dir="rtl">
      <section className="admin-hero professional">
        <div>
          <span className="admin-badge">مرحبًا {user.username}</span>
          <h1>لوحة إدارة ري الحدائق</h1>
          <p>الصلاحية الحالية: {user.role}</p>
        </div>

        <div className="hero-controls">
          <label>
            <span>التاريخ</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </label>

          <button onClick={loadData}>تحديث</button>
          <button onClick={() => window.print()}>طباعة التقرير</button>
          <button onClick={logout}>خروج</button>
        </div>
      </section>

      {loading ? (
        <div className="loading">جاري التحميل...</div>
      ) : (
        <section className="projects-admin-grid">
          {projects.map((project) => {
            const projectGardens = gardens.filter(
              (g) => g.project_id === project.id
            );

            const watered = projectGardens.filter((g) =>
              wateredIds.has(g.id)
            );

            const notWatered = projectGardens.filter(
              (g) => !wateredIds.has(g.id)
            );

            return (
              <article key={project.id} className="admin-project-card">
                <div className="project-header">
                  <div>
                    <h2>{project.name}</h2>
                    <p>{project.district || 'بدون نطاق'}</p>
                  </div>

                  <div className="completion-badge success-badge">
                    {watered.length}
                  </div>
                </div>

                <div className="project-stats">
                  <div>
                    <span>تم الري</span>
                    <strong>{watered.length}</strong>
                  </div>

                  <div>
                    <span>لم يتم</span>
                    <strong>{notWatered.length}</strong>
                  </div>
                </div>

                <div className="details-section">
                  <h3>تفاصيل اليوم</h3>

                  {watered.map((garden) => {
                    const report = reportByGarden.get(garden.id);
                    if (!report) return null;

                    return (
                      <div
                        key={garden.id}
                        className="admin-garden-row"
                      >
                        <span>{garden.name}</span>

                        <div className="row-actions">
                          <span className="status-chip">
                            {report.sidewalk_runoff
                              ? 'خروج للرصيف'
                              : report.insufficient_watering
                              ? 'عدم كفاية'
                              : 'تم الري'}
                          </span>

                          {user.role === 'مدير' && (
                            <>
                              <button
                                className="flag-btn"
                                onClick={() =>
                                  setStatus(report.id, 'watered')
                                }
                              >
                                تم الري
                              </button>

                              <button
                                className="flag-btn"
                                onClick={() =>
                                  setStatus(
                                    report.id,
                                    'insufficient'
                                  )
                                }
                              >
                                عدم كفاية
                              </button>

                              <button
                                className="flag-btn"
                                onClick={() =>
                                  setStatus(report.id, 'sidewalk')
                                }
                              >
                                للرصيف
                              </button>

                              <button
                                className="delete-report-btn"
                                onClick={() =>
                                  deleteReport(report.id)
                                }
                              >
                                حذف
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
