"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ProjectOption = { id: string; name: string };
type GardenOption = { id: string; project_id: string; name: string };
type ScopeMode = "all" | "selected";

type BackfillRow = {
  window_id: string;
  project_id: string;
  project_name: string;
  report_date: string;
  scope_mode: ScopeMode;
  selected_gardens: number | null;
  active: boolean;
  opens_at: string;
  closes_at: string;
  opened_by: string | null;
  note: string | null;
};

type Props = {
  projects: ProjectOption[];
  gardens: GardenOption[];
  openedBy: string;
};

function makkahToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ar-SA", {
    timeZone: "Asia/Riyadh",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function BackfillAdminPanel({ projects, gardens, openedBy }: Props) {
  const [projectId, setProjectId] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hours, setHours] = useState(6);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<BackfillRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const projectGardens = useMemo(
    () => gardens.filter((garden) => garden.project_id === projectId),
    [gardens, projectId],
  );

  const filteredGardens = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projectGardens;
    return projectGardens.filter((garden) =>
      garden.name.toLowerCase().includes(normalized),
    );
  }, [projectGardens, query]);

  useEffect(() => {
    setSelectedIds([]);
    setQuery("");
  }, [projectId]);

  async function loadHistory() {
    setHistoryLoading(true);
    const { data, error } = await supabase.rpc("list_daily_report_backfills", {
      p_project_id: null,
    });
    setHistoryLoading(false);
    if (error) {
      setMessage(`تعذر تحميل سجل التعويض: ${error.message}`);
      return;
    }
    setHistory((data || []) as BackfillRow[]);
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  function toggleGarden(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function openBackfill() {
    setMessage("");

    if (!projectId || !reportDate) {
      setMessage("اختر المشروع وتاريخ التقرير السابق.");
      return;
    }
    if (reportDate >= makkahToday()) {
      setMessage("التعويض مخصص لتاريخ سابق فقط.");
      return;
    }
    if (scopeMode === "selected" && selectedIds.length === 0) {
      setMessage("اختر حديقة واحدة على الأقل.");
      return;
    }

    setLoading(true);
    const closesAt = new Date(
      Date.now() + Math.max(1, Math.min(hours || 1, 48)) * 60 * 60 * 1000,
    ).toISOString();

    const { error } = await supabase.rpc("open_daily_report_backfill", {
      p_project_id: projectId,
      p_report_date: reportDate,
      p_closes_at: closesAt,
      p_scope_mode: scopeMode,
      p_selected_garden_ids: scopeMode === "selected" ? selectedIds : null,
      p_note: note.trim() || null,
      p_opened_by: openedBy || "مدير النظام",
    });
    setLoading(false);

    if (error) {
      const text = error.message;
      if (text.includes("REPORT_ALREADY_EXISTS")) {
        setMessage("يوجد تقرير معتمد بالفعل لهذا المشروع في التاريخ المختار.");
      } else if (text.includes("SELECT_AT_LEAST_ONE")) {
        setMessage("اختر حديقة واحدة على الأقل.");
      } else if (text.includes("BACKFILL_DATE_MUST_BE_IN_THE_PAST")) {
        setMessage("اختر تاريخًا سابقًا لتاريخ اليوم.");
      } else {
        setMessage(`تعذر فتح التعويض: ${text}`);
      }
      return;
    }

    setMessage(
      scopeMode === "selected"
        ? `تم فتح التعويض لـ ${selectedIds.length} حديقة مختارة.`
        : "تم فتح التعويض لكامل المواقع المجدولة في التاريخ المختار.",
    );
    setSelectedIds([]);
    setNote("");
    await loadHistory();
  }

  async function closeBackfill(windowId: string) {
    if (!confirm("هل تريد إغلاق نافذة التعويض الآن؟")) return;
    const { error } = await supabase.rpc("close_daily_report_backfill", {
      p_window_id: windowId,
    });
    if (error) {
      setMessage(`تعذر إغلاق التعويض: ${error.message}`);
      return;
    }
    setMessage("تم إغلاق نافذة التعويض.");
    await loadHistory();
  }

  const activeCount = history.filter((item) => item.active).length;
  const completedCount = history.filter((item) => !item.active).length;

  return (
    <section className="inline-admin-panel management-pro-panel backfill-admin-panel" dir="rtl">
      <div className="panel-headline">
        <span>التقارير السابقة</span>
        <h2>إدارة تقارير التعويض</h2>
      </div>

      <div className="admin-stats-ribbon backfill-stats">
        <div><em>◷</em><span>نوافذ مفتوحة</span><strong>{activeCount}</strong></div>
        <div><em>✓</em><span>نوافذ مغلقة</span><strong>{completedCount}</strong></div>
        <div><em>▦</em><span>المشاريع</span><strong>{projects.length}</strong></div>
        <div><em>☘</em><span>المواقع</span><strong>{gardens.length}</strong></div>
      </div>

      <div className="backfill-create-card">
        <div className="backfill-card-title">
          <div>
            <span>فتح نافذة جديدة</span>
            <h3>تقرير تعويض مؤقت</h3>
          </div>
          <p>يظهر للمقاول التاريخ والمواقع المحددة فقط، وتُغلق النافذة تلقائيًا بعد الإرسال أو انتهاء المدة.</p>
        </div>

        <div className="inline-form-grid backfill-form-grid">
          <label>
            <span>المشروع</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">اختر المشروع</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>تاريخ التقرير السابق</span>
            <input
              type="date"
              max={makkahToday()}
              value={reportDate}
              onChange={(event) => setReportDate(event.target.value)}
            />
          </label>

          <label>
            <span>مدة الفتح بالساعات</span>
            <input
              type="number"
              min={1}
              max={48}
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="backfill-scope-options">
          <button
            type="button"
            className={scopeMode === "all" ? "active" : ""}
            onClick={() => setScopeMode("all")}
          >
            <strong>كامل المواقع المجدولة</strong>
            <small>يفتح كل المواقع المطلوبة في التاريخ المختار</small>
          </button>
          <button
            type="button"
            className={scopeMode === "selected" ? "active" : ""}
            onClick={() => setScopeMode("selected")}
          >
            <strong>حدائق مختارة</strong>
            <small>يفتح فقط المواقع التي تحددها الإدارة</small>
          </button>
        </div>

        {scopeMode === "selected" && (
          <div className="backfill-garden-picker">
            {!projectId ? (
              <div className="backfill-empty-picker">اختر المشروع أولًا لعرض حدائقه.</div>
            ) : (
              <>
                <div className="backfill-picker-toolbar">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="ابحث باسم الحديقة أو الموقع"
                  />
                  <button type="button" onClick={() => setSelectedIds(projectGardens.map((garden) => garden.id))}>تحديد الكل</button>
                  <button type="button" onClick={() => setSelectedIds([])}>إلغاء التحديد</button>
                </div>
                <div className="backfill-selection-count">
                  تم اختيار <strong>{selectedIds.length}</strong> من {projectGardens.length}
                </div>
                <div className="backfill-garden-list">
                  {filteredGardens.map((garden) => (
                    <label key={garden.id} className={selectedIds.includes(garden.id) ? "selected" : ""}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(garden.id)}
                        onChange={() => toggleGarden(garden.id)}
                      />
                      <span>{garden.name}</span>
                    </label>
                  ))}
                  {!filteredGardens.length && <p>لا توجد نتائج مطابقة.</p>}
                </div>
              </>
            )}
          </div>
        )}

        <label className="backfill-note-field">
          <span>ملاحظة تظهر للمقاول</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="سبب فتح التعويض أو تعليمات مختصرة للمقاول"
          />
        </label>

        {message && <p className="backfill-admin-message">{message}</p>}

        <button
          type="button"
          className="inline-main-btn backfill-open-button"
          onClick={openBackfill}
          disabled={loading}
        >
          {loading ? "جارٍ فتح التعويض..." : "فتح نافذة التعويض"}
        </button>
      </div>

      <div className="backfill-history-card">
        <div className="backfill-history-head">
          <div>
            <span>السجل</span>
            <h3>نوافذ التعويض السابقة والحالية</h3>
          </div>
          <button type="button" onClick={loadHistory} disabled={historyLoading}>
            {historyLoading ? "جارٍ التحديث..." : "تحديث السجل"}
          </button>
        </div>

        <div className="backfill-history-list">
          {history.map((item) => (
            <article key={item.window_id} className={item.active ? "active" : "closed"}>
              <div className="backfill-history-status">
                <span>{item.active ? "مفتوح" : "مغلق"}</span>
                <strong>{item.project_name}</strong>
              </div>
              <div className="backfill-history-details">
                <p><b>التاريخ:</b> {formatDate(item.report_date)}</p>
                <p><b>النطاق:</b> {item.scope_mode === "selected" ? `${item.selected_gardens || 0} موقع مختار` : "كامل المواقع المجدولة"}</p>
                <p><b>ينتهي:</b> {formatDateTime(item.closes_at)}</p>
                <p><b>فتح بواسطة:</b> {item.opened_by || "مدير النظام"}</p>
                {item.note && <p className="backfill-history-note">{item.note}</p>}
              </div>
              {item.active && (
                <button type="button" className="backfill-close-button" onClick={() => closeBackfill(item.window_id)}>
                  إغلاق التعويض
                </button>
              )}
            </article>
          ))}
          {!historyLoading && !history.length && (
            <div className="backfill-empty-history">لا توجد نوافذ تعويض حتى الآن.</div>
          )}
        </div>
      </div>
    </section>
  );
}
