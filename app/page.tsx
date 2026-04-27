"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Project = {
  id: number;
  name: string;
  area: string | null;
};

type Garden = {
  id: number;
  project_id: number;
  name: string;
};

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [loading, setLoading] = useState(true);

  const [newProject, setNewProject] = useState("");
  const [newArea, setNewArea] = useState("");

  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [newGarden, setNewGarden] = useState("");

  async function loadData() {
    setLoading(true);

    const { data: p } = await supabase
      .from("projects")
      .select("*")
      .order("id");

    const { data: g } = await supabase
      .from("gardens")
      .select("*")
      .order("id");

    setProjects(p || []);
    setGardens(g || []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function addProject() {
    if (!newProject.trim()) return;

    await supabase.from("projects").insert({
      name: newProject,
      area: newArea,
    });

    setNewProject("");
    setNewArea("");
    loadData();
  }

  async function deleteProject(id: number) {
    if (!confirm("حذف المشروع وكل حدائقه؟")) return;

    await supabase.from("gardens").delete().eq("project_id", id);
    await supabase.from("projects").delete().eq("id", id);

    loadData();
  }

  async function addGarden() {
    if (!selectedProject || !newGarden.trim()) return;

    await supabase.from("gardens").insert({
      project_id: selectedProject,
      name: newGarden,
    });

    setNewGarden("");
    loadData();
  }

  async function deleteGarden(id: number) {
    if (!confirm("حذف الحديقة؟")) return;

    await supabase.from("gardens").delete().eq("id", id);
    loadData();
  }

  return (
    <main className="min-h-screen bg-[#eef6f0] p-8" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-8">

        <div className="bg-emerald-700 text-white rounded-3xl p-8 shadow">
          <h1 className="text-4xl font-bold mb-2">لوحة إدارة الحدائق</h1>
          <p className="text-lg opacity-90">
            إدارة المشاريع والحدائق من داخل لوحة الأدمن
          </p>
        </div>

        {/* إضافة مشروع */}
        <div className="bg-white rounded-3xl p-6 shadow space-y-4">
          <h2 className="text-2xl font-bold text-emerald-800">
            إضافة مشروع جديد
          </h2>

          <div className="grid md:grid-cols-3 gap-4">
            <input
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              placeholder="اسم المشروع"
              className="border rounded-xl p-3"
            />

            <input
              value={newArea}
              onChange={(e) => setNewArea(e.target.value)}
              placeholder="النطاق / المنطقة"
              className="border rounded-xl p-3"
            />

            <button
              onClick={addProject}
              className="bg-emerald-700 text-white rounded-xl px-4 py-3"
            >
              إضافة مشروع
            </button>
          </div>
        </div>

        {/* إضافة حديقة */}
        <div className="bg-white rounded-3xl p-6 shadow space-y-4">
          <h2 className="text-2xl font-bold text-emerald-800">
            إضافة حديقة
          </h2>

          <div className="grid md:grid-cols-3 gap-4">
            <select
              value={selectedProject || ""}
              onChange={(e) =>
                setSelectedProject(Number(e.target.value))
              }
              className="border rounded-xl p-3"
            >
              <option value="">اختر المشروع</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <input
              value={newGarden}
              onChange={(e) => setNewGarden(e.target.value)}
              placeholder="اسم الحديقة"
              className="border rounded-xl p-3"
            />

            <button
              onClick={addGarden}
              className="bg-emerald-700 text-white rounded-xl px-4 py-3"
            >
              إضافة حديقة
            </button>
          </div>
        </div>

        {/* المشاريع */}
        {loading ? (
          <div className="text-center text-xl">جارٍ التحميل...</div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {projects.map((project) => {
              const projectGardens = gardens.filter(
                (g) => g.project_id === project.id
              );

              return (
                <div
                  key={project.id}
                  className="bg-white rounded-3xl p-6 shadow space-y-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-3xl font-bold text-emerald-900">
                        {project.name}
                      </h2>
                      <p className="text-gray-500">
                        {project.area || "بدون نطاق"}
                      </p>
                    </div>

                    <button
                      onClick={() => deleteProject(project.id)}
                      className="bg-red-600 text-white px-4 py-2 rounded-xl"
                    >
                      حذف المشروع
                    </button>
                  </div>

                  <div className="bg-[#f6faf7] rounded-2xl p-4">
                    <h3 className="font-bold text-xl mb-3">
                      الحدائق ({projectGardens.length})
                    </h3>

                    {projectGardens.length === 0 ? (
                      <p className="text-gray-500">لا توجد حدائق</p>
                    ) : (
                      <div className="space-y-2">
                        {projectGardens.map((garden) => (
                          <div
                            key={garden.id}
                            className="flex justify-between items-center bg-white border rounded-xl px-4 py-3"
                          >
                            <span>{garden.name}</span>

                            <button
                              onClick={() =>
                                deleteGarden(garden.id)
                              }
                              className="text-red-600 font-bold"
                            >
                              حذف
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
