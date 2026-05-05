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
  slug: string;
  name: string;
  district: string | null;
  manager_name?: string | null;
  contractor_code?: string | null;
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
  ai_review_status?: 'pending' | 'passed' | 'needs_review' | 'rejected' | string | null;
  ai_review_score?: number | null;
  ai_review_reason?: string | null;
  ai_flags?: unknown;
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

type ContractorDraft = {
  manager_name: string;
  contractor_code: string;
};

type ReportSummaryRow = {
  gardenId: string;
  gardenName: string;
  watered: number;
  notWatered: number;
  insufficient: number;
  sidewalk: number;
};

type FineRow = {
  gardenName: string;
  violationType: string;
  count: number;
  fineAmount: number;
  total: number;
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

function daysBetweenInclusive(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('ar-SA').format(value);
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
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showContractorLinksModal, setShowContractorLinksModal] = useState(false);
  const [contractorDrafts, setContractorDrafts] = useState<Record<string, ContractorDraft>>({});
  const [savingContractorProjectId, setSavingContractorProjectId] = useState<string | null>(null);
  const [editPhotoUrls, setEditPhotoUrls] = useState<string[]>([]);
  const [editNewPhotoUrls, setEditNewPhotoUrls] = useState<string[]>([]);
  const [editUploading, setEditUploading] = useState(false);
  const [editUploadFileName, setEditUploadFileName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportFromDate, setReportFromDate] = useState(today());
  const [reportToDate, setReportToDate] = useState(today());
  const [reportProjectId, setReportProjectId] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportRows, setReportRows] = useState<ReportSummaryRow[]>([]);
  const [fineRows, setFineRows] = useState<FineRow[]>([]);
  const [reportTitle, setReportTitle] = useState('');

  const isManager = user?.role === 'مدير';

  useEffect(() => {
    const saved = localStorage.getItem('adminUser');
    if (saved) setUser(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (user) loadData();
  }, [user, selectedDate]);

  useEffect(() => {
    setContractorDrafts((current) => {
      const next = { ...current };
      projects.forEach((project) => {
        if (!next[project.id]) {
          next[project.id] = {
            manager_name: project.manager_name || '',
            contractor_code: project.contractor_code || '',
          };
        }
      });
      return next;
    });
  }, [projects]);

  useEffect(() => {
    if (!reportProjectId && projects.length) {
      setReportProjectId(projects[0].id);
    }
  }, [projects, reportProjectId]);

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


  function getContractorLink(project: Project) {
    if (typeof window === 'undefined') return `/project/${project.slug}`;
    return `${window.location.origin}/project/${project.slug}`;
  }

  function updateContractorDraft(projectId: string, patch: Partial<ContractorDraft>) {
    setContractorDrafts((current) => ({
      ...current,
      [projectId]: {
        manager_name: current[projectId]?.manager_name || '',
        contractor_code: current[projectId]?.contractor_code || '',
        ...patch,
      },
    }));
  }

  async function saveContractorProject(project: Project) {
    if (!isManager) return;

    const draft = contractorDrafts[project.id];
    if (!draft) return;

    if (!draft.manager_name.trim()) {
      alert('اكتب اسم المسؤول لهذا المشروع');
      return;
    }

    if (!draft.contractor_code.trim()) {
      alert('اكتب رمز دخول المقاول لهذا المشروع');
      return;
    }

    setSavingContractorProjectId(project.id);

    const { error } = await supabase
      .from('projects')
      .update({
        manager_name: draft.manager_name.trim(),
        contractor_code: draft.contractor_code.trim(),
      })
      .eq('id', project.id);

    setSavingContractorProjectId(null);

    if (error) {
      alert('تعذر حفظ بيانات الرابط: ' + error.message);
      return;
    }

    setProjects((current) =>
      current.map((item) =>
        item.id === project.id
          ? { ...item, manager_name: draft.manager_name.trim(), contractor_code: draft.contractor_code.trim() }
          : item
      )
    );

    alert('تم حفظ بيانات رابط المقاول');
  }

  async function copyContractorLink(project: Project) {
    const link = getContractorLink(project);
    try {
      await navigator.clipboard.writeText(link);
      alert('تم نسخ رابط المشروع');
    } catch {
      alert(link);
    }
  }


  async function generatePeriodReport() {
    setReportError('');
    setReportRows([]);
    setFineRows([]);

    if (!reportFromDate || !reportToDate || !reportProjectId) {
      setReportError('اختر الفترة والمشروع أولًا.');
      return;
    }

    const numberOfDays = daysBetweenInclusive(reportFromDate, reportToDate);
    if (!numberOfDays) {
      setReportError('تأكد أن تاريخ النهاية بعد تاريخ البداية.');
      return;
    }

    const selectedProject = projects.find((project) => project.id === reportProjectId);
    const projectGardens = gardens.filter((garden) => garden.project_id === reportProjectId);

    if (!selectedProject || !projectGardens.length) {
      setReportError('لا توجد حدائق لهذا المشروع.');
      return;
    }

    setReportLoading(true);

    const gardenIds = projectGardens.map((garden) => garden.id);

    const { data, error } = await supabase
      .from('reports')
      .select('id, garden_id, report_date, status, insufficient_watering, sidewalk_runoff')
      .gte('report_date', reportFromDate)
      .lte('report_date', reportToDate)
      .in('garden_id', gardenIds);

    setReportLoading(false);

    if (error) {
      setReportError('تعذر إنشاء التقرير: ' + error.message);
      return;
    }

    const reportsInPeriod = (data || []) as Pick<Report, 'id' | 'garden_id' | 'report_date' | 'status' | 'insufficient_watering' | 'sidewalk_runoff'>[];

    const rows: ReportSummaryRow[] = projectGardens.map((garden) => {
      const gardenReports = reportsInPeriod.filter((report) => report.garden_id === garden.id);
      const reportedDates = new Set(gardenReports.map((report) => report.report_date));

      let watered = 0;
      let notWateredExplicit = 0;
      let insufficient = 0;
      let sidewalk = 0;

      gardenReports.forEach((report) => {
        const status = getReportStatus(report as Report);
        if (status === 'not_watered') notWateredExplicit += 1;
        else if (status === 'insufficient') insufficient += 1;
        else if (status === 'sidewalk_runoff') sidewalk += 1;
        else watered += 1;
      });

      const missingDays = Math.max(0, numberOfDays - reportedDates.size);

      return {
        gardenId: garden.id,
        gardenName: garden.name,
        watered,
        notWatered: notWateredExplicit + missingDays,
        insufficient,
        sidewalk,
      };
    });

    const fines: FineRow[] = [];
    rows.forEach((row) => {
      if (row.notWatered > 0) {
        fines.push({ gardenName: row.gardenName, violationType: 'لم يتم الري', count: row.notWatered, fineAmount: 1000, total: row.notWatered * 1000 });
      }
      if (row.insufficient > 0) {
        fines.push({ gardenName: row.gardenName, violationType: 'عدم كفاية ري', count: row.insufficient, fineAmount: 500, total: row.insufficient * 500 });
      }
      if (row.sidewalk > 0) {
        fines.push({ gardenName: row.gardenName, violationType: 'خروج الري للرصيف', count: row.sidewalk, fineAmount: 300, total: row.sidewalk * 300 });
      }
    });

    setReportRows(rows);
    setFineRows(fines);
    setReportTitle(`${selectedProject.name} من ${reportFromDate} إلى ${reportToDate}`);
  }

  function printReportOnly() {
  const report = document.getElementById('report-print');

  if (!report) {
    alert('أنشئ التقرير أولًا');
    return;
  }

  const printWindow = window.open('', '_blank', 'width=1200,height=800');

  if (!printWindow) {
    alert('المتصفح منع فتح نافذة الطباعة');
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>تقرير ري الحدائق</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          body {
            margin: 0;
            padding: 0;
            direction: rtl;
            font-family: Arial, sans-serif;
            color: #062b24;
            background: white;
          }

          .period-report-print-area {
            width: 100%;
            padding: 10px;
            box-sizing: border-box;
          }

          .period-report-head,
          .fines-report-box h3 {
            text-align: center;
            margin-bottom: 14px;
          }

          .period-report-head h3 {
            font-size: 24px;
            margin: 0 0 6px;
          }

          .period-report-head p {
            font-size: 14px;
            margin: 0;
            font-weight: 700;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin: 12px 0 24px;
            font-size: 11px;
          }

          th,
          td {
            border: 1px solid #d8c58b;
            padding: 7px 5px;
            text-align: center;
            vertical-align: middle;
            word-break: break-word;
            line-height: 1.5;
          }

          th {
            background: #f8f1dc;
            font-weight: 900;
          }

          .fines-report-box {
            page-break-before: always;
            break-before: page;
          }

          .total-fines-card {
            margin-top: 16px;
            padding: 14px;
            border: 2px solid #d8c58b;
            text-align: center;
            font-weight: 900;
            font-size: 18px;
          }

          .total-fines-card strong {
            color: #b91c1c;
            display: block;
            margin-top: 8px;
            font-size: 24px;
          }

          .edit-modal-actions,
          button {
            display: none !important;
          }
        </style>
      </head>
      <body>
        ${report.outerHTML}
        <script>
          window.onload = function () {
            window.print();
          };
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
}

  async function loadData() {
    setLoading(true);

    const { data: projectsData } = await supabase
      .from('projects')
      .select('id, slug, name, district, manager_name, contractor_code')
      .order('created_at', { ascending: true });

    const { data: gardensData } = await supabase
      .from('gardens')
      .select('id, project_id, name')
      .eq('active', true)
      .order('created_at', { ascending: true });

    const { data: reportsData } = await supabase
      .from('reports')
      .select(
        'id, garden_id, report_date, created_at, status, admin_note, insufficient_watering, sidewalk_runoff, insufficient_note, sidewalk_runoff_note, notes, ai_review_status, ai_review_score, ai_review_reason, ai_flags'
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
    const currentPhotos = report ? (photosByReportId.get(report.id) || []).map((photo) => photo.file_url) : [];

    setEditState({ garden, project, report });
    setEditStatus(currentStatus);
    setEditNote(report?.admin_note || report?.notes || report?.insufficient_note || report?.sidewalk_runoff_note || '');
    setEditPhotoUrls(currentPhotos);
    setEditNewPhotoUrls([]);
    setEditUploadFileName('');
  }

  function safeFileName(value: string) {
    return value
      .trim()
      .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'garden';
  }

  async function uploadEditPhotos(files: FileList | File[]) {
    if (!editState) return;

    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;

    setEditUploading(true);
    setEditUploadFileName(selectedFiles.map((file) => file.name).join('، '));

    const uploadedUrls: string[] = [];

    for (const file of selectedFiles) {
      const ext = file.name.split('.').pop() || 'jpg';
      const projectName = safeFileName(editState.project.name);
      const gardenName = safeFileName(editState.garden.name);
      const path = `${selectedDate}/${projectName}/${gardenName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

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

      uploadedUrls.push(data.publicUrl);
    }

    setEditPhotoUrls((prev) => [...prev, ...uploadedUrls]);
    setEditNewPhotoUrls((prev) => [...prev, ...uploadedUrls]);
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

    if (reportId && editNewPhotoUrls.length) {
      const { error } = await supabase
        .from('photos')
        .insert(editNewPhotoUrls.map((url) => ({ report_id: reportId, file_url: url })));

      if (error) {
        setEditSaving(false);
        alert('تم حفظ السجل، لكن تعذر حفظ الصور: ' + error.message);
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


  async function approveAiReview(reportId: string) {
    if (!isManager) return;

    const { error } = await supabase
      .from('reports')
      .update({
        ai_review_status: 'passed',
        ai_review_reason: 'تم اعتماد الصورة يدويًا من لوحة الإدارة',
        reviewed_by: user?.username || 'admin',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    if (error) {
      alert('تعذر اعتماد التنبيه: ' + error.message);
      return;
    }

    await loadData();
  }

  async function escalateAiReview(report: Report) {
    if (!isManager) return;

    const ok = confirm('سيتم اعتبار هذا السجل مخالفة وتحويل الحالة إلى لم يتم الري. هل أنت متأكد؟');
    if (!ok) return;

    const reason = report.ai_review_reason || 'اشتباه تحقق ذكي في الصورة';

    const { error } = await supabase
      .from('reports')
      .update({
        ai_review_status: 'rejected',
        status: 'not_watered',
        insufficient_watering: false,
        sidewalk_runoff: false,
        admin_note: `مخالفة تحقق ذكي: ${reason}`,
        notes: `مخالفة تحقق ذكي: ${reason}`,
        reviewed_by: user?.username || 'admin',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    if (error) {
      alert('تعذر تصعيد المخالفة: ' + error.message);
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


  const aiAlertReports = useMemo(() => {
    return reports.filter((report) =>
      report.ai_review_status === 'needs_review' || report.ai_review_status === 'rejected'
    );
  }, [reports]);

  function getGardenById(gardenId: string) {
    return gardens.find((garden) => garden.id === gardenId);
  }

  function getProjectById(projectId: string) {
    return projects.find((project) => project.id === projectId);
  }

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
          <button onClick={() => setShowReportModal(true)}>📊 إعداد تقرير</button>
          {isManager && (
            <button onClick={() => setShowPasswordModal(true)}>⚿ إدارة كلمة المرور</button>
          )}
          {isManager && (
            <button onClick={() => setShowContractorLinksModal(true)}>🔗 روابط المقاولين</button>
          )}
          <button onClick={logout}>↩ خروج</button>
        </div>
      </section>

      <section className="admin-overview">
        <div><span>إجمالي الحدائق</span><strong>{totals.totalGardens}</strong><em>◌</em></div>
        <div><span>تم ريها</span><strong>{totals.watered}</strong><em>♢</em></div>
        <div><span>لم يتم ريها</span><strong>{totals.notWatered}</strong><em>⌁</em></div>
        <div><span>عدم كفاية ري</span><strong>{totals.insufficient}</strong><em>−</em></div>
        <div><span>خروج الري للرصيف</span><strong>{totals.sidewalk}</strong><em>↪</em></div>
        <div className="ai-overview-card"><span>تنبيهات التحقق الذكي</span><strong>{aiAlertReports.length}</strong><em>⚠</em></div>
      </section>




      {aiAlertReports.length > 0 && (
        <section className="ai-alerts-panel">
          <div className="ai-alerts-head">
            <div>
              <span>مركز التحقق الذكي</span>
              <h2>تنبيهات الصور المشكوك فيها</h2>
              <p>يعرض السجلات التي تحتاج مراجعة أو تم رفضها آليًا حسب نتيجة التحقق الذكي.</p>
            </div>
            <strong>{aiAlertReports.length}</strong>
          </div>

          <div className="ai-alerts-grid">
            {aiAlertReports.map((report) => {
              const garden = getGardenById(report.garden_id);
              const project = garden ? getProjectById(garden.project_id) : undefined;
              const reportPhotos = photosByReportId.get(report.id) || [];
              const firstPhoto = reportPhotos[0];
              const score = typeof report.ai_review_score === 'number'
                ? `${Math.round(report.ai_review_score * 100)}%`
                : 'غير محدد';

              return (
                <article key={report.id} className={`ai-alert-card ${report.ai_review_status === 'rejected' ? 'rejected' : 'review'}`}>
                  <div className="ai-alert-image">
                    {firstPhoto?.file_url ? (
                      <button type="button" onClick={() => setPreviewImageUrl(firstPhoto.file_url)}>
                        <img src={firstPhoto.file_url} alt={garden?.name || 'صورة التحقق'} />
                        <span>معاينة</span>
                      </button>
                    ) : (
                      <div>لا توجد صورة</div>
                    )}
                  </div>

                  <div className="ai-alert-content">
                    <div className="ai-alert-title-row">
                      <h3>{garden?.name || 'حديقة غير معروفة'}</h3>
                      <span>{report.ai_review_status === 'rejected' ? 'مرفوض' : 'يحتاج مراجعة'}</span>
                    </div>
                    <p>{project?.name || 'مشروع غير معروف'}</p>
                    <ul>
                      <li>درجة الثقة: <strong>{score}</strong></li>
                      <li>الوقت: <strong>{formatDateTime(report.created_at)}</strong></li>
                      <li>السبب: <strong>{report.ai_review_reason || 'لم يتم تسجيل سبب تفصيلي'}</strong></li>
                    </ul>

                    {isManager && (
                      <div className="ai-alert-actions">
                        <button onClick={() => approveAiReview(report.id)}>اعتماد الصورة</button>
                        <button onClick={() => escalateAiReview(report)}>تسجيل مخالفة</button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
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

                <div className="project-daily-meter" aria-label="مؤشر حالة الري اليومي">
                  <div className="meter-track">
                    <span
                      className="meter-segment meter-watered"
                      style={{ width: `${projectGardens.length ? (wateredGardens.length / projectGardens.length) * 100 : 0}%` }}
                    />
                    <span
                      className="meter-segment meter-not-watered"
                      style={{ width: `${projectGardens.length ? (notWateredGardens.length / projectGardens.length) * 100 : 0}%` }}
                    />
                    <span
                      className="meter-segment meter-insufficient"
                      style={{ width: `${projectGardens.length ? (insufficientGardens.length / projectGardens.length) * 100 : 0}%` }}
                    />
                    <span
                      className="meter-segment meter-sidewalk"
                      style={{ width: `${projectGardens.length ? (sidewalkGardens.length / projectGardens.length) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="meter-legend">
                    <span><i className="legend-watered" />تم الري {wateredGardens.length}</span>
                    <span><i className="legend-not-watered" />لم يتم {notWateredGardens.length}</span>
                    <span><i className="legend-insufficient" />عدم كفاية {insufficientGardens.length}</span>
                    <span><i className="legend-sidewalk" />خروج للرصيف {sidewalkGardens.length}</span>
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

                                  <div className="report-photo-strip">
                                    {reportPhotos.length ? (
                                      reportPhotos.map((photo, index) => (
                                        <button
                                          type="button"
                                          className="report-photo-preview-btn"
                                          key={photo.id || `${photo.file_url}-${index}`}
                                          onClick={() => setPreviewImageUrl(photo.file_url)}
                                          title="معاينة الصورة بالحجم الكامل"
                                        >
                                          <img src={photo.file_url} alt={`${garden.name} ${index + 1}`} />
                                          <span>تكبير الصورة</span>
                                        </button>
                                      ))
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



      {showReportModal && (
        <div className="edit-modal-backdrop" onClick={() => setShowReportModal(false)}>
          <section className="edit-modal report-modal" onClick={(event) => event.stopPropagation()}>
            <div className="edit-modal-head">
              <h2>إعداد تقرير الفترة</h2>
              <button onClick={() => setShowReportModal(false)}>×</button>
            </div>

            <p className="edit-modal-subtitle">
              حدد الفترة والمشروع لاحتساب حالات الري والغرامات تلقائيًا.
            </p>

            <div className="report-filters-grid">
              <label>
                <span>من تاريخ</span>
                <input type="date" value={reportFromDate} onChange={(e) => setReportFromDate(e.target.value)} />
              </label>

              <label>
                <span>إلى تاريخ</span>
                <input type="date" value={reportToDate} onChange={(e) => setReportToDate(e.target.value)} />
              </label>

              <label>
                <span>المشروع</span>
                <select value={reportProjectId} onChange={(e) => setReportProjectId(e.target.value)}>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="edit-modal-actions">
              <button onClick={generatePeriodReport} disabled={reportLoading}>
                {reportLoading ? 'جارٍ إنشاء التقرير...' : 'إنشاء التقرير'}
              </button>
              <button onClick={printReportOnly} disabled={!reportRows.length}>
  📄 تحميل التقرير الرسمي PDF
</button>
            </div>

            {reportError && <p className="report-error">{reportError}</p>}

            {reportRows.length > 0 && (
              <div id="report-print" className="period-report-print-area">
                <div className="period-report-head">
                  <h3>تقرير ري الحدائق</h3>
                  <p>{reportTitle}</p>
                </div>

                <div className="report-table-wrap">
                  <table className="period-report-table">
                    <thead>
                      <tr>
                        <th>الحديقة</th>
                        <th>تم الري</th>
                        <th>لم يتم الري</th>
                        <th>عدم كفاية ري</th>
                        <th>خروج الري</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportRows.map((row) => (
                        <tr key={row.gardenId}>
                          <td>{row.gardenName}</td>
                          <td>{row.watered}</td>
                          <td>{row.notWatered}</td>
                          <td>{row.insufficient}</td>
                          <td>{row.sidewalk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="fines-report-box">
                  <h3>الغرامات</h3>
                  <div className="report-table-wrap">
                    <table className="period-report-table fines-table">
                      <thead>
                        <tr>
                          <th>الحديقة</th>
                          <th>نوع المخالفة</th>
                          <th>عدد المرات</th>
                          <th>قيمة الغرامة</th>
                          <th>الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fineRows.length ? (
                          fineRows.map((row, index) => (
                            <tr key={`${row.gardenName}-${row.violationType}-${index}`}>
                              <td>{row.gardenName}</td>
                              <td>{row.violationType}</td>
                              <td>{row.count}</td>
                              <td>{formatMoney(row.fineAmount)} ريال</td>
                              <td>{formatMoney(row.total)} ريال</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5}>لا توجد غرامات خلال الفترة المحددة</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="total-fines-card">
                    <span>إجمالي الغرامات لكافة الحدائق</span>
                    <strong>{formatMoney(fineRows.reduce((sum, row) => sum + row.total, 0))} ريال</strong>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {showContractorLinksModal && isManager && (
        <div className="edit-modal-backdrop" onClick={() => setShowContractorLinksModal(false)}>
          <section className="edit-modal contractor-links-modal" onClick={(event) => event.stopPropagation()}>
            <div className="edit-modal-head">
              <h2>إدارة روابط المقاولين</h2>
              <button onClick={() => setShowContractorLinksModal(false)}>×</button>
            </div>

            <p className="edit-modal-subtitle">
              عدّل اسم المسؤول ورمز الدخول لكل مشروع، ثم انسخ الرابط للمقاول.
            </p>

            <div className="contractor-links-list">
              {projects.map((project) => {
                const draft = contractorDrafts[project.id] || {
                  manager_name: project.manager_name || '',
                  contractor_code: project.contractor_code || '',
                };

                return (
                  <div className="contractor-link-card" key={project.id}>
                    <div className="contractor-link-head">
                      <div>
                        <h3>{project.name}</h3>
                        <p>{project.district || 'بدون نطاق'}</p>
                      </div>
                      <span>{project.slug}</span>
                    </div>

                    <label>
                      <span>اسم المسؤول الثابت</span>
                      <input
                        value={draft.manager_name}
                        placeholder="مثال: مدير مشروع المخططات"
                        onChange={(e) => updateContractorDraft(project.id, { manager_name: e.target.value })}
                      />
                    </label>

                    <label>
                      <span>رمز دخول المقاول</span>
                      <input
                        value={draft.contractor_code}
                        placeholder="مثال: 1234"
                        onChange={(e) => updateContractorDraft(project.id, { contractor_code: e.target.value })}
                      />
                    </label>

                    <label>
                      <span>رابط المشروع</span>
                      <input value={getContractorLink(project)} readOnly />
                    </label>

                    <div className="contractor-link-actions">
                      <button onClick={() => saveContractorProject(project)} disabled={savingContractorProjectId === project.id}>
                        {savingContractorProjectId === project.id ? 'جارٍ الحفظ...' : 'حفظ البيانات'}
                      </button>
                      <button onClick={() => copyContractorLink(project)}>نسخ الرابط</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {showPasswordModal && isManager && (
        <div className="edit-modal-backdrop" onClick={() => setShowPasswordModal(false)}>
          <section className="edit-modal password-modal" onClick={(event) => event.stopPropagation()}>
            <div className="edit-modal-head">
              <h2>إدارة كلمات المرور</h2>
              <button onClick={() => setShowPasswordModal(false)}>×</button>
            </div>

            <p className="edit-modal-subtitle">تغيير كلمة مرور المدير أو المشرف</p>

            <label>
              <span>العضوية</span>
              <select
                value={passwordTarget}
                onChange={(e) => setPasswordTarget(e.target.value as 'manager' | 'supervisor')}
              >
                <option value="manager">المدير</option>
                <option value="supervisor">المشرف</option>
              </select>
            </label>

            <label>
              <span>كلمة المرور الجديدة</span>
              <input
                type="password"
                placeholder="كلمة المرور الجديدة"
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
              />
            </label>

            <div className="edit-modal-actions">
              <button onClick={changeAdminPassword}>تغيير كلمة المرور</button>
              <button onClick={() => setShowPasswordModal(false)}>إلغاء</button>
            </div>
          </section>
        </div>
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
              <span>رفع صور من الكاميرا أو المعرض أو الملفات</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                disabled={editUploading}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files?.length) uploadEditPhotos(files);
                }}
              />
            </label>

            {editUploading && (
              <p className="edit-upload-status">جارٍ رفع الصورة...</p>
            )}

            {editUploadFileName && !editUploading && (
              <p className="edit-upload-status">تم اختيار: {editUploadFileName}</p>
            )}

            {editPhotoUrls.length > 0 && (
              <div className="edit-photo-preview edit-photo-preview-grid">
                {editPhotoUrls.map((url, index) => (
                  <div className="edit-photo-thumb" key={`${url}-${index}`}>
                    <img src={url} alt={`معاينة الصورة ${index + 1}`} onClick={() => setPreviewImageUrl(url)} />
                    {editNewPhotoUrls.includes(url) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditPhotoUrls((prev) => prev.filter((item) => item !== url));
                          setEditNewPhotoUrls((prev) => prev.filter((item) => item !== url));
                        }}
                      >
                        إزالة
                      </button>
                    )}
                  </div>
                ))}
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

      {previewImageUrl && (
        <div className="image-preview-backdrop" onClick={() => setPreviewImageUrl(null)}>
          <section className="image-preview-modal" onClick={(event) => event.stopPropagation()}>
            <button className="image-preview-close" onClick={() => setPreviewImageUrl(null)}>×</button>
            <img src={previewImageUrl} alt="معاينة الصورة بالحجم الكامل" />
          </section>
        </div>
      )}

    </main>
  );
}
