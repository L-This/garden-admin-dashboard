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

type ReportStatus = 'watered' | 'not_watered' | 'insufficient' | 'sidewalk_runoff';

type Report = {
  id: string;
  garden_id: string;
  report_date: string;
  created_at: string | null;
  status?: ReportStatus | null;
  admin_note?: string | null;
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

type EditState = {
  garden: Garden;
  project: Project;
  report?: Report;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value?: string | null) {
  if (!value) return 'بدون وقت';
  return new Date(value).toLocaleString('ar-SA');
}

function getReportStatus(report?: Report): ReportStatus | null {
  if (!report) return null;
  if (report.status) return report.status;
  if (report.sidewalk_runoff) return 'sidewalk_runoff';
  if (report.insufficient_watering) return 'insufficient';
  return 'watered';
}

function statusLabel(status?: ReportStatus | null) {
  if (status === 'not_watered') return 'لم يتم الري';
  if (status === 'insufficient') return 'عدم كفاية ري';
  if (status === 'sidewalk_runoff') return 'خروج الري للرصيف';
  return 'تم الري';
}

export default function AdminHome() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [passwordTarget, setPasswordTarget] = useState<'manager' | 'supervisor'>('supervisor');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  const [projects, setProjects] = useState<Project[]>([]);
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [loading, setLoading] = useState(true);

  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<OpenSection>(null);

  const [editState, setEditState] = useState<EditState | null>(null);
  const [editStatus, setEditStatus] = useState<ReportStatus>('watered');
  const [editNote, setEditNote] = useState('');
  const [editPhotoUrl, setEditPhotoUrl] = useState('');
  const [editUploading, setEditUploading] = useState(false);
  const [editUploadFileName, setEditUploadFileName] = useState('');
  const [editSaving, setEditSaving] = useState(false);

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
      alert('اختر العضوية وأدخل كلمة المرور');
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
    setUsername('');
    setPassword('');
  }

  async function changeAdminPassword() {
    if (!isManager) return;

    if (!newAdminPassword.trim()) {
      alert('اكتب كلمة المرور الجديدة');
      return;
    }

    const { error } = await supabase
      .from('admin_users')
      .update({ password: newAdminPassword.trim() })
      .eq('username', passwordTarget);

    if (error) {
      alert('تعذر تغيير كلمة المرور: ' + error.message);
      return;
    }

    alert('تم تغيير كلمة المرور بنجاح');
    setNewAdminPassword('');
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
        'id, garden_id, report_date, created_at, status, admin_note, insufficient_watering, sidewalk_runoff, insufficient_note, sidewalk_runoff_note, notes'
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
    setReports((reportsData || []) as Report[]);
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

  function openEditRecord(garden: Garden, project: Project, report?: Report) {
    if (!isManager) return;

    const currentStatus = getReportStatus(report) || 'not_watered';
    const currentPhoto = report ? photosByReportId.get(report.id)?.[0]?.file_url || '' : '';

    setEditState({ garden, project, report });
    setEditStatus(currentStatus);
    setEditNote(report?.admin_note || report?.notes || report?.insufficient_note || report?.sidewalk_runoff_note || '');
    setEditPhotoUrl(currentPhoto);
    setEditUploadFileName('');
  }

  function safeFileName(value: string) {
    return value
      .trim()
      .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'garden';
  }

  async function uploadEditPhoto(file: File) {
    if (!editState) return;

    setEditUploading(true);
    setEditUploadFileName(file.name);

    const ext = file.name.split('.').pop() || 'jpg';
    const projectName = safeFileName(editState.project.name);
    const gardenName = safeFileName(editState.garden.name);
    const path = `${selectedDate}/${projectName}/${gardenName}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('garden-photos')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      setEditUploading(false);
      alert('تعذر رفع الصورة: ' + uploadError.message);
      return;
    }

    const { data } = supabase.storage
      .from('garden-photos')
      .getPublicUrl(path);

    setEditPhotoUrl(data.publicUrl);
    setEditUploading(false);
  }

  async function saveEditedRecord() {
    if (!isManager || !editState) return;

    setEditSaving(true);

    const updatePayload = {
      garden_id: editState.garden.id,
      report_date: selectedDate,
      status: editStatus,
      admin_note: editNote.trim() || null,
      notes: editNote.trim() || null,
      insufficient_watering: editStatus === 'insufficient',
      sidewalk_runoff: editStatus === 'sidewalk_runoff',
      reviewed_by: user?.username || 'admin',
      reviewed_at: new Date().toISOString(),
    };

    let reportId = editState.report?.id;

    if (reportId) {
      const { error } = await supabase
        .from('reports')
        .update(updatePayload)
        .eq('id', reportId);

      if (error) {
        setEditSaving(false);
        alert('تعذر حفظ التعديل: ' + error.message);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from('reports')
        .insert(updatePayload)
        .select('id')
        .single();

      if (error || !data) {
        setEditSaving(false);
        alert('تعذر إنشاء السجل: ' + (error?.message || 'خطأ غير معروف'));
        return;
      }

      reportId = data.id;
    }

    if (reportId && editPhotoUrl.trim()) {
      await supabase.from('photos').delete().eq('report_id', reportId);
      const { error } = await supabase
        .from('photos')
        .insert({ report_id: reportId, file_url: editPhotoUrl.trim() });

      if (error) {
        setEditSaving(false);
        alert('تم حفظ السجل، لكن تعذر حفظ رابط الصورة: ' + error.message);
        return;
      }
    }

    setEditSaving(false);
    setEditState(null);
    await loadData();
    alert('تم حفظ التعديل بنجاح');
  }

  async function updateReportStatus(
    reportId: string,
    status: 'watered' | 'not_watered' | 'insufficient' | 'sidewalk'
  ) {
    if (!isManager) return;

    const normalizedStatus: ReportStatus = status === 'sidewalk' ? 'sidewalk_runoff' : status;

    const { error } = await supabase.from('reports').update({
      status: normalizedStatus,
      insufficient_watering: normalizedStatus === 'insufficient',
      sidewalk_runoff: normalizedStatus === 'sidewalk_runoff',
      reviewed_by: user?.username || 'admin',
      reviewed_at: new Date().toISOString(),
    }).eq('id', reportId);

    if (error) {
      alert('تعذر تحديث الحالة: ' + error.message);
      return;
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
    () => new Set(reports.filter((report) => getReportStatus(report) !== 'not_watered').map((report) => report.garden_id)),
    [reports]
  );

  const totals = useMemo(() => {
    const totalGardens = gardens.length;
    const watered = gardens.filter((garden) => wateredGardenIds.has(garden.id)).length;
    const notWatered = totalGardens - watered;
    const insufficient = reports.filter((r) => getReportStatus(r) === 'insufficient').length;
    const sidewalk = reports.filter((r) => getReportStatus(r) === 'sidewalk_runoff').length;

    return { totalGardens, watered, notWatered, insufficient, sidewalk };
  }, [gardens, wateredGardenIds, reports]);

  if (!user) {
    return (
      <main className="login-page" dir="rtl">
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
        >
          <div className="login-logo">♧</div>
          <h1>تسجيل دخول لوحة الإدارة</h1>

          <select
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setPassword('');
            }}
          >
            <option value="">اختر العضوية</option>
            <option value="manager">مدير</option>
            <option value="supervisor">مشرف</option>
          </select>

          {username && (
            <input
              type="password"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          <button type="submit">{loginLoading ? 'جارٍ الدخول...' : 'دخول'}</button>

          <div className="login-help">
            <p>منصة إدارية مخصصة للمستخدمين المعتمدين فقط.</p>
            <p>يُرجى تسجيل الدخول باستخدام بيانات الصلاحية الممنوحة لك.</p>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main dir="rtl" className="admin-page">
      <section className="admin-hero professional">
        <div className="hero-copy">
          <span className="admin-badge">♛ مرحبًا {user.username}</span>
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

          <button onClick={loadData}>↻ تحديث البيانات</button>
          <button onClick={() => window.print()}>▣ طباعة التقرير</button>
          <button onClick={logout}>↩ خروج</button>
        </div>
      </section>

      <section className="admin-overview">
        <div><span>إجمالي الحدائق</span><strong>{totals.totalGardens}</strong><em>◌</em></div>
        <div><span>تم ريها</span><strong>{totals.watered}</strong><em>♢</em></div>
        <div><span>لم يتم ريها</span><strong>{totals.notWatered}</strong><em>⌁</em></div>
        <div><span>عدم كفاية ري</span><strong>{totals.insufficient}</strong><em>−</em></div>
        <div><span>خروج الري للرصيف</span><strong>{totals.sidewalk}</strong><em>↪</em></div>
      </section>

      {isManager && (
        <section className="password-management-card">
          <h2>إدارة كلمات المرور</h2>
          <div className="password-management-form">
            <select
              value={passwordTarget}
              onChange={(e) => setPasswordTarget(e.target.value as 'manager' | 'supervisor')}
            >
              <option value="manager">المدير</option>
              <option value="supervisor">المشرف</option>
            </select>

            <input
              type="password"
              placeholder="كلمة المرور الجديدة"
              value={newAdminPassword}
              onChange={(e) => setNewAdminPassword(e.target.value)}
            />

            <button onClick={changeAdminPassword}>تغيير كلمة المرور</button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="loading">جاري تحميل البيانات...</div>
      ) : (
        <section className="projects-admin-grid">
          {projects.map((project) => {
            const projectGardens = gardens.filter((garden) => garden.project_id === project.id);
            const wateredGardens = projectGardens.filter((garden) => wateredGardenIds.has(garden.id));
            const notWateredGardens = projectGardens.filter((garden) => !wateredGardenIds.has(garden.id));

            const insufficientGardens = wateredGardens.filter((garden) => {
              const report = reportByGardenId.get(garden.id);
              return getReportStatus(report) === 'insufficient';
            });

            const sidewalkGardens = wateredGardens.filter((garden) => {
              const report = reportByGardenId.get(garden.id);
              return getReportStatus(report) === 'sidewalk_runoff';
            });

            const isOpen = openProjectId === project.id;

            return (
              <article key={project.id} className="admin-project-card project-click-card">
                <div className="project-header" onClick={() => openProject(project.id)}>
                  <div className="project-number-badge">{wateredGardens.length}</div>
                  <div>
                    <h2>{project.name}</h2>
                    <p>{project.district || 'بدون نطاق'}</p>
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
                              const currentStatus = getReportStatus(report);

                              return (
                                <div key={garden.id} className="report-card">
                                  {isManager && (
                                    <button
                                      className="card-more-btn"
                                      onClick={() => openEditRecord(garden, project, report)}
                                      title="تعديل السجل"
                                    >
                                      ⋮
                                    </button>
                                  )}

                                  <div className="report-card-head">
                                    <h4>{garden.name}</h4>
                                    <span>{project.name}</span>
                                  </div>

                                  <div className="report-meta">
                                    <p>التاريخ/الوقت: {formatDateTime(report.created_at)}</p>
                                    <p>حالة الري: {statusLabel(currentStatus)}</p>
                                    <p>
                                      الملاحظات:{' '}
                                      {report.admin_note ||
                                        report.notes ||
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
                                      <button onClick={() => updateReportStatus(report.id, 'watered')}>تم الري</button>
                                      <button onClick={() => updateReportStatus(report.id, 'not_watered')}>لم يتم الري</button>
                                      <button onClick={() => updateReportStatus(report.id, 'insufficient')}>عدم كفاية ري</button>
                                      <button onClick={() => updateReportStatus(report.id, 'sidewalk')}>خروج الري للرصيف</button>
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
                          <div className="not-watered-grid">
                            {notWateredGardens.map((garden) => {
                              const report = reportByGardenId.get(garden.id);
                              return (
                                <div className="not-watered-card" key={garden.id}>
                                  <strong>{garden.name}</strong>
                                  <span>{report?.admin_note || report?.notes || 'لا توجد ملاحظات'}</span>
                                  {isManager && (
                                    <button onClick={() => openEditRecord(garden, project, report)}>
                                      تعديل السجل
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="all-done">تم ري جميع حدائق المشروع في هذا اليوم</p>
                        )}
                      </section>
                    )}

                    {openSection === 'insufficient' && (
                      <section className="details-section">
                        <h3>الحدائق عليها عدم كفاية ري</h3>
                        {insufficientGardens.length ? (
                          <ul>{insufficientGardens.map((garden) => <li key={garden.id}>{garden.name}</li>)}</ul>
                        ) : (
                          <p className="empty-list">لا توجد حدائق عليها عدم كفاية ري</p>
                        )}
                      </section>
                    )}

                    {openSection === 'sidewalk' && (
                      <section className="details-section">
                        <h3>الحدائق عليها خروج ري للرصيف</h3>
                        {sidewalkGardens.length ? (
                          <ul>{sidewalkGardens.map((garden) => <li key={garden.id}>{garden.name}</li>)}</ul>
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

      {editState && (
        <div className="edit-modal-backdrop" onClick={() => setEditState(null)}>
          <section className="edit-modal" onClick={(event) => event.stopPropagation()}>
            <div className="edit-modal-head">
              <h2>تعديل سجل الحديقة</h2>
              <button onClick={() => setEditState(null)}>×</button>
            </div>

            <p className="edit-modal-subtitle">
              {editState.project.name} / {editState.garden.name} / {selectedDate}
            </p>

            <label>
              <span>الحالة</span>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as ReportStatus)}>
                <option value="watered">تم الري</option>
                <option value="not_watered">لم يتم الري</option>
                <option value="insufficient">عدم كفاية ري</option>
                <option value="sidewalk_runoff">خروج الري للرصيف</option>
              </select>
            </label>

            <label>
              <span>الملاحظات</span>
              <textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="اكتب الملاحظات الرقابية هنا"
              />
            </label>

            <label>
              <span>رفع صورة من الكاميرا أو المعرض أو الملفات</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={editUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadEditPhoto(file);
                }}
              />
            </label>

            {editUploading && (
              <p className="edit-upload-status">جارٍ رفع الصورة...</p>
            )}

            {editUploadFileName && !editUploading && (
              <p className="edit-upload-status">تم اختيار: {editUploadFileName}</p>
            )}

            {editPhotoUrl && (
              <div className="edit-photo-preview">
                <img src={editPhotoUrl} alt="معاينة الصورة" />
                <button
                  type="button"
                  onClick={() => {
                    setEditPhotoUrl('');
                    setEditUploadFileName('');
                  }}
                >
                  إزالة الصورة
                </button>
              </div>
            )}

            <div className="edit-modal-actions">
              <button onClick={saveEditedRecord} disabled={editSaving || editUploading}>
                {editSaving ? 'جارٍ الحفظ...' : editUploading ? 'انتظر رفع الصورة...' : 'حفظ التعديل'}
              </button>
              <button onClick={() => setEditState(null)}>إلغاء</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
