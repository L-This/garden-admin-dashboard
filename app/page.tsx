"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type UserRole = "مشرف" | "مدير";

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

type ReportStatus =
  | "watered"
  | "not_watered"
  | "insufficient"
  | "sidewalk_runoff";

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
  ai_review_status?:
    | "pending"
    | "passed"
    | "needs_review"
    | "rejected"
    | string
    | null;
  ai_review_score?: number | null;
  ai_review_reason?: string | null;
  ai_flags?: unknown;
};

type Photo = {
  id: string;
  report_id: string;
  file_url: string;
  image_hash?: string | null;
  duplicate_of_photo_id?: string | null;
  duplicate_match_type?: string | null;
  duplicate_match_score?: number | null;
};

type OpenSection =
  | "watered"
  | "not_watered"
  | "insufficient"
  | "sidewalk"
  | null;

type EditState = {
  garden: Garden;
  project: Project;
  report?: Report;
};

type ContractorDraft = {
  manager_name: string;
  contractor_code: string;
};

type AuditLog = {
  id: string;
  report_id: string | null;
  project_id: string | null;
  garden_id: string | null;
  action: string;
  old_data: any;
  new_data: any;
  changed_by: string | null;
  created_at: string;
  undone: boolean | null;
  undone_at: string | null;
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

type ExecutiveProjectRow = {
  projectId: string;
  projectName: string;
  district: string;
  totalGardens: number;
  workingDays: number;
  required: number;
  watered: number;
  notWatered: number;
  insufficient: number;
  sidewalk: number;
  violations: number;
  fines: number;
  achievementRate: number;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value?: string | null) {
  if (!value) return "بدون وقت";
  return new Date(value).toLocaleString("ar-SA");
}

function getReportStatus(report?: Report): ReportStatus | null {
  if (!report) return null;
  if (report.status) return report.status;
  if (report.sidewalk_runoff) return "sidewalk_runoff";
  if (report.insufficient_watering) return "insufficient";
  return "watered";
}

function statusLabel(status?: ReportStatus | null) {
  if (status === "not_watered") return "لم يتم الري";
  if (status === "insufficient") return "عدم كفاية ري";
  if (status === "sidewalk_runoff") return "خروج الري للرصيف";
  return "تم الري";
}

function workingDaysBetweenInclusive(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  )
    return 0;

  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay(); // الجمعة = 5
    if (day !== 5) count += 1;
    current.setDate(current.getDate() + 1);
  }

  return count;
}

function isFridayDate(dateValue: string) {
  return new Date(`${dateValue}T00:00:00`).getDay() === 5;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ar-SA").format(value);
}

export default function AdminHome() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [passwordTarget, setPasswordTarget] = useState<
    "manager" | "supervisor"
  >("supervisor");
  const [newAdminPassword, setNewAdminPassword] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [loading, setLoading] = useState(true);

  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<OpenSection>(null);

  const [editState, setEditState] = useState<EditState | null>(null);
  const [editStatus, setEditStatus] = useState<ReportStatus>("watered");
  const [editNote, setEditNote] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showContractorLinksModal, setShowContractorLinksModal] =
    useState(false);
  const [contractorDrafts, setContractorDrafts] = useState<
    Record<string, ContractorDraft>
  >({});
  const [savingContractorProjectId, setSavingContractorProjectId] = useState<
    string | null
  >(null);
  const [editPhotoUrls, setEditPhotoUrls] = useState<string[]>([]);
  const [editNewPhotoUrls, setEditNewPhotoUrls] = useState<string[]>([]);
  const [editUploading, setEditUploading] = useState(false);
  const [editUploadFileName, setEditUploadFileName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [duplicateViewer, setDuplicateViewer] = useState<any | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportFromDate, setReportFromDate] = useState(today());
  const [reportToDate, setReportToDate] = useState(today());
  const [reportProjectId, setReportProjectId] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportRows, setReportRows] = useState<ReportSummaryRow[]>([]);
  const [fineRows, setFineRows] = useState<FineRow[]>([]);
  const [reportTitle, setReportTitle] = useState("");
  const [notWateredFine, setNotWateredFine] = useState(1000);
  const [insufficientFine, setInsufficientFine] = useState(500);
  const [sidewalkFine, setSidewalkFine] = useState(300);

  const [showExecutiveModal, setShowExecutiveModal] = useState(false);
  const [executiveFromDate, setExecutiveFromDate] = useState(today());
  const [executiveToDate, setExecutiveToDate] = useState(today());
  const [executiveLoading, setExecutiveLoading] = useState(false);
  const [executiveRows, setExecutiveRows] = useState<ExecutiveProjectRow[]>([]);
  const [executiveError, setExecutiveError] = useState("");

  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditProjectFilter, setAuditProjectFilter] = useState("all");
  const [auditDateFilter, setAuditDateFilter] = useState(today());
  const [undoingAuditId, setUndoingAuditId] = useState<string | null>(null);

  const isManager = user?.role === "مدير";

  useEffect(() => {
    const saved = localStorage.getItem("adminUser");
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
            manager_name: project.manager_name || "",
            contractor_code: project.contractor_code || "",
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
      alert("اختر العضوية وأدخل كلمة المرور");
      return;
    }

    setLoginLoading(true);

    const { data, error } = await supabase
      .from("admin_users")
      .select("*")
      .eq("username", username)
      .eq("password", password)
      .eq("active", true)
      .single();

    setLoginLoading(false);

    if (error || !data) {
      alert("بيانات الدخول غير صحيحة");
      return;
    }

    setUser(data);
    localStorage.setItem("adminUser", JSON.stringify(data));
  }

  function logout() {
    localStorage.removeItem("adminUser");
    setUser(null);
    setUsername("");
    setPassword("");
  }

  async function changeAdminPassword() {
    if (!isManager) return;

    if (!newAdminPassword.trim()) {
      alert("اكتب كلمة المرور الجديدة");
      return;
    }

    const { error } = await supabase
      .from("admin_users")
      .update({ password: newAdminPassword.trim() })
      .eq("username", passwordTarget);

    if (error) {
      alert("تعذر تغيير كلمة المرور: " + error.message);
      return;
    }

    alert("تم تغيير كلمة المرور بنجاح");
    setNewAdminPassword("");
  }

  function getContractorLink(project: Project) {
    if (typeof window === "undefined") return `/project/${project.slug}`;
    return `${window.location.origin}/project/${project.slug}`;
  }

  function updateContractorDraft(
    projectId: string,
    patch: Partial<ContractorDraft>,
  ) {
    setContractorDrafts((current) => ({
      ...current,
      [projectId]: {
        manager_name: current[projectId]?.manager_name || "",
        contractor_code: current[projectId]?.contractor_code || "",
        ...patch,
      },
    }));
  }

  async function saveContractorProject(project: Project) {
    if (!isManager) return;

    const draft = contractorDrafts[project.id];
    if (!draft) return;

    if (!draft.manager_name.trim()) {
      alert("اكتب اسم المسؤول لهذا المشروع");
      return;
    }

    if (!draft.contractor_code.trim()) {
      alert("اكتب رمز دخول المقاول لهذا المشروع");
      return;
    }

    setSavingContractorProjectId(project.id);

    const { error } = await supabase
      .from("projects")
      .update({
        manager_name: draft.manager_name.trim(),
        contractor_code: draft.contractor_code.trim(),
      })
      .eq("id", project.id);

    setSavingContractorProjectId(null);

    if (error) {
      alert("تعذر حفظ بيانات الرابط: " + error.message);
      return;
    }

    setProjects((current) =>
      current.map((item) =>
        item.id === project.id
          ? {
              ...item,
              manager_name: draft.manager_name.trim(),
              contractor_code: draft.contractor_code.trim(),
            }
          : item,
      ),
    );

    alert("تم حفظ بيانات رابط المقاول");
  }

  async function copyContractorLink(project: Project) {
    const link = getContractorLink(project);
    try {
      await navigator.clipboard.writeText(link);
      alert("تم نسخ رابط المشروع");
    } catch {
      alert(link);
    }
  }

  async function writeAuditLog(params: {
    reportId?: string | null;
    projectId?: string | null;
    gardenId?: string | null;
    action: string;
    oldData: any;
    newData: any;
  }) {
    await supabase.from("admin_audit_logs").insert({
      report_id: params.reportId || null,
      project_id: params.projectId || null,
      garden_id: params.gardenId || null,
      action: params.action,
      old_data: params.oldData,
      new_data: params.newData,
      changed_by: user?.username || "admin",
    });
  }

  async function openAuditLogModal() {
    setShowAuditModal(true);
    await loadAuditLogs();
  }

  async function loadAuditLogs() {
  setAuditLoading(true);

  let reportsQuery = supabase
    .from("reports")
    .select("id")
    .eq("report_date", auditDateFilter);

  if (auditProjectFilter !== "all") {
    const projectGardens = gardens
      .filter((g) => g.project_id === auditProjectFilter)
      .map((g) => g.id);

    reportsQuery = reportsQuery.in("garden_id", projectGardens);
  }

  const { data: reportRows, error: reportsError } = await reportsQuery;

  if (reportsError) {
    setAuditLoading(false);
    alert("تعذر تحميل التقارير");
    return;
  }

  const reportIds = (reportRows || []).map((r) => r.id);

  if (!reportIds.length) {
    setAuditLogs([]);
    setAuditLoading(false);
    return;
  }

  const { data, error } = await supabase
    .from("admin_audit_logs")
    .select("*")
    .in("report_id", reportIds)
    .order("created_at", { ascending: false });

  setAuditLoading(false);

  if (error) {
    alert("تعذر تحميل سجل التعديلات: " + error.message);
    return;
  }

  setAuditLogs((data || []) as AuditLog[]);
}

  function auditActionLabel(action: string) {
    if (action === "approve_ai_review") return "اعتماد تحقق ذكي";
    if (action === "escalate_ai_review") return "تسجيل مخالفة تحقق ذكي";
    if (action === "update_report_status") return "تغيير حالة الري";
    if (action === "save_edited_record") return "تعديل سجل الحديقة";
    return action;
  }

  async function undoAuditLog(log: AuditLog) {
    if (!isManager) return;

    if (log.undone) {
      alert("تم التراجع عن هذا التعديل مسبقًا");
      return;
    }

    if (!log.report_id || !log.old_data) {
      alert("لا يمكن التراجع عن هذا التعديل لعدم توفر بيانات قديمة");
      return;
    }

    const ok = confirm(
      "هل تريد التراجع عن هذا التعديل وإرجاع السجل للحالة السابقة؟",
    );
    if (!ok) return;

    setUndoingAuditId(log.id);

    const { error: updateError } = await supabase
      .from("reports")
      .update(log.old_data)
      .eq("id", log.report_id);

    if (updateError) {
      setUndoingAuditId(null);
      alert("تعذر التراجع: " + updateError.message);
      return;
    }

    const { error: logError } = await supabase
      .from("admin_audit_logs")
      .update({ undone: true, undone_at: new Date().toISOString() })
      .eq("id", log.id);

    setUndoingAuditId(null);

    if (logError) {
      alert("تم التراجع، لكن تعذر تحديث سجل التعديلات: " + logError.message);
    }

    await loadData();
    await loadAuditLogs();
    alert("تم التراجع عن التعديل بنجاح");
  }

  async function generatePeriodReport() {
    setReportError("");
    setReportRows([]);
    setFineRows([]);

    if (!reportFromDate || !reportToDate || !reportProjectId) {
      setReportError("اختر الفترة والمشروع أولًا.");
      return;
    }

    const numberOfDays = workingDaysBetweenInclusive(
      reportFromDate,
      reportToDate,
    );
    if (!numberOfDays) {
      setReportError("تأكد أن تاريخ النهاية بعد تاريخ البداية.");
      return;
    }

    const selectedProject = projects.find(
      (project) => project.id === reportProjectId,
    );
    const projectGardens = gardens.filter(
      (garden) => garden.project_id === reportProjectId,
    );

    if (!selectedProject || !projectGardens.length) {
      setReportError("لا توجد حدائق لهذا المشروع.");
      return;
    }

    setReportLoading(true);

    const gardenIds = projectGardens.map((garden) => garden.id);

    const { data, error } = await supabase
      .from("reports")
      .select(
        "id, garden_id, report_date, status, insufficient_watering, sidewalk_runoff",
      )
      .gte("report_date", reportFromDate)
      .lte("report_date", reportToDate)
      .in("garden_id", gardenIds);

    setReportLoading(false);

    if (error) {
      setReportError("تعذر إنشاء التقرير: " + error.message);
      return;
    }

    const reportsInPeriod = (data || []) as Pick<
      Report,
      | "id"
      | "garden_id"
      | "report_date"
      | "status"
      | "insufficient_watering"
      | "sidewalk_runoff"
    >[];

    const rows: ReportSummaryRow[] = projectGardens.map((garden) => {
      const gardenReports = reportsInPeriod.filter(
        (report) => report.garden_id === garden.id,
      );
      const reportedDates = new Set(
        gardenReports.map((report) => report.report_date),
      );

      let watered = 0;
      let notWateredExplicit = 0;
      let insufficient = 0;
      let sidewalk = 0;

      gardenReports.forEach((report) => {
        const status = getReportStatus(report as Report);
        if (status === "not_watered") notWateredExplicit += 1;
        else if (status === "insufficient") insufficient += 1;
        else if (status === "sidewalk_runoff") sidewalk += 1;
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

    const currentNotWateredFine = Number(notWateredFine) || 0;
    const currentInsufficientFine = Number(insufficientFine) || 0;
    const currentSidewalkFine = Number(sidewalkFine) || 0;

    const fines: FineRow[] = [];
    rows.forEach((row) => {
      if (row.notWatered > 0) {
        fines.push({
          gardenName: row.gardenName,
          violationType: "لم يتم الري",
          count: row.notWatered,
          fineAmount: currentNotWateredFine,
          total: row.notWatered * currentNotWateredFine,
        });
      }
      if (row.insufficient > 0) {
        fines.push({
          gardenName: row.gardenName,
          violationType: "عدم كفاية ري",
          count: row.insufficient,
          fineAmount: currentInsufficientFine,
          total: row.insufficient * currentInsufficientFine,
        });
      }
      if (row.sidewalk > 0) {
        fines.push({
          gardenName: row.gardenName,
          violationType: "خروج الري للرصيف",
          count: row.sidewalk,
          fineAmount: currentSidewalkFine,
          total: row.sidewalk * currentSidewalkFine,
        });
      }
    });

    setReportRows(rows);
    setFineRows(fines);
    setReportTitle(
      `${selectedProject.name} من ${reportFromDate} إلى ${reportToDate}`,
    );
  }

  async function loadExecutiveDashboard() {
    setExecutiveError("");
    setExecutiveRows([]);

    if (!executiveFromDate || !executiveToDate) {
      setExecutiveError("حدد تاريخ البداية والنهاية أولًا.");
      return;
    }

    const workingDays = workingDaysBetweenInclusive(
      executiveFromDate,
      executiveToDate,
    );

    if (!workingDays) {
      setExecutiveError("تأكد أن تاريخ النهاية بعد تاريخ البداية.");
      return;
    }

    setExecutiveLoading(true);

    const { data, error } = await supabase
      .from("reports")
      .select(
        "id, garden_id, report_date, status, insufficient_watering, sidewalk_runoff",
      )
      .gte("report_date", executiveFromDate)
      .lte("report_date", executiveToDate);

    setExecutiveLoading(false);

    if (error) {
      setExecutiveError("تعذر تحميل لوحة المؤشرات: " + error.message);
      return;
    }

    const periodReports = (data || []) as Pick<
      Report,
      | "id"
      | "garden_id"
      | "report_date"
      | "status"
      | "insufficient_watering"
      | "sidewalk_runoff"
    >[];

    const currentNotWateredFine = Number(notWateredFine) || 0;
    const currentInsufficientFine = Number(insufficientFine) || 0;
    const currentSidewalkFine = Number(sidewalkFine) || 0;

    const rows: ExecutiveProjectRow[] = projects.map((project) => {
      const projectGardens = gardens.filter(
        (garden) => garden.project_id === project.id,
      );
      const gardenIds = new Set(projectGardens.map((garden) => garden.id));
      const projectReports = periodReports.filter((report) =>
        gardenIds.has(report.garden_id),
      );

      let watered = 0;
      let notWateredExplicit = 0;
      let insufficient = 0;
      let sidewalk = 0;

      projectReports.forEach((report) => {
        const status = getReportStatus(report as Report);
        if (status === "not_watered") notWateredExplicit += 1;
        else if (status === "insufficient") insufficient += 1;
        else if (status === "sidewalk_runoff") sidewalk += 1;
        else watered += 1;
      });

      const required = projectGardens.length * workingDays;
      const reportedKeys = new Set(
        projectReports.map((report) => `${report.garden_id}-${report.report_date}`),
      );
      const missing = Math.max(0, required - reportedKeys.size);
      const notWatered = notWateredExplicit + missing;
      const violations = notWatered + insufficient + sidewalk;
      const fines =
        notWatered * currentNotWateredFine +
        insufficient * currentInsufficientFine +
        sidewalk * currentSidewalkFine;
      const achievementRate = required
        ? Math.round((watered / required) * 100)
        : 0;

      return {
        projectId: project.id,
        projectName: project.name,
        district: project.district || "بدون نطاق",
        totalGardens: projectGardens.length,
        workingDays,
        required,
        watered,
        notWatered,
        insufficient,
        sidewalk,
        violations,
        fines,
        achievementRate,
      };
    });

    setExecutiveRows(
      rows.sort((a, b) => b.achievementRate - a.achievementRate),
    );
  }

  function printReportOnly() {
    if (!reportRows.length) {
      alert("أنشئ التقرير أولًا");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1200,height=800");

    if (!printWindow) {
      alert("المتصفح منع فتح نافذة الطباعة");
      return;
    }

    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const workingDays = workingDaysBetweenInclusive(reportFromDate, reportToDate);
    const requiredWateringTotal = reportRows.length * workingDays;
    const totalWatered = reportRows.reduce((sum, row) => sum + row.watered, 0);
    const totalNotWatered = reportRows.reduce((sum, row) => sum + row.notWatered, 0);
    const totalInsufficient = reportRows.reduce((sum, row) => sum + row.insufficient, 0);
    const totalSidewalk = reportRows.reduce((sum, row) => sum + row.sidewalk, 0);
    const totalViolations = totalNotWatered + totalInsufficient + totalSidewalk;
    const totalFines = fineRows.reduce((sum, row) => sum + row.total, 0);
    const achievementPercent = requiredWateringTotal
      ? Math.round((totalWatered / requiredWateringTotal) * 100)
      : 0;
    const safeAchievementPercent = Math.max(0, Math.min(100, achievementPercent));
    const violationPercent = requiredWateringTotal
      ? Math.round((totalViolations / requiredWateringTotal) * 100)
      : 0;
    const safeViolationPercent = Math.max(0, Math.min(100, violationPercent));

    const reportRowsHtml = reportRows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.gardenName)}</td>
            <td>${formatMoney(row.watered)}</td>
            <td>${formatMoney(row.notWatered)}</td>
            <td>${formatMoney(row.insufficient)}</td>
            <td>${formatMoney(row.sidewalk)}</td>
          </tr>`,
      )
      .join("");

    const fineRowsHtml = fineRows.length
      ? fineRows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.gardenName)}</td>
                <td>${escapeHtml(row.violationType)}</td>
                <td>${formatMoney(row.count)}</td>
                <td>${formatMoney(row.fineAmount)} ريال</td>
                <td>${formatMoney(row.total)} ريال</td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="5">لا توجد غرامات خلال الفترة المحددة</td></tr>`;

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

            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            body {
              margin: 0;
              direction: rtl;
              font-family: Arial, sans-serif;
              color: #062b24;
              background: #ffffff;
            }

            .print-page {
              width: 100%;
            }

            .period-report-head {
              text-align: center;
              margin-bottom: 12px;
              break-after: avoid;
              page-break-after: avoid;
            }

            .period-report-head h3 {
              font-size: 24px;
              margin: 0 0 6px;
              font-weight: 900;
            }

            .period-report-head p {
              font-size: 14px;
              margin: 0;
              font-weight: 700;
            }

            .table-wrap {
              width: 100%;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              font-size: 11px;
              margin: 10px 0 18px;
            }

            thead {
              display: table-header-group;
            }

            tfoot {
              display: table-footer-group;
            }

            tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            th,
            td {
              border: 1px solid #d8c58b;
              padding: 7px 5px;
              text-align: center;
              vertical-align: middle;
              word-break: break-word;
              line-height: 1.45;
            }

            th {
              background: #07563f;
              color: #ffffff;
              font-weight: 900;
            }

            .dashboard-page {
              break-before: page;
              page-break-before: always;
              break-inside: avoid;
              page-break-inside: avoid;
              padding-top: 2mm;
            }

            .executive-report-dashboard {
              width: 100%;
              margin: 0 0 16px;
              padding: 18px;
              border: 2px solid rgba(216, 180, 92, .72);
              border-radius: 22px;
              background: linear-gradient(135deg, #ffffff 0%, #fff8e6 48%, #f5fbf7 100%);
              box-shadow: none;
              overflow: visible;
            }

            .dash-head {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              align-items: flex-start;
              margin-bottom: 16px;
            }

            .dash-badge {
              display: inline-block;
              padding: 6px 13px;
              border-radius: 999px;
              background: #f8f1dc;
              color: #8a5a11;
              font-weight: 900;
              font-size: 12px;
              margin-bottom: 8px;
            }

            .dash-head h3 {
              margin: 0;
              font-size: 23px;
              color: #062b24;
            }

            .dash-head p {
              margin: 6px 0 0;
              color: #55706a;
              font-weight: 700;
              font-size: 13px;
            }

            .achievement-box {
              min-width: 145px;
              text-align: center;
              padding: 12px 14px;
              border-radius: 18px;
              background: #062b24;
              color: white;
            }

            .achievement-box span {
              display: block;
              font-size: 12px;
              opacity: .85;
            }

            .achievement-box strong {
              display: block;
              font-size: 34px;
              line-height: 1.1;
            }

            .kpi-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              margin-bottom: 14px;
            }

            .kpi-card {
              min-height: 76px;
              padding: 13px 12px;
              border-radius: 16px;
              background: linear-gradient(180deg, #ffffff 0%, #fbf7ea 100%);
              border: 1px solid rgba(216, 180, 92, .55);
            }

            .kpi-card span {
              display: block;
              font-weight: 900;
              font-size: 13px;
            }

            .kpi-card strong {
              display: block;
              margin-top: 7px;
              color: #062b24;
              font-size: 25px;
            }

            .dashboard-bottom {
              display: grid;
              grid-template-columns: 2fr 1fr;
              gap: 12px;
            }

            .progress-card,
            .fines-card {
              border-radius: 18px;
              padding: 14px;
              background: rgba(255,255,255,.88);
              border: 1px solid #eadfbc;
            }

            .progress-title {
              display: flex;
              justify-content: space-between;
              margin-bottom: 9px;
              font-weight: 900;
            }

            .progress-bar {
              height: 22px;
              border-radius: 999px;
              overflow: hidden;
              background: #eee7d5;
              display: flex;
            }

            .progress-green {
              width: ${safeAchievementPercent}%;
              background: linear-gradient(90deg, #0f7a53, #20a36f);
            }

            .progress-red {
              width: ${safeViolationPercent}%;
              background: linear-gradient(90deg, #d97706, #be123c);
            }

            .progress-note {
              display: flex;
              justify-content: space-between;
              margin-top: 9px;
              font-size: 12px;
              color: #55706a;
              font-weight: 800;
              gap: 10px;
            }

            .fines-card {
              background: #fff7ed;
              border-color: #fed7aa;
              text-align: center;
            }

            .fines-card span {
              color: #9a3412;
              font-weight: 900;
            }

            .fines-card strong {
              display: block;
              margin-top: 9px;
              color: #7f1d1d;
              font-size: 25px;
            }

            .fines-card small {
              display: block;
              margin-top: 7px;
              color: #9a3412;
              font-weight: 800;
            }

            .fines-section {
              margin-top: 10px;
            }

            .fines-section h3 {
              text-align: center;
              margin: 0 0 10px;
              font-size: 20px;
            }

            .total-fines-card {
              margin-top: 12px;
              padding: 12px;
              border: 2px solid #d8c58b;
              border-radius: 16px;
              text-align: center;
              font-weight: 900;
              font-size: 16px;
              background: #fffaf0;
            }

            .total-fines-card strong {
              color: #b91c1c;
              display: block;
              margin-top: 7px;
              font-size: 22px;
            }
          </style>
        </head>
        <body>
          <main class="print-page">
            <section class="period-report-head">
              <h3>تقرير ري الحدائق</h3>
              <p>${escapeHtml(reportTitle)}</p>
            </section>

            <section class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الحديقة</th>
                    <th>تم الري</th>
                    <th>لم يتم الري</th>
                    <th>عدم كفاية ري</th>
                    <th>خروج الري</th>
                  </tr>
                </thead>
                <tbody>${reportRowsHtml}</tbody>
              </table>
            </section>

            <section class="dashboard-page">
              <div class="executive-report-dashboard">
                <div class="dash-head">
                  <div>
                    <span class="dash-badge">لوحة المؤشرات التنفيذية</span>
                    <h3>ملخص أداء الري خلال الفترة</h3>
                    <p>قراءة سريعة للإجمالي المطلوب حسب الفترة، نسبة الإنجاز، وإجمالي الغرامات.</p>
                  </div>
                  <div class="achievement-box">
                    <span>نسبة الإنجاز</span>
                    <strong>${achievementPercent}%</strong>
                  </div>
                </div>

                <div class="kpi-grid">
                  <div class="kpi-card"><span style="color:#0f7a53">تم الري</span><strong>${formatMoney(totalWatered)}</strong></div>
                  <div class="kpi-card"><span style="color:#9f1239">لم يتم الري</span><strong>${formatMoney(totalNotWatered)}</strong></div>
                  <div class="kpi-card"><span style="color:#b45309">عدم كفاية الري</span><strong>${formatMoney(totalInsufficient)}</strong></div>
                  <div class="kpi-card"><span style="color:#854d0e">خروج الري للرصيف</span><strong>${formatMoney(totalSidewalk)}</strong></div>
                </div>

                <div class="dashboard-bottom">
                  <div class="progress-card">
                    <div class="progress-title">
                      <strong>مؤشر الإنجاز العام</strong>
                      <span>${formatMoney(totalWatered)} / ${formatMoney(requiredWateringTotal)}</span>
                    </div>
                    <div class="progress-bar">
                      <span class="progress-green"></span>
                      <span class="progress-red"></span>
                    </div>
                    <div class="progress-note">
                      <span>المطلوب للفترة: ${formatMoney(requiredWateringTotal)} (${formatMoney(reportRows.length)} حديقة × ${formatMoney(workingDays)} أيام عمل)</span>
                      <span>الأحمر/البرتقالي: حالات تحتاج متابعة</span>
                    </div>
                  </div>

                  <div class="fines-card">
                    <span>إجمالي الغرامات</span>
                    <strong>${formatMoney(totalFines)} ريال</strong>
                    <small>عدد المخالفات: ${formatMoney(totalViolations)}</small>
                  </div>
                </div>
              </div>

              <section class="fines-section">
                <h3>الغرامات</h3>
                <table>
                  <thead>
                    <tr>
                      <th>الحديقة</th>
                      <th>نوع المخالفة</th>
                      <th>عدد المرات</th>
                      <th>قيمة الغرامة</th>
                      <th>الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>${fineRowsHtml}</tbody>
                </table>

                <div class="total-fines-card">
                  <span>إجمالي الغرامات لكافة الحدائق</span>
                  <strong>${formatMoney(totalFines)} ريال</strong>
                </div>
              </section>
            </section>
          </main>
          <script>
            window.onload = function () {
              window.focus();
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
      .from("projects")
      .select("id, slug, name, district, manager_name, contractor_code")
      .order("created_at", { ascending: true });

    const { data: gardensData } = await supabase
      .from("gardens")
      .select("id, project_id, name")
      .eq("active", true)
      .order("created_at", { ascending: true });

    const { data: reportsData } = await supabase
      .from("reports")
      .select(
        "id, garden_id, report_date, created_at, status, admin_note, insufficient_watering, sidewalk_runoff, insufficient_note, sidewalk_runoff_note, notes, ai_review_status, ai_review_score, ai_review_reason, ai_flags",
      )
      .eq("report_date", selectedDate);

    const reportIds = (reportsData || []).map((r) => r.id);

    let photosData: Photo[] = [];
    if (reportIds.length) {
      const { data } = await supabase
        .from("photos")
        .select(`
  id,
  report_id,
  file_url,
  image_hash,
  duplicate_of_photo_id,
  duplicate_match_type,
  duplicate_match_score
`)
        .in("report_id", reportIds);

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

    const currentStatus = getReportStatus(report) || "not_watered";
    const currentPhotos = report
      ? (photosByReportId.get(report.id) || []).map((photo) => photo.file_url)
      : [];

    setEditState({ garden, project, report });
    setEditStatus(currentStatus);
    setEditNote(
      report?.admin_note ||
        report?.notes ||
        report?.insufficient_note ||
        report?.sidewalk_runoff_note ||
        "",
    );
    setEditPhotoUrls(currentPhotos);
    setEditNewPhotoUrls([]);
    setEditUploadFileName("");
  }

  function safeFileName(value: string) {
    return (
      value
        .trim()
        .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, "-")
        .replace(/\s+/g, "-")
        .slice(0, 80) || "garden"
    );
  }

  async function uploadEditPhotos(files: FileList | File[]) {
    if (!editState) return;

    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;

    setEditUploading(true);
    setEditUploadFileName(selectedFiles.map((file) => file.name).join("، "));

    const uploadedUrls: string[] = [];

    for (const file of selectedFiles) {
      const ext = file.name.split(".").pop() || "jpg";
      const projectName = safeFileName(editState.project.name);
      const gardenName = safeFileName(editState.garden.name);
      const path = `${selectedDate}/${projectName}/${gardenName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("garden-photos")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        setEditUploading(false);
        alert("تعذر رفع الصورة: " + uploadError.message);
        return;
      }

      const { data } = supabase.storage
        .from("garden-photos")
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

    const oldReport = editState.report
      ? {
          status: editState.report.status || null,
          admin_note: editState.report.admin_note || null,
          notes: editState.report.notes || null,
          insufficient_watering: editState.report.insufficient_watering,
          sidewalk_runoff: editState.report.sidewalk_runoff,
        }
      : null;

    const updatePayload = {
      garden_id: editState.garden.id,
      report_date: selectedDate,
      status: editStatus,
      admin_note: editNote.trim() || null,
      notes: editNote.trim() || null,
      insufficient_watering: editStatus === "insufficient",
      sidewalk_runoff: editStatus === "sidewalk_runoff",
      reviewed_by: user?.username || "admin",
      reviewed_at: new Date().toISOString(),
    };

    let reportId = editState.report?.id;

    if (reportId) {
      const { error } = await supabase
        .from("reports")
        .update(updatePayload)
        .eq("id", reportId);

      if (error) {
        setEditSaving(false);
        alert("تعذر حفظ التعديل: " + error.message);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("reports")
        .insert(updatePayload)
        .select("id")
        .single();

      if (error || !data) {
        setEditSaving(false);
        alert("تعذر إنشاء السجل: " + (error?.message || "خطأ غير معروف"));
        return;
      }

      reportId = data.id;
    }

    if (reportId && editNewPhotoUrls.length) {
      const { error } = await supabase
        .from("photos")
        .insert(
          editNewPhotoUrls.map((url) => ({
            report_id: reportId,
            file_url: url,
          })),
        );

      if (error) {
        setEditSaving(false);
        alert("تم حفظ السجل، لكن تعذر حفظ الصور: " + error.message);
        return;
      }
    }

    if (reportId) {
      await writeAuditLog({
        reportId,
        projectId: editState.project.id,
        gardenId: editState.garden.id,
        action: "save_edited_record",
        oldData: oldReport,
        newData: updatePayload,
      });
    }

    setEditSaving(false);
    setEditState(null);
    await loadData();
    alert("تم حفظ التعديل بنجاح");
  }

  async function updateReportStatus(
    reportId: string,
    status: "watered" | "not_watered" | "insufficient" | "sidewalk",
  ) {
    if (!isManager) return;

    const oldReport = reports.find((report) => report.id === reportId);

    const normalizedStatus: ReportStatus =
      status === "sidewalk" ? "sidewalk_runoff" : status;

    const { error } = await supabase
      .from("reports")
      .update({
        status: normalizedStatus,
        insufficient_watering: normalizedStatus === "insufficient",
        sidewalk_runoff: normalizedStatus === "sidewalk_runoff",
        reviewed_by: user?.username || "admin",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", reportId);

    if (error) {
      alert("تعذر تحديث الحالة: " + error.message);
      return;
    }

    if (oldReport) {
      await writeAuditLog({
        reportId,
        gardenId: oldReport.garden_id,
        action: "update_report_status",
        oldData: {
          status: oldReport.status || null,
          insufficient_watering: oldReport.insufficient_watering,
          sidewalk_runoff: oldReport.sidewalk_runoff,
        },
        newData: {
          status: normalizedStatus,
          insufficient_watering: normalizedStatus === "insufficient",
          sidewalk_runoff: normalizedStatus === "sidewalk_runoff",
        },
      });
    }

    await loadData();
  }

  async function approveAiReview(reportId: string) {
    if (!isManager) return;

    const oldReport = reports.find((report) => report.id === reportId);

    const { error } = await supabase
      .from("reports")
      .update({
        ai_review_status: "passed",
        ai_review_reason: "تم اعتماد الصورة يدويًا من لوحة الإدارة",
        reviewed_by: user?.username || "admin",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", reportId);

    if (error) {
      alert("تعذر اعتماد التنبيه: " + error.message);
      return;
    }

    if (oldReport) {
      await writeAuditLog({
        reportId,
        gardenId: oldReport.garden_id,
        action: "approve_ai_review",
        oldData: {
          ai_review_status: oldReport.ai_review_status || null,
          ai_review_reason: oldReport.ai_review_reason || null,
          reviewed_by: null,
          reviewed_at: null,
        },
        newData: {
          ai_review_status: "passed",
          ai_review_reason: "تم اعتماد الصورة يدويًا من لوحة الإدارة",
        },
      });
    }

    await loadData();
  }

  async function openDuplicateViewer(photo: Photo) {
    setDuplicateLoading(true);

    try {
      let matchedPhotos: Photo[] = [];

      if (photo.image_hash) {
        const { data } = await supabase
          .from("photos")
          .select("id, report_id, file_url, image_hash, duplicate_of_photo_id, duplicate_match_type, duplicate_match_score, created_at")
          .eq("image_hash", photo.image_hash)
          .neq("id", photo.id)
          .neq("report_id", photo.report_id)
          .order("created_at", { ascending: true });

        matchedPhotos = (data || []) as Photo[];
      }

      if (!matchedPhotos.length && photo.duplicate_of_photo_id) {
        const { data } = await supabase
          .from("photos")
          .select("id, report_id, file_url, image_hash, duplicate_of_photo_id, duplicate_match_type, duplicate_match_score")
          .eq("id", photo.duplicate_of_photo_id)
          .maybeSingle();

        if (data) matchedPhotos = [data as Photo];
      }

      if (!matchedPhotos.length) {
        alert("لا توجد صورة مطابقة محفوظة");
        setDuplicateLoading(false);
        return;
      }

      const reportIds = Array.from(new Set(matchedPhotos.map((item) => item.report_id)));
      const { data: matchedReportsData } = await supabase
        .from("reports")
        .select("id, garden_id, report_date, created_at")
        .in("id", reportIds);

      const matchedReports = (matchedReportsData || []) as Pick<Report, "id" | "garden_id" | "report_date" | "created_at">[];
      const currentReport = reports.find((report) => report.id === photo.report_id) || null;
      const currentGarden = currentReport ? gardens.find((garden) => garden.id === currentReport.garden_id) || null : null;
      const currentProject = currentGarden ? projects.find((project) => project.id === currentGarden.project_id) || null : null;

      const matches = matchedPhotos.map((matchedPhoto) => {
        const matchedReport = matchedReports.find((report) => report.id === matchedPhoto.report_id) || null;
        const matchedGarden = matchedReport ? gardens.find((garden) => garden.id === matchedReport.garden_id) || null : null;
        const matchedProject = matchedGarden ? projects.find((project) => project.id === matchedGarden.project_id) || null : null;

        return {
          photo: matchedPhoto,
          report: matchedReport,
          garden: matchedGarden,
          project: matchedProject,
        };
      });

      setDuplicateViewer({
        currentPhoto: photo,
        currentReport,
        currentGarden,
        currentProject,
        matches,
        matchCount: matches.length,
        matchType: photo.duplicate_match_type || matches[0]?.photo?.duplicate_match_type || "exact_hash",
        matchScore: photo.duplicate_match_score || matches[0]?.photo?.duplicate_match_score || 100,
      });
    } catch (error) {
      alert("تعذر تحميل الصور المطابقة");
    } finally {
      setDuplicateLoading(false);
    }
  }

  async function escalateAiReview(report: Report) {
    if (!isManager) return;

    const ok = confirm(
      "سيتم اعتبار هذا السجل مخالفة وتحويل الحالة إلى لم يتم الري. هل أنت متأكد؟",
    );
    if (!ok) return;

    const reason = report.ai_review_reason || "اشتباه تحقق ذكي في الصورة";

    const oldData = {
      ai_review_status: report.ai_review_status || null,
      status: report.status || null,
      insufficient_watering: report.insufficient_watering,
      sidewalk_runoff: report.sidewalk_runoff,
      admin_note: report.admin_note || null,
      notes: report.notes || null,
    };

    const { error } = await supabase
      .from("reports")
      .update({
        ai_review_status: "rejected",
        status: "not_watered",
        insufficient_watering: false,
        sidewalk_runoff: false,
        admin_note: `مخالفة تحقق ذكي: ${reason}`,
        notes: `مخالفة تحقق ذكي: ${reason}`,
        reviewed_by: user?.username || "admin",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", report.id);

    if (error) {
      alert("تعذر تصعيد المخالفة: " + error.message);
      return;
    }

    await writeAuditLog({
      reportId: report.id,
      gardenId: report.garden_id,
      action: "escalate_ai_review",
      oldData,
      newData: {
        ai_review_status: "rejected",
        status: "not_watered",
        insufficient_watering: false,
        sidewalk_runoff: false,
        admin_note: `مخالفة تحقق ذكي: ${reason}`,
        notes: `مخالفة تحقق ذكي: ${reason}`,
      },
    });

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
    return reports.filter(
      (report) =>
        report.ai_review_status === "needs_review" ||
        report.ai_review_status === "rejected",
    );
  }, [reports]);

  function getGardenById(gardenId: string) {
    return gardens.find((garden) => garden.id === gardenId);
  }

  function getProjectById(projectId: string) {
    return projects.find((project) => project.id === projectId);
  }

  const wateredGardenIds = useMemo(
    () =>
      new Set(
        reports
          .filter((report) => getReportStatus(report) !== "not_watered")
          .map((report) => report.garden_id),
      ),
    [reports],
  );

  const totals = useMemo(() => {
    const friday = isFridayDate(selectedDate);
    const totalGardens = gardens.length;
    const watered = friday
      ? 0
      : gardens.filter((garden) => wateredGardenIds.has(garden.id)).length;
    const notWatered = friday ? 0 : totalGardens - watered;
    const insufficient = friday
      ? 0
      : reports.filter((r) => getReportStatus(r) === "insufficient").length;
    const sidewalk = friday
      ? 0
      : reports.filter((r) => getReportStatus(r) === "sidewalk_runoff").length;

    return { totalGardens, watered, notWatered, insufficient, sidewalk };
  }, [gardens, wateredGardenIds, reports, selectedDate]);

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
              setPassword("");
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

          <button type="submit">
            {loginLoading ? "جارٍ الدخول..." : "دخول"}
          </button>

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
          <button onClick={() => setShowReportModal(true)}>
            📊 إعداد تقرير
          </button>
          {isManager && (
            <button
              onClick={() => {
                setShowExecutiveModal(true);
                if (!executiveRows.length) loadExecutiveDashboard();
              }}
            >
              📈 لوحة المؤشرات التنفيذية
            </button>
          )}
          {isManager && (
            <button onClick={openAuditLogModal}>↩ سجل التعديلات</button>
          )}
          {isManager && (
            <button onClick={() => setShowPasswordModal(true)}>
              ⚿ إدارة كلمة المرور
            </button>
          )}
          {isManager && (
            <button onClick={() => setShowContractorLinksModal(true)}>
              🔗 روابط المقاولين
            </button>
          )}
          <button onClick={logout}>↩ خروج</button>
        </div>
      </section>

      <section className="admin-overview">
        <div>
          <span>إجمالي الحدائق</span>
          <strong>{totals.totalGardens}</strong>
          <em>◌</em>
        </div>
        <div>
          <span>تم ريها</span>
          <strong>{totals.watered}</strong>
          <em>♢</em>
        </div>
        <div>
          <span>لم يتم ريها</span>
          <strong>{totals.notWatered}</strong>
          <em>⌁</em>
        </div>
        <div>
          <span>عدم كفاية ري</span>
          <strong>{totals.insufficient}</strong>
          <em>−</em>
        </div>
        <div>
          <span>خروج الري للرصيف</span>
          <strong>{totals.sidewalk}</strong>
          <em>↪</em>
        </div>
        <div className="ai-overview-card">
          <span>تنبيهات التحقق الذكي</span>
          <strong>{aiAlertReports.length}</strong>
          <em>⚠</em>
        </div>
      </section>

      {isFridayDate(selectedDate) && (
        <section className="friday-off-notice">
          <strong>يوم الجمعة إجازة</strong>
          <span>لا يتم احتساب الحدائق كـ "لم يتم الري" في هذا اليوم.</span>
        </section>
      )}

      {aiAlertReports.length > 0 && (
        <section className="ai-alerts-panel">
          <div className="ai-alerts-head">
            <div>
              <span>مركز التحقق الذكي</span>
              <h2>تنبيهات الصور المشكوك فيها</h2>
              <p>
                يعرض السجلات التي تحتاج مراجعة أو تم رفضها آليًا حسب نتيجة
                التحقق الذكي.
              </p>
            </div>
            <strong>{aiAlertReports.length}</strong>
          </div>

          <div className="ai-alerts-grid">
            {aiAlertReports.map((report) => {
              const garden = getGardenById(report.garden_id);
              const project = garden
                ? getProjectById(garden.project_id)
                : undefined;
              const reportPhotos = photosByReportId.get(report.id) || [];
              const firstPhoto = reportPhotos[0];

const duplicatePhoto =
  reportPhotos.find((photo) => photo.duplicate_of_photo_id) ||
  reportPhotos.find((photo) => photo.image_hash) ||
  firstPhoto;
              const score =
                typeof report.ai_review_score === "number"
                  ? `${Math.round(report.ai_review_score * 100)}%`
                  : "غير محدد";

              return (
                <article
                  key={report.id}
                  className={`ai-alert-card ${report.ai_review_status === "rejected" ? "rejected" : "review"}`}
                >
                  <div className="ai-alert-image">
                    {firstPhoto?.file_url ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(firstPhoto.file_url)}
                      >
                        <img
                          src={firstPhoto.file_url}
                          alt={garden?.name || "صورة التحقق"}
                        />
                        <span>معاينة</span>
                      </button>
                    ) : (
                      <div>لا توجد صورة</div>
                    )}
                  </div>

                  <div className="ai-alert-content">
                    <div className="ai-alert-title-row">
                      <h3>{garden?.name || "حديقة غير معروفة"}</h3>
                      <span>
                        {report.ai_review_status === "rejected"
                          ? "مرفوض"
                          : "يحتاج مراجعة"}
                      </span>
                    </div>
                    <p>{project?.name || "مشروع غير معروف"}</p>
                    <ul>
                      <li>
                        درجة الثقة: <strong>{score}</strong>
                      </li>
                      <li>
                        الوقت:{" "}
                        <strong>{formatDateTime(report.created_at)}</strong>
                      </li>
                      <li>
                        السبب:{" "}
                        <strong>
                          {report.ai_review_reason || "لم يتم تسجيل سبب تفصيلي"}
                        </strong>
                      </li>
                    </ul>

                    {isManager && (
                      <div className="ai-alert-actions">
                        {duplicatePhoto && String(report.ai_review_reason || report.ai_flags || '').includes('مكررة') && (
  <button onClick={() => openDuplicateViewer(duplicatePhoto)}>
    🔍 عرض الصورة المطابقة
  </button>
)}
                        <button onClick={() => approveAiReview(report.id)}>
                          اعتماد الصورة
                        </button>
                        <button onClick={() => escalateAiReview(report)}>
                          تسجيل مخالفة
                        </button>
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
            const projectGardens = gardens.filter(
              (garden) => garden.project_id === project.id,
            );
            const friday = isFridayDate(selectedDate);
            const wateredGardens = friday
              ? []
              : projectGardens.filter((garden) =>
                  wateredGardenIds.has(garden.id),
                );
            const notWateredGardens = friday
              ? []
              : projectGardens.filter(
                  (garden) => !wateredGardenIds.has(garden.id),
                );

            const insufficientGardens = wateredGardens.filter((garden) => {
              const report = reportByGardenId.get(garden.id);
              return getReportStatus(report) === "insufficient";
            });

            const sidewalkGardens = wateredGardens.filter((garden) => {
              const report = reportByGardenId.get(garden.id);
              return getReportStatus(report) === "sidewalk_runoff";
            });

            const isOpen = openProjectId === project.id;

            return (
              <article
                key={project.id}
                className="admin-project-card project-click-card"
              >
                <div
                  className="project-header"
                  onClick={() => openProject(project.id)}
                >
                  <div className="project-number-badge">
                    {wateredGardens.length}
                  </div>
                  <div>
                    <h2>{project.name}</h2>
                    <p>{project.district || "بدون نطاق"}</p>
                  </div>
                </div>

                <div
                  className="project-daily-meter"
                  aria-label="مؤشر حالة الري اليومي"
                >
                  <div className="meter-track">
                    <span
                      className="meter-segment meter-watered"
                      style={{
                        width: `${projectGardens.length ? (wateredGardens.length / projectGardens.length) * 100 : 0}%`,
                      }}
                    />
                    <span
                      className="meter-segment meter-not-watered"
                      style={{
                        width: `${projectGardens.length ? (notWateredGardens.length / projectGardens.length) * 100 : 0}%`,
                      }}
                    />
                    <span
                      className="meter-segment meter-insufficient"
                      style={{
                        width: `${projectGardens.length ? (insufficientGardens.length / projectGardens.length) * 100 : 0}%`,
                      }}
                    />
                    <span
                      className="meter-segment meter-sidewalk"
                      style={{
                        width: `${projectGardens.length ? (sidewalkGardens.length / projectGardens.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="meter-legend">
                    <span>
                      <i className="legend-watered" />
                      تم الري {wateredGardens.length}
                    </span>
                    <span>
                      <i className="legend-not-watered" />
                      لم يتم {notWateredGardens.length}
                    </span>
                    <span>
                      <i className="legend-insufficient" />
                      عدم كفاية {insufficientGardens.length}
                    </span>
                    <span>
                      <i className="legend-sidewalk" />
                      خروج للرصيف {sidewalkGardens.length}
                    </span>
                  </div>
                </div>

                {isOpen && (
                  <>
                    <div className="project-stats">
                      <button
                        className="stat-button"
                        onClick={() => toggleSection("watered")}
                      >
                        <span>تم ريها</span>
                        <strong>{wateredGardens.length}</strong>
                      </button>
                      <button
                        className="stat-button"
                        onClick={() => toggleSection("not_watered")}
                      >
                        <span>لم يتم ريها</span>
                        <strong>{notWateredGardens.length}</strong>
                      </button>
                      <button
                        className="stat-button"
                        onClick={() => toggleSection("insufficient")}
                      >
                        <span>عدم كفاية ري</span>
                        <strong>{insufficientGardens.length}</strong>
                      </button>
                      <button
                        className="stat-button"
                        onClick={() => toggleSection("sidewalk")}
                      >
                        <span>خروج الري للرصيف</span>
                        <strong>{sidewalkGardens.length}</strong>
                      </button>
                    </div>

                    {openSection === "watered" && (
                      <section className="details-section">
                        <h3>تفاصيل الحدائق التي تم ريها</h3>

                        {wateredGardens.length ? (
                          <div className="report-cards-grid">
                            {wateredGardens.map((garden) => {
                              const report = reportByGardenId.get(garden.id);
                              if (!report) return null;

                              const reportPhotos =
                                photosByReportId.get(report.id) || [];
                              const currentStatus = getReportStatus(report);

                              return (
                                <div key={garden.id} className="report-card">
                                  {isManager && (
                                    <button
                                      className="card-more-btn"
                                      onClick={() =>
                                        openEditRecord(garden, project, report)
                                      }
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
                                    <p>
                                      التاريخ/الوقت:{" "}
                                      {formatDateTime(report.created_at)}
                                    </p>
                                    <p>
                                      حالة الري: {statusLabel(currentStatus)}
                                    </p>
                                    <p>
                                      الملاحظات:{" "}
                                      {report.admin_note ||
                                        report.notes ||
                                        report.insufficient_note ||
                                        report.sidewalk_runoff_note ||
                                        "لا توجد"}
                                    </p>
                                  </div>

                                  <div className="report-photo-strip">
                                    {reportPhotos.length ? (
                                      reportPhotos.map((photo, index) => (
                                        <button
                                          type="button"
                                          className="report-photo-preview-btn"
                                          key={
                                            photo.id ||
                                            `${photo.file_url}-${index}`
                                          }
                                          onClick={() =>
                                            setPreviewImageUrl(photo.file_url)
                                          }
                                          title="معاينة الصورة بالحجم الكامل"
                                        >
                                          <img
                                            src={photo.file_url}
                                            alt={`${garden.name} ${index + 1}`}
                                          />
                                          <span>تكبير الصورة</span>
                                        </button>
                                      ))
                                    ) : (
                                      <div className="no-image">
                                        لا توجد صورة
                                      </div>
                                    )}
                                  </div>

                                  {isManager && (
                                    <div className="report-actions-4">
                                      <button
                                        onClick={() =>
                                          updateReportStatus(
                                            report.id,
                                            "watered",
                                          )
                                        }
                                      >
                                        تم الري
                                      </button>
                                      <button
                                        onClick={() =>
                                          updateReportStatus(
                                            report.id,
                                            "not_watered",
                                          )
                                        }
                                      >
                                        لم يتم الري
                                      </button>
                                      <button
                                        onClick={() =>
                                          updateReportStatus(
                                            report.id,
                                            "insufficient",
                                          )
                                        }
                                      >
                                        عدم كفاية ري
                                      </button>
                                      <button
                                        onClick={() =>
                                          updateReportStatus(
                                            report.id,
                                            "sidewalk",
                                          )
                                        }
                                      >
                                        خروج الري للرصيف
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="empty-list">
                            لا توجد تسجيلات ري لهذا اليوم
                          </p>
                        )}
                      </section>
                    )}

                    {openSection === "not_watered" && (
                      <section className="details-section">
                        <h3>الحدائق التي لم يتم ريها</h3>
                        {notWateredGardens.length ? (
                          <div className="not-watered-grid">
                            {notWateredGardens.map((garden) => {
                              const report = reportByGardenId.get(garden.id);
                              return (
                                <div
                                  className="not-watered-card"
                                  key={garden.id}
                                >
                                  <strong>{garden.name}</strong>
                                  <span>
                                    {report?.admin_note ||
                                      report?.notes ||
                                      "لا توجد ملاحظات"}
                                  </span>
                                  {isManager && (
                                    <button
                                      onClick={() =>
                                        openEditRecord(garden, project, report)
                                      }
                                    >
                                      تعديل السجل
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="all-done">
                            تم ري جميع حدائق المشروع في هذا اليوم
                          </p>
                        )}
                      </section>
                    )}

                    {openSection === "insufficient" && (
                      <section className="details-section">
                        <h3>الحدائق عليها عدم كفاية ري</h3>
                        {insufficientGardens.length ? (
                          <ul>
                            {insufficientGardens.map((garden) => (
                              <li key={garden.id}>{garden.name}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="empty-list">
                            لا توجد حدائق عليها عدم كفاية ري
                          </p>
                        )}
                      </section>
                    )}

                    {openSection === "sidewalk" && (
                      <section className="details-section">
                        <h3>الحدائق عليها خروج ري للرصيف</h3>
                        {sidewalkGardens.length ? (
                          <ul>
                            {sidewalkGardens.map((garden) => (
                              <li key={garden.id}>{garden.name}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="empty-list">
                            لا توجد حدائق عليها خروج ري للرصيف
                          </p>
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

      {showAuditModal && isManager && (
        <div
          className="edit-modal-backdrop"
          onClick={() => setShowAuditModal(false)}
        >
          <section
            className="edit-modal audit-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="edit-modal-head">
              <h2>سجل التعديلات والتراجع</h2>
              <button onClick={() => setShowAuditModal(false)}>×</button>
            </div>

            <p className="edit-modal-subtitle">
              راجع تعديلات اليوم أو مشروع محدد، ثم اضغط تراجع لإعادة السجل إلى
              حالته السابقة.
            </p>

            <div className="audit-filters-grid">
              <label>
                <span>تاريخ التعديل</span>
                <input
                  type="date"
                  value={auditDateFilter}
                  onChange={(e) => setAuditDateFilter(e.target.value)}
                />
              </label>

              <label>
                <span>المشروع</span>
                <select
                  value={auditProjectFilter}
                  onChange={(e) => setAuditProjectFilter(e.target.value)}
                >
                  <option value="all">كل المشاريع</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="audit-refresh-btn"
                onClick={loadAuditLogs}
                disabled={auditLoading}
              >
                {auditLoading ? "جارٍ التحميل..." : "عرض السجل"}
              </button>
            </div>

            <div className="audit-list">
              {auditLogs.length ? (
                auditLogs.map((log) => {
                  const garden = log.garden_id
                    ? getGardenById(log.garden_id)
                    : undefined;
                  const project = log.project_id
                    ? getProjectById(log.project_id)
                    : undefined;

                  return (
                    <article
                      className={`audit-card ${log.undone ? "undone" : ""}`}
                      key={log.id}
                    >
                      <div>
                        <h3>{auditActionLabel(log.action)}</h3>
                        <p>
                          {project?.name || "مشروع غير محدد"} /{" "}
                          {garden?.name || "حديقة غير محددة"}
                        </p>
                        <small>
                          {formatDateTime(log.created_at)} — بواسطة{" "}
                          {log.changed_by || "غير محدد"}
                        </small>
                        {log.undone && (
                          <strong className="audit-undone-label">
                            تم التراجع
                          </strong>
                        )}
                      </div>

                      <button
                        onClick={() => undoAuditLog(log)}
                        disabled={
                          Boolean(log.undone) || undoingAuditId === log.id
                        }
                      >
                        {undoingAuditId === log.id
                          ? "جارٍ التراجع..."
                          : "تراجع"}
                      </button>
                    </article>
                  );
                })
              ) : (
                <p className="empty-list">
                  لا توجد تعديلات مسجلة لهذا اليوم أو المشروع.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {showExecutiveModal && isManager && (
        <div
          className="edit-modal-backdrop"
          onClick={() => setShowExecutiveModal(false)}
        >
          <section
            className="edit-modal"
            style={{
              width: "min(1240px, 96vw)",
              maxHeight: "92vh",
              overflow: "auto",
              borderRadius: 34,
              padding: 0,
              background:
                "radial-gradient(circle at 20% 10%, rgba(255,232,168,.52), transparent 26%), linear-gradient(135deg, #062b24 0%, #0b4a38 38%, #f7edd0 100%)",
              border: "1px solid rgba(255, 239, 190, .65)",
              boxShadow: "0 28px 80px rgba(6,43,36,.35)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                padding: "28px 32px",
                color: "white",
                display: "flex",
                justifyContent: "space-between",
                gap: 18,
                alignItems: "flex-start",
              }}
            >
              <div>
                <span
                  style={{
                    display: "inline-flex",
                    padding: "8px 16px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,.15)",
                    border: "1px solid rgba(255,255,255,.25)",
                    fontWeight: 900,
                    marginBottom: 12,
                  }}
                >
                  مركز القرار التنفيذي
                </span>
                <h2 style={{ margin: 0, fontSize: 34 }}>
                  لوحة المؤشرات التنفيذية
                </h2>
                <p style={{ margin: "8px 0 0", opacity: .86, fontWeight: 700 }}>
                  ترتيب المشاريع، أفضل أداء، أعلى تعثر، وإجمالي الغرامات حسب الفترة المحددة.
                </p>
              </div>

              <button
                onClick={() => setShowExecutiveModal(false)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  border: "none",
                  background: "rgba(255,255,255,.18)",
                  color: "white",
                  fontSize: 24,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                margin: "0 22px 22px",
                padding: 22,
                borderRadius: 28,
                background: "rgba(255,255,255,.92)",
                backdropFilter: "blur(16px)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
                  gap: 14,
                  marginBottom: 18,
                }}
              >
                <label>
                  <span>من تاريخ</span>
                  <input
                    type="date"
                    value={executiveFromDate}
                    onChange={(e) => setExecutiveFromDate(e.target.value)}
                  />
                </label>
                <label>
                  <span>إلى تاريخ</span>
                  <input
                    type="date"
                    value={executiveToDate}
                    onChange={(e) => setExecutiveToDate(e.target.value)}
                  />
                </label>
                <label>
                  <span>غرامة لم يتم الري</span>
                  <input
                    type="number"
                    min="0"
                    value={notWateredFine}
                    onChange={(e) => setNotWateredFine(Number(e.target.value))}
                  />
                </label>
                <button
                  onClick={loadExecutiveDashboard}
                  disabled={executiveLoading}
                  style={{
                    alignSelf: "end",
                    border: "none",
                    borderRadius: 16,
                    padding: "14px 18px",
                    background: "#0d6b4d",
                    color: "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {executiveLoading ? "جارٍ التحليل..." : "تحديث المؤشرات"}
                </button>
              </div>

              {executiveError && <p className="report-error">{executiveError}</p>}

              {executiveRows.length > 0 &&
                (() => {
                  const totalRequired = executiveRows.reduce((sum, row) => sum + row.required, 0);
                  const totalWatered = executiveRows.reduce((sum, row) => sum + row.watered, 0);
                  const totalViolations = executiveRows.reduce((sum, row) => sum + row.violations, 0);
                  const totalFines = executiveRows.reduce((sum, row) => sum + row.fines, 0);
                  const overallRate = totalRequired
                    ? Math.round((totalWatered / totalRequired) * 100)
                    : 0;
                  const bestProject = executiveRows
                    .filter((row) => row.required > 0)
                    .sort((a, b) => b.achievementRate - a.achievementRate)[0];
                  const worstProject = executiveRows
                    .filter((row) => row.required > 0)
                    .sort((a, b) => a.achievementRate - b.achievementRate)[0];
                  const highestFineProject = [...executiveRows].sort((a, b) => b.fines - a.fines)[0];

                  const kpiStyle = {
                    borderRadius: 24,
                    padding: 20,
                    background: "linear-gradient(180deg, #ffffff, #fbf5e6)",
                    border: "1px solid #eadfbc",
                    boxShadow: "0 14px 32px rgba(6,43,36,.08)",
                  };

                  return (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.1fr repeat(3, 1fr)",
                          gap: 16,
                          marginBottom: 18,
                        }}
                      >
                        <div
                          style={{
                            ...kpiStyle,
                            background:
                              "radial-gradient(circle at 15% 15%, rgba(255,211,105,.38), transparent 32%), linear-gradient(135deg, #062b24, #0f6f52)",
                            color: "white",
                          }}
                        >
                          <span style={{ opacity: .86, fontWeight: 800 }}>نسبة الإنجاز العامة</span>
                          <strong style={{ display: "block", fontSize: 54, lineHeight: 1, marginTop: 12 }}>
                            {overallRate}%
                          </strong>
                          <small style={{ display: "block", marginTop: 10, opacity: .9 }}>
                            {formatMoney(totalWatered)} / {formatMoney(totalRequired)} عملية مطلوبة
                          </small>
                        </div>

                        <div style={kpiStyle}>
                          <span style={{ color: "#0f7a53", fontWeight: 900 }}>أفضل مشروع</span>
                          <strong style={{ display: "block", fontSize: 22, marginTop: 10, color: "#062b24" }}>
                            {bestProject?.projectName || "-"}
                          </strong>
                          <small style={{ color: "#55706a", fontWeight: 800 }}>
                            إنجاز {bestProject?.achievementRate || 0}%
                          </small>
                        </div>

                        <div style={kpiStyle}>
                          <span style={{ color: "#be123c", fontWeight: 900 }}>أسوأ مشروع</span>
                          <strong style={{ display: "block", fontSize: 22, marginTop: 10, color: "#062b24" }}>
                            {worstProject?.projectName || "-"}
                          </strong>
                          <small style={{ color: "#55706a", fontWeight: 800 }}>
                            إنجاز {worstProject?.achievementRate || 0}%
                          </small>
                        </div>

                        <div style={kpiStyle}>
                          <span style={{ color: "#9a3412", fontWeight: 900 }}>أعلى غرامات</span>
                          <strong style={{ display: "block", fontSize: 22, marginTop: 10, color: "#7f1d1d" }}>
                            {highestFineProject?.projectName || "-"}
                          </strong>
                          <small style={{ color: "#9a3412", fontWeight: 900 }}>
                            {formatMoney(highestFineProject?.fines || 0)} ريال
                          </small>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.35fr .65fr",
                          gap: 16,
                          marginBottom: 18,
                        }}
                      >
                        <div style={kpiStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                            <strong>مؤشر الأداء العام</strong>
                            <span style={{ fontWeight: 900 }}>{overallRate}%</span>
                          </div>
                          <div
                            style={{
                              height: 26,
                              borderRadius: 999,
                              overflow: "hidden",
                              background: "#efe7d4",
                              display: "flex",
                            }}
                          >
                            <span
                              style={{
                                width: `${overallRate}%`,
                                background: "linear-gradient(90deg, #0f7a53, #24b47e)",
                              }}
                            />
                            <span
                              style={{
                                width: `${Math.max(0, 100 - overallRate)}%`,
                                background: "linear-gradient(90deg, #f59e0b, #be123c)",
                              }}
                            />
                          </div>
                          <div
                            style={{
                              marginTop: 14,
                              display: "grid",
                              gridTemplateColumns: "repeat(4, 1fr)",
                              gap: 10,
                              textAlign: "center",
                            }}
                          >
                            <div><strong>{formatMoney(totalRequired)}</strong><br /><small>المطلوب</small></div>
                            <div><strong>{formatMoney(totalWatered)}</strong><br /><small>تم الري</small></div>
                            <div><strong>{formatMoney(totalViolations)}</strong><br /><small>مخالفات</small></div>
                            <div><strong>{formatMoney(totalFines)} ريال</strong><br /><small>غرامات</small></div>
                          </div>
                        </div>

                        <div
                          style={{
                            ...kpiStyle,
                            textAlign: "center",
                            background: "linear-gradient(180deg, #fff7ed, #ffffff)",
                          }}
                        >
                          <span style={{ color: "#9a3412", fontWeight: 900 }}>الأثر المالي</span>
                          <strong style={{ display: "block", fontSize: 34, color: "#7f1d1d", marginTop: 12 }}>
                            {formatMoney(totalFines)}
                          </strong>
                          <small style={{ color: "#9a3412", fontWeight: 900 }}>ريال إجمالي الغرامات</small>
                        </div>
                      </div>

                      <div style={kpiStyle}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                          <h3 style={{ margin: 0 }}>ترتيب المشاريع حسب الإنجاز</h3>
                          <span style={{ color: "#55706a", fontWeight: 800 }}>
                            من {executiveFromDate} إلى {executiveToDate}
                          </span>
                        </div>

                        <div style={{ display: "grid", gap: 12 }}>
                          {executiveRows.map((row, index) => (
                            <div
                              key={row.projectId}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "46px 1.2fr 1.6fr 120px 130px",
                                gap: 12,
                                alignItems: "center",
                                padding: "14px 16px",
                                borderRadius: 18,
                                background:
                                  index === 0
                                    ? "linear-gradient(90deg, rgba(15,122,83,.14), #fff)"
                                    : index === executiveRows.length - 1
                                      ? "linear-gradient(90deg, rgba(190,18,60,.12), #fff)"
                                      : "#fff",
                                border: "1px solid #eadfbc",
                              }}
                            >
                              <strong
                                style={{
                                  width: 38,
                                  height: 38,
                                  display: "grid",
                                  placeItems: "center",
                                  borderRadius: 999,
                                  background: index === 0 ? "#0f7a53" : "#f8f1dc",
                                  color: index === 0 ? "white" : "#7c4a03",
                                }}
                              >
                                {index + 1}
                              </strong>

                              <div>
                                <strong style={{ color: "#062b24" }}>{row.projectName}</strong>
                                <small style={{ display: "block", color: "#55706a", marginTop: 4 }}>
                                  {row.totalGardens} حديقة × {row.workingDays} أيام عمل
                                </small>
                              </div>

                              <div>
                                <div
                                  style={{
                                    height: 14,
                                    borderRadius: 999,
                                    overflow: "hidden",
                                    background: "#efe7d4",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "block",
                                      height: "100%",
                                      width: `${row.achievementRate}%`,
                                      background: "linear-gradient(90deg, #0f7a53, #24b47e)",
                                    }}
                                  />
                                </div>
                                <small style={{ color: "#55706a", fontWeight: 800 }}>
                                  {formatMoney(row.watered)} / {formatMoney(row.required)} عملية ري
                                </small>
                              </div>

                              <strong style={{ fontSize: 22, color: row.achievementRate >= 85 ? "#0f7a53" : row.achievementRate >= 60 ? "#b45309" : "#be123c" }}>
                                {row.achievementRate}%
                              </strong>

                              <div style={{ textAlign: "center" }}>
                                <strong style={{ color: "#7f1d1d" }}>{formatMoney(row.fines)} ريال</strong>
                                <small style={{ display: "block", color: "#55706a" }}>
                                  {formatMoney(row.violations)} مخالفة
                                </small>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  );
                })()}
            </div>
          </section>
        </div>
      )}

      {showReportModal && (
        <div
          className="edit-modal-backdrop"
          onClick={() => setShowReportModal(false)}
        >
          <section
            className="edit-modal report-modal"
            onClick={(event) => event.stopPropagation()}
          >
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
                <input
                  type="date"
                  value={reportFromDate}
                  onChange={(e) => setReportFromDate(e.target.value)}
                />
              </label>

              <label>
                <span>إلى تاريخ</span>
                <input
                  type="date"
                  value={reportToDate}
                  onChange={(e) => setReportToDate(e.target.value)}
                />
              </label>

              <label>
                <span>المشروع</span>
                <select
                  value={reportProjectId}
                  onChange={(e) => setReportProjectId(e.target.value)}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="report-fines-grid">
              <label>
                <span>غرامة لم يتم الري</span>
                <input
                  type="number"
                  min="0"
                  value={notWateredFine}
                  onChange={(e) => setNotWateredFine(Number(e.target.value))}
                />
              </label>

              <label>
                <span>غرامة عدم كفاية الري</span>
                <input
                  type="number"
                  min="0"
                  value={insufficientFine}
                  onChange={(e) => setInsufficientFine(Number(e.target.value))}
                />
              </label>

              <label>
                <span>غرامة خروج الري للرصيف</span>
                <input
                  type="number"
                  min="0"
                  value={sidewalkFine}
                  onChange={(e) => setSidewalkFine(Number(e.target.value))}
                />
              </label>
            </div>

            <div className="edit-modal-actions">
              <button onClick={generatePeriodReport} disabled={reportLoading}>
                {reportLoading ? "جارٍ إنشاء التقرير..." : "إنشاء التقرير"}
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

                {(() => {
                  const totalWatered = reportRows.reduce((sum, row) => sum + row.watered, 0);
                  const totalNotWatered = reportRows.reduce((sum, row) => sum + row.notWatered, 0);
                  const totalInsufficient = reportRows.reduce((sum, row) => sum + row.insufficient, 0);
                  const totalSidewalk = reportRows.reduce((sum, row) => sum + row.sidewalk, 0);
                  const workingDays = workingDaysBetweenInclusive(reportFromDate, reportToDate);
                  const requiredWateringTotal = reportRows.length * workingDays;
                  const totalCases = totalWatered + totalNotWatered + totalInsufficient + totalSidewalk;
                  const totalViolations = totalNotWatered + totalInsufficient + totalSidewalk;
                  const totalFines = fineRows.reduce((sum, row) => sum + row.total, 0);
                  const achievementPercent = requiredWateringTotal
                    ? Math.round((totalWatered / requiredWateringTotal) * 100)
                    : 0;
                  const violationPercent = requiredWateringTotal
                    ? Math.round((totalViolations / requiredWateringTotal) * 100)
                    : 0;

                  const cardBase = {
                    border: "1px solid rgba(216, 180, 92, .45)",
                    borderRadius: 18,
                    padding: "16px 14px",
                    background: "linear-gradient(180deg, #ffffff 0%, #fbf7ea 100%)",
                    boxShadow: "0 10px 26px rgba(6, 43, 36, .08)",
                    minHeight: 86,
                  };

                  return (
                    <section
                      className="executive-report-dashboard"
                      style={{
                        margin: "22px 0 26px",
                        padding: 22,
                        borderRadius: 26,
                        border: "2px solid rgba(216, 180, 92, .55)",
                        background:
                          "linear-gradient(135deg, #ffffff 0%, #fff8e6 48%, #f5fbf7 100%)",
                        boxShadow: "0 16px 40px rgba(6, 43, 36, .10)",
                        breakInside: "avoid",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 16,
                          marginBottom: 18,
                        }}
                      >
                        <div>
                          <span
                            style={{
                              display: "inline-flex",
                              padding: "7px 14px",
                              borderRadius: 999,
                              background: "#f8f1dc",
                              color: "#8a5a11",
                              fontWeight: 900,
                              fontSize: 13,
                              marginBottom: 8,
                            }}
                          >
                            لوحة المؤشرات التنفيذية
                          </span>
                          <h3 style={{ margin: 0, fontSize: 24, color: "#062b24" }}>
                            ملخص أداء الري خلال الفترة
                          </h3>
                          <p style={{ margin: "6px 0 0", color: "#55706a", fontWeight: 700 }}>
                            قراءة سريعة للإجمالي المطلوب حسب الفترة، نسبة الإنجاز، وإجمالي الغرامات.
                          </p>
                        </div>

                        <div
                          style={{
                            minWidth: 150,
                            textAlign: "center",
                            padding: "12px 14px",
                            borderRadius: 20,
                            background: "#062b24",
                            color: "white",
                            boxShadow: "0 12px 28px rgba(6, 43, 36, .22)",
                          }}
                        >
                          <span style={{ display: "block", fontSize: 12, opacity: .85 }}>
                            نسبة الإنجاز
                          </span>
                          <strong style={{ display: "block", fontSize: 34, lineHeight: 1.1 }}>
                            {achievementPercent}%
                          </strong>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, minmax(130px, 1fr))",
                          gap: 12,
                          marginBottom: 18,
                        }}
                      >
                        <div style={cardBase}>
                          <span style={{ color: "#0f7a53", fontWeight: 900 }}>تم الري</span>
                          <strong style={{ display: "block", fontSize: 30, marginTop: 8, color: "#062b24" }}>
                            {formatMoney(totalWatered)}
                          </strong>
                        </div>
                        <div style={cardBase}>
                          <span style={{ color: "#9f1239", fontWeight: 900 }}>لم يتم الري</span>
                          <strong style={{ display: "block", fontSize: 30, marginTop: 8, color: "#062b24" }}>
                            {formatMoney(totalNotWatered)}
                          </strong>
                        </div>
                        <div style={cardBase}>
                          <span style={{ color: "#b45309", fontWeight: 900 }}>عدم كفاية الري</span>
                          <strong style={{ display: "block", fontSize: 30, marginTop: 8, color: "#062b24" }}>
                            {formatMoney(totalInsufficient)}
                          </strong>
                        </div>
                        <div style={cardBase}>
                          <span style={{ color: "#854d0e", fontWeight: 900 }}>خروج الري للرصيف</span>
                          <strong style={{ display: "block", fontSize: 30, marginTop: 8, color: "#062b24" }}>
                            {formatMoney(totalSidewalk)}
                          </strong>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "2fr 1fr",
                          gap: 16,
                          alignItems: "stretch",
                        }}
                      >
                        <div
                          style={{
                            borderRadius: 20,
                            padding: 16,
                            background: "rgba(255,255,255,.82)",
                            border: "1px solid #eadfbc",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                            <strong>مؤشر الإنجاز العام</strong>
                            <span style={{ fontWeight: 900 }}>{formatMoney(totalWatered)} / {formatMoney(requiredWateringTotal)}</span>
                          </div>
                          <div
                            style={{
                              height: 22,
                              borderRadius: 999,
                              overflow: "hidden",
                              background: "#eee7d5",
                              display: "flex",
                            }}
                          >
                            <span
                              style={{
                                width: `${achievementPercent}%`,
                                background: "linear-gradient(90deg, #0f7a53, #20a36f)",
                              }}
                            />
                            <span
                              style={{
                                width: `${violationPercent}%`,
                                background: "linear-gradient(90deg, #d97706, #be123c)",
                              }}
                            />
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginTop: 10,
                              fontSize: 13,
                              color: "#55706a",
                              fontWeight: 800,
                            }}
                          >
                            <span>المطلوب للفترة: {formatMoney(requiredWateringTotal)} ({reportRows.length} حديقة × {workingDays} أيام عمل)</span>
                            <span>الأحمر/البرتقالي: حالات تحتاج متابعة</span>
                          </div>
                        </div>

                        <div
                          style={{
                            borderRadius: 20,
                            padding: 16,
                            background: "#fff7ed",
                            border: "1px solid #fed7aa",
                            textAlign: "center",
                          }}
                        >
                          <span style={{ color: "#9a3412", fontWeight: 900 }}>إجمالي الغرامات</span>
                          <strong style={{ display: "block", fontSize: 28, marginTop: 10, color: "#7f1d1d" }}>
                            {formatMoney(totalFines)} ريال
                          </strong>
                          <small style={{ display: "block", marginTop: 8, color: "#9a3412", fontWeight: 800 }}>
                            عدد المخالفات: {formatMoney(totalViolations)}
                          </small>
                        </div>
                      </div>
                    </section>
                  );
                })()}

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
                            <tr
                              key={`${row.gardenName}-${row.violationType}-${index}`}
                            >
                              <td>{row.gardenName}</td>
                              <td>{row.violationType}</td>
                              <td>{row.count}</td>
                              <td>{formatMoney(row.fineAmount)} ريال</td>
                              <td>{formatMoney(row.total)} ريال</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5}>
                              لا توجد غرامات خلال الفترة المحددة
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="total-fines-card">
                    <span>إجمالي الغرامات لكافة الحدائق</span>
                    <strong>
                      {formatMoney(
                        fineRows.reduce((sum, row) => sum + row.total, 0),
                      )}{" "}
                      ريال
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {showContractorLinksModal && isManager && (
        <div
          className="edit-modal-backdrop"
          onClick={() => setShowContractorLinksModal(false)}
        >
          <section
            className="edit-modal contractor-links-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="edit-modal-head">
              <h2>إدارة روابط المقاولين</h2>
              <button onClick={() => setShowContractorLinksModal(false)}>
                ×
              </button>
            </div>

            <p className="edit-modal-subtitle">
              عدّل اسم المسؤول ورمز الدخول لكل مشروع، ثم انسخ الرابط للمقاول.
            </p>

            <div className="contractor-links-list">
              {projects.map((project) => {
                const draft = contractorDrafts[project.id] || {
                  manager_name: project.manager_name || "",
                  contractor_code: project.contractor_code || "",
                };

                return (
                  <div className="contractor-link-card" key={project.id}>
                    <div className="contractor-link-head">
                      <div>
                        <h3>{project.name}</h3>
                        <p>{project.district || "بدون نطاق"}</p>
                      </div>
                      <span>{project.slug}</span>
                    </div>

                    <label>
                      <span>اسم المسؤول الثابت</span>
                      <input
                        value={draft.manager_name}
                        placeholder="مثال: مدير مشروع المخططات"
                        onChange={(e) =>
                          updateContractorDraft(project.id, {
                            manager_name: e.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      <span>رمز دخول المقاول</span>
                      <input
                        value={draft.contractor_code}
                        placeholder="مثال: 1234"
                        onChange={(e) =>
                          updateContractorDraft(project.id, {
                            contractor_code: e.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      <span>رابط المشروع</span>
                      <input value={getContractorLink(project)} readOnly />
                    </label>

                    <div className="contractor-link-actions">
                      <button
                        onClick={() => saveContractorProject(project)}
                        disabled={savingContractorProjectId === project.id}
                      >
                        {savingContractorProjectId === project.id
                          ? "جارٍ الحفظ..."
                          : "حفظ البيانات"}
                      </button>
                      <button onClick={() => copyContractorLink(project)}>
                        نسخ الرابط
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {showPasswordModal && isManager && (
        <div
          className="edit-modal-backdrop"
          onClick={() => setShowPasswordModal(false)}
        >
          <section
            className="edit-modal password-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="edit-modal-head">
              <h2>إدارة كلمات المرور</h2>
              <button onClick={() => setShowPasswordModal(false)}>×</button>
            </div>

            <p className="edit-modal-subtitle">
              تغيير كلمة مرور المدير أو المشرف
            </p>

            <label>
              <span>العضوية</span>
              <select
                value={passwordTarget}
                onChange={(e) =>
                  setPasswordTarget(e.target.value as "manager" | "supervisor")
                }
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
          <section
            className="edit-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="edit-modal-head">
              <h2>تعديل سجل الحديقة</h2>
              <button onClick={() => setEditState(null)}>×</button>
            </div>

            <p className="edit-modal-subtitle">
              {editState.project.name} / {editState.garden.name} /{" "}
              {selectedDate}
            </p>

            <label>
              <span>الحالة</span>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as ReportStatus)}
              >
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
              <p className="edit-upload-status">
                تم اختيار: {editUploadFileName}
              </p>
            )}

            {editPhotoUrls.length > 0 && (
              <div className="edit-photo-preview edit-photo-preview-grid">
                {editPhotoUrls.map((url, index) => (
                  <div className="edit-photo-thumb" key={`${url}-${index}`}>
                    <img
                      src={url}
                      alt={`معاينة الصورة ${index + 1}`}
                      onClick={() => setPreviewImageUrl(url)}
                    />
                    {editNewPhotoUrls.includes(url) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditPhotoUrls((prev) =>
                            prev.filter((item) => item !== url),
                          );
                          setEditNewPhotoUrls((prev) =>
                            prev.filter((item) => item !== url),
                          );
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
              <button
                onClick={saveEditedRecord}
                disabled={editSaving || editUploading}
              >
                {editSaving
                  ? "جارٍ الحفظ..."
                  : editUploading
                    ? "انتظر رفع الصورة..."
                    : "حفظ التعديل"}
              </button>
              <button onClick={() => setEditState(null)}>إلغاء</button>
            </div>
          </section>
        </div>
      )}

      {previewImageUrl && (
        <div
          className="image-preview-backdrop"
          onClick={() => setPreviewImageUrl(null)}
        >
          <section
            className="image-preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="image-preview-close"
              onClick={() => setPreviewImageUrl(null)}
            >
              ×
            </button>
            <img src={previewImageUrl} alt="معاينة الصورة بالحجم الكامل" />
          </section>
        </div>
      )}
      {duplicateViewer && (
        <div
          className="image-preview-backdrop"
          onClick={() => setDuplicateViewer(null)}
        >
          <section
            className="duplicate-viewer-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="image-preview-close"
              onClick={() => setDuplicateViewer(null)}
            >
              ×
            </button>

            <div className="duplicate-viewer-head">
              <div>
                <span className="duplicate-badge">مقارنة الصور المكررة</span>
                <h2>
                  {duplicateViewer.currentGarden?.name || "الحديقة الحالية"}
                  {" ↔ "}
                  {duplicateViewer.matchCount || 0} سجل مطابق
                </h2>
                <p>
                  تم العثور على {duplicateViewer.matchCount || 0} سجلات مطابقة لنفس بصمة الصورة.
                  استخدم هذه النافذة لمراجعة السجل الحالي وجميع السجلات السابقة المطابقة.
                </p>
              </div>

              <div className="duplicate-head-actions">
                <button
                  onClick={() => window.print()}
                  className="duplicate-print-btn"
                >
                  🖨️ طباعة / حفظ PDF
                </button>
              </div>
            </div>

            <div className="duplicate-summary-box">
              <div>
                <span>السجل الحالي</span>
                <strong>{duplicateViewer.currentGarden?.name || "غير معروف"}</strong>
                <small>{duplicateViewer.currentProject?.name || "مشروع غير معروف"}</small>
              </div>

              <div>
                <span>تاريخ السجل الحالي</span>
                <strong>{duplicateViewer.currentReport?.report_date || selectedDate}</strong>
              </div>

              <div>
                <span>عدد السجلات المطابقة</span>
                <strong>{duplicateViewer.matchCount || 0}</strong>
              </div>

              <div>
                <span>نوع التطابق</span>
                <strong>
                  {duplicateViewer.matchType?.includes("different_report")
                    ? "تطابق كامل في سجل آخر"
                    : duplicateViewer.matchType?.includes("same_garden")
                      ? "تطابق كامل لنفس الحديقة"
                      : "تطابق كامل للبصمة"}
                </strong>
              </div>
            </div>

            <div className="duplicate-grid">
              <div className="duplicate-photo-box">
                <h3>الصورة الحالية</h3>
                <img src={duplicateViewer.currentPhoto.file_url} alt="الصورة الحالية" />
                <div className="duplicate-photo-meta">
                  <p>
                    الحديقة:
                    <strong>{duplicateViewer.currentGarden?.name || "غير معروف"}</strong>
                  </p>
                  <p>
                    المشروع:
                    <strong>{duplicateViewer.currentProject?.name || "غير معروف"}</strong>
                  </p>
                  <p>
                    التاريخ:
                    <strong>{duplicateViewer.currentReport?.report_date || selectedDate}</strong>
                  </p>
                </div>
              </div>

              <div className="duplicate-photo-box">
                <h3>أول صورة مطابقة</h3>
                <img src={duplicateViewer.matches?.[0]?.photo?.file_url} alt="أول صورة مطابقة" />
                <div className="duplicate-photo-meta">
                  <p>
                    الحديقة المطابقة:
                    <strong>{duplicateViewer.matches?.[0]?.garden?.name || "غير معروف"}</strong>
                  </p>
                  <p>
                    المشروع المطابق:
                    <strong>{duplicateViewer.matches?.[0]?.project?.name || "غير معروف"}</strong>
                  </p>
                  <p>
                    تاريخ السجل:
                    <strong>{duplicateViewer.matches?.[0]?.report?.report_date || "-"}</strong>
                  </p>
                </div>
              </div>
            </div>

            <div
              className="duplicate-summary-box"
              style={{ gridTemplateColumns: "1fr", textAlign: "right" }}
            >
              <div>
                <span>جميع السجلات المطابقة</span>
                <strong>راجع كل سجل مطابق للتأكد قبل تسجيل المخالفة</strong>
              </div>
            </div>

            <div
              className="duplicate-grid"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
            >
              {duplicateViewer.matches?.map((match: any, index: number) => (
                <div className="duplicate-photo-box" key={match.photo.id}>
                  <h3>مطابقة رقم {index + 1}</h3>
                  <img src={match.photo.file_url} alt={`صورة مطابقة ${index + 1}`} />
                  <div className="duplicate-photo-meta">
                    <p>
                      الحديقة:
                      <strong>{match.garden?.name || "غير معروف"}</strong>
                    </p>
                    <p>
                      المشروع:
                      <strong>{match.project?.name || "غير معروف"}</strong>
                    </p>
                    <p>
                      تاريخ السجل:
                      <strong>{match.report?.report_date || "-"}</strong>
                    </p>
                    <p>
                      التطابق:
                      <strong>{match.photo.duplicate_match_score || duplicateViewer.matchScore || 100}%</strong>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
