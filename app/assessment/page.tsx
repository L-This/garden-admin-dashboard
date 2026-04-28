"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { criterionDefinitions, getPriority } from "@/lib/data";
import { supabase } from "@/lib/supabase";

type ProjectRow = {
  id: string;
  name?: string | null;
  project_name?: string | null;
  title?: string | null;
};

type GardenRow = {
  id: string;
  project_id: string;
  name?: string | null;
  garden_name?: string | null;
  title?: string | null;
  district?: string | null;
};

type Scores = Record<string, number>;
type FilesMap = Record<string, File | null>;
type PreviewMap = Record<string, string>;

const projectLabel = (project: ProjectRow) =>
  project.name || project.project_name || project.title || "مشروع بدون اسم";

const gardenLabel = (garden: GardenRow) =>
  garden.name || garden.garden_name || garden.title || "حديقة بدون اسم";

export default function AssessmentPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [gardens, setGardens] = useState<GardenRow[]>([]);
  const [projectId, setProjectId] = useState("");
  const [gardenId, setGardenId] = useState("");
  const [scores, setScores] = useState<Scores>({});
  const [files, setFiles] = useState<FilesMap>({});
  const [previews, setPreviews] = useState<PreviewMap>({});
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    title: string;
    body: string;
    score?: number;
    priority?: string;
    garden?: string;
  } | null>(null);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [saving, setSaving] = useState(false);
  const criteriaRef = useRef<HTMLElement | null>(null);

  async function loadMasterData() {
    setLoadingMaster(true);
    setNotice(null);
    setMessage("جاري تحديث المشاريع والحدائق...");

    const [projectsRes, gardensRes] = await Promise.all([
      supabase.from("projects").select("*").order("name", { ascending: true }),
      supabase.from("gardens").select("*").order("name", { ascending: true }),
    ]);

    if (projectsRes.error) {
      setMessage(`تعذر تحميل المشاريع: ${projectsRes.error.message}`);
      setProjects([]);
      setLoadingMaster(false);
      return;
    }

    if (gardensRes.error) {
      setMessage(`تعذر تحميل الحدائق: ${gardensRes.error.message}`);
      setGardens([]);
      setLoadingMaster(false);
      return;
    }

    setProjects(projectsRes.data || []);
    setGardens(gardensRes.data || []);
    setMessage("");
    setLoadingMaster(false);
  }

  useEffect(() => {
    loadMasterData();
  }, []);

  const selectedProject = projects.find((project) => project.id === projectId);
  const selectedGarden = gardens.find((garden) => garden.id === gardenId);

  const projectGardens = useMemo(() => {
    if (!projectId) return [];
    return gardens.filter((garden) => garden.project_id === projectId);
  }, [gardens, projectId]);

  const criteria = useMemo(() => {
    return criterionDefinitions.map((criterion, criterionIndex) => {
      const itemLines = criterion.items
        .map((item, itemIndex) => {
          const key = `${criterionIndex}-${itemIndex}`;
          const value = Math.min(Number(scores[key] || 0), item.max);
          return value > 0 ? `${item.label}: ${value}/${item.max}` : "";
        })
        .filter(Boolean);

      const value = Math.min(
        criterion.items.reduce((sum, item, itemIndex) => {
          const key = `${criterionIndex}-${itemIndex}`;
          return sum + Math.min(Number(scores[key] || 0), item.max);
        }, 0),
        criterion.weight
      );

      return {
        name: criterion.name,
        weight: criterion.weight,
        selected: itemLines.length ? itemLines.join(" + ") : "لم يتم إدخال درجات",
        value,
      };
    });
  }, [scores]);

  const totalScore = criteria.reduce((sum, item) => sum + item.value, 0);
  const priority = getPriority(totalScore);

  function setItemScore(criterionIndex: number, itemIndex: number, max: number, value: string) {
    const numberValue = Number(value || 0);
    const normalized = Math.max(0, Math.min(numberValue, max));
    setScores((current) => ({
      ...current,
      [`${criterionIndex}-${itemIndex}`]: normalized,
    }));
  }

  function setItemFile(criterionIndex: number, itemIndex: number, file: File | null) {
    if (!file) return;
    const key = `${criterionIndex}-${itemIndex}`;
    setFiles((current) => ({ ...current, [key]: file }));
    setPreviews((current) => ({ ...current, [key]: URL.createObjectURL(file) }));
  }

  function resetForm() {
    setGardenId("");
    setScores({});
    setFiles({});
    setPreviews({});
  }

  async function uploadItemPhoto(assessmentId: string, criterionId: string, itemKey: string, itemLabel: string) {
    const file = files[itemKey];
    if (!file) return null;

    const safeName = file.name.replace(/[^\\w.\\-]+/g, "_");
    const path = `${assessmentId}/${criterionId}/${itemKey}-${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("criterion-photos")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      throw new Error(`تعذر رفع صورة ${itemLabel}: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from("criterion-photos").getPublicUrl(path);
    return data.publicUrl || null;
  }

  async function saveAssessment() {
    if (!projectId || !selectedProject) {
      setMessage("اختر المشروع أولاً.");
      return;
    }

    if (!gardenId || !selectedGarden) {
      setMessage("اختر الحديقة أولاً.");
      return;
    }

    const hasAnyScore = Object.values(scores).some((value) => Number(value) > 0);
    if (!hasAnyScore) {
      setMessage("أدخل درجة واحدة على الأقل قبل الحفظ.");
      return;
    }

    setSaving(true);
    setMessage("جاري حفظ التقييم ورفع الصور...");

    try {
      const projectName = projectLabel(selectedProject);
      const gardenName = gardenLabel(selectedGarden);

      const { data: assessment, error: assessmentError } = await supabase
        .from("garden_assessments")
        .insert({
          garden_id: gardenId,
          garden_name: gardenName,
          project: projectName,
          district: selectedGarden.district || "بدون حي",
          score: totalScore,
          priority: priority.label,
          is_demo: false,
        })
        .select("id")
        .single();

      if (assessmentError || !assessment) {
        throw new Error(assessmentError?.message || "تعذر إنشاء سجل التقييم.");
      }

      for (let criterionIndex = 0; criterionIndex < criteria.length; criterionIndex++) {
        const criterion = criteria[criterionIndex];

        const { data: insertedCriterion, error: criterionError } = await supabase
          .from("assessment_criteria")
          .insert({
            assessment_id: assessment.id,
            criterion_name: criterion.name,
            weight: criterion.weight,
            selected_label: criterion.selected,
            value: criterion.value,
          })
          .select("id")
          .single();

        if (criterionError || !insertedCriterion) {
          throw new Error(criterionError?.message || `تعذر حفظ معيار ${criterion.name}.`);
        }

        for (let itemIndex = 0; itemIndex < criterionDefinitions[criterionIndex].items.length; itemIndex++) {
          const item = criterionDefinitions[criterionIndex].items[itemIndex];
          const itemKey = `${criterionIndex}-${itemIndex}`;
          const imageUrl = await uploadItemPhoto(assessment.id, insertedCriterion.id, itemKey, item.label);

          if (imageUrl) {
            const { error: photoError } = await supabase.from("criterion_photos").insert({
              criterion_id: insertedCriterion.id,
              photo_url: imageUrl,
              note: `صورة بند: ${item.label}`,
            });

            if (photoError) {
              throw new Error(`تعذر حفظ رابط صورة ${item.label}: ${photoError.message}`);
            }
          }
        }
      }

      setNotice({
        type: "success",
        title: "تم حفظ التقييم بنجاح",
        body: "تم تسجيل التقييم وحفظ درجات البنود والصور المرتبطة بها.",
        score: totalScore,
        priority: priority.label,
        garden: gardenName,
      });
      setMessage("");
      resetForm();
    } catch (error: any) {
      setNotice({
        type: "error",
        title: "تعذر حفظ التقييم",
        body: error.message || "حدث خطأ غير معروف أثناء الحفظ.",
      });
      setMessage("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <section className="container">
        <header className="header">
          <div>
            <div className="pill">📝 صفحة إدخال التقييم</div>
            <h1>تقييم حديقة جديدة</h1>
            <p>
              اختر المشروع والحديقة من القاعدة، ثم أدخل درجة كل بند وارفع صورة مستقلة لكل بند عند الحاجة.
            </p>
            <div className="nav-actions">
              <Link className="action" href="/dashboard">عرض لوحة النتائج</Link>
              <button className="action secondary" onClick={loadMasterData} disabled={loadingMaster}>
                {loadingMaster ? "جاري التحديث..." : "تحديث المشاريع والحدائق"}
              </button>
            </div>
            {message && !notice && <p>{message}</p>}
          </div>

          <div className="legend">
            <p className="legend-title">النتيجة الحالية</p>
            <div className="result-box">
              <div className="result-score">{totalScore}%</div>
              <div>أولوية {priority.label}</div>
              <small>{priority.range} · {priority.text}</small>
            </div>
          </div>
        </header>

        {notice && (
          <section className={`save-notice ${notice.type}`}>
            <div className="notice-icon">{notice.type === "success" ? "✓" : "!"}</div>
            <div className="notice-content">
              <span className="notice-kicker">
                {notice.type === "success" ? "نتيجة التقييم" : "تنبيه"}
              </span>
              <h2>{notice.title}</h2>
              <p>{notice.body}</p>

              {notice.type === "success" && (
                <div className="notice-summary">
                  <div>
                    <span>الحديقة</span>
                    <b>{notice.garden}</b>
                  </div>
                  <div>
                    <span>النتيجة</span>
                    <b>{notice.score}%</b>
                  </div>
                  <div>
                    <span>الأولوية</span>
                    <b>أولوية {notice.priority}</b>
                  </div>
                </div>
              )}

              <div className="notice-actions">
                <Link className="notice-action primary" href="/dashboard">عرض لوحة النتائج</Link>
                <button className="notice-action" onClick={() => setNotice(null)}>
                  {notice.type === "success" ? "تقييم حديقة أخرى" : "إغلاق التنبيه"}
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="form-shell">
          <aside className="form-card">
            <h2>بيانات الحديقة</h2>

            <div className="field">
              <label>المشروع</label>
              <div className="items-grid">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`option ${projectId === project.id ? "active" : ""}`}
                    onClick={() => {
                      setProjectId(project.id);
                      setGardenId("");
                    }}
                  >
                    <span className="select-check">{projectId === project.id ? "✓" : ""}</span>
                    <b>{projectLabel(project)}</b>
                  </button>
                ))}
              </div>
              {!projects.length && <p className="panel-desc">لا توجد مشاريع في القاعدة.</p>}
            </div>

            <div className="field">
              <label>الحديقة</label>
              <div className="items-grid">
                {projectGardens.map((garden) => (
                  <button
                    key={garden.id}
                    type="button"
                    className={`option ${gardenId === garden.id ? "active" : ""}`}
                    onClick={() => {
                      setGardenId(garden.id);
                      setTimeout(() => criteriaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
                    }}
                  >
                    <span className="select-check">{gardenId === garden.id ? "✓" : ""}</span>
                    <b>{gardenLabel(garden)}</b>
                    <br />
                    <small>{garden.district || "بدون حي"}</small>
                  </button>
                ))}
              </div>
              {projectId && !projectGardens.length && (
                <p className="panel-desc">لا توجد حدائق مرتبطة بهذا المشروع.</p>
              )}
            </div>

            <div className="selection-status">
              <div>
                <span>المشروع المختار</span>
                <b>{selectedProject ? projectLabel(selectedProject) : "لم يتم الاختيار"}</b>
              </div>
              <div>
                <span>الحديقة الحالية</span>
                <b>{selectedGarden ? gardenLabel(selectedGarden) : "لم يتم الاختيار"}</b>
              </div>
            </div>

            <button className="submit" onClick={saveAssessment} disabled={saving || !projectId || !gardenId}>
              {saving ? "جاري الحفظ..." : projectId && gardenId ? "حفظ التقييم" : "اختر المشروع والحديقة أولًا"}
            </button>
          </aside>

          <section className="form-card" ref={criteriaRef}>
            <h2>المعايير والبنود</h2>
            <div className="criteria-form">
              {criterionDefinitions.map((criterion, criterionIndex) => (
                <div className="criterion-form" key={criterion.name}>
                  <div className="criterion-form-head">
                    <h3>{criterion.name}</h3>
                    <b>{criteria[criterionIndex]?.value || 0}/{criterion.weight}</b>
                  </div>

                  <div className="items-grid">
                    {criterion.items.map((item, itemIndex) => {
                      const key = `${criterionIndex}-${itemIndex}`;
                      return (
                        <div className="item-card" key={key}>
                          <h4>{item.label}</h4>

                          <div className="item-row">
                            <label>الدرجة / {item.max}</label>
                            <input
                              type="number"
                              min={0}
                              max={item.max}
                              value={scores[key] ?? ""}
                              onChange={(event) =>
                                setItemScore(criterionIndex, itemIndex, item.max, event.target.value)
                              }
                              placeholder="0"
                            />
                          </div>

                          <div className="file-mini">
                            <label className="change-photo">
                              {previews[key] ? "تغيير الصورة" : "رفع صورة للبند"}
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(event) =>
                                setItemFile(criterionIndex, itemIndex, event.target.files?.[0] || null)
                              }
                            />

                            {previews[key] && (
                              <div className="preview">
                                <div className="preview-box">
                                  <img src={previews[key]} alt="معاينة" />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
