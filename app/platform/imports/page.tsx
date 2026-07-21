'use client';

import Link from 'next/link';
import { ChangeEvent, useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import '../platform.css';

type Project = { id: string; name: string };
type ExistingLocation = { id: string; name: string; normalized_name: string | null; location_code: string | null };
type RawRow = Record<string, unknown>;
type Mapping = { name: string; code: string; type: string; district: string; zone: string };
type ReviewStatus = 'new' | 'exact' | 'similar' | 'invalid';
type PreviewRow = {
  rowNumber: number;
  raw: RawRow;
  name: string;
  normalized: string;
  code: string;
  type: string;
  district: string;
  zone: string;
  status: ReviewStatus;
  matched?: ExistingLocation;
  action: 'create' | 'link' | 'skip';
};

const emptyMapping: Mapping = { name: '', code: '', type: '', district: '', zone: '' };

function normalizeArabic(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(text: string) {
  const compact = text.replace(/\s/g, '');
  const output = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) output.add(compact.slice(index, index + 2));
  return output;
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach((item) => { if (right.has(item)) intersection += 1; });
  return (2 * intersection) / (left.size + right.size);
}

function inferMapping(headers: string[]): Mapping {
  const normalizedHeaders = headers.map((header) => ({ header, value: normalizeArabic(header) }));
  const find = (needles: string[]) => normalizedHeaders.find(({ value }) => needles.some((needle) => value.includes(needle)))?.header || '';
  return {
    name: find(['اسم الموقع', 'الموقع', 'اسم الحديقه', 'الحديقه', 'site name', 'location name']),
    code: find(['كود', 'رمز', 'رقم الموقع', 'code']),
    type: find(['نوع الموقع', 'التصنيف', 'type']),
    district: find(['الحي', 'النطاق', 'district']),
    zone: find(['زون', 'المنطقه', 'zone']),
  };
}

export default function LocationImportCenter() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [fileName, setFileName] = useState('');
  const [sheetRows, setSheetRows] = useState<RawRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>(emptyMapping);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [batches, setBatches] = useState<any[]>([]);

  useEffect(() => { void loadBaseData(); }, []);

  async function loadBaseData() {
    const [projectResult, batchesResult] = await Promise.all([
      supabase.from('projects').select('id,name').order('name'),
      supabase.from('location_import_batches').select('id,file_name,status,total_rows,valid_rows,duplicate_rows,invalid_rows,created_at,projects(name)').order('created_at', { ascending: false }).limit(8),
    ]);
    setProjects(projectResult.data || []);
    setBatches(batchesResult.data || []);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage('');
    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<RawRow>(firstSheet, { defval: '' });
      const detectedHeaders = rows.length ? Object.keys(rows[0]) : [];
      setFileName(file.name);
      setSheetRows(rows);
      setHeaders(detectedHeaders);
      setMapping(inferMapping(detectedHeaders));
      setPreview([]);
      setStep(2);
    } catch {
      setMessage('تعذر قراءة الملف. تأكد أنه بصيغة Excel صحيحة.');
    } finally {
      setLoading(false);
    }
  }

  async function analyzeRows() {
    if (!projectId) return setMessage('اختر المشروع أولًا.');
    if (!mapping.name) return setMessage('حدد عمود اسم الموقع.');
    setLoading(true);
    setMessage('');
    const { data: existingData, error } = await supabase
      .from('locations')
      .select('id,name,normalized_name,location_code')
      .eq('project_id', projectId);
    if (error) {
      setLoading(false);
      return setMessage('تعذر تحميل المواقع الحالية. نفّذ ملف SQL الخاص بالمرحلة أولًا.');
    }
    const existing = (existingData || []) as ExistingLocation[];
    const analyzed = sheetRows.map((raw, index): PreviewRow => {
      const name = String(raw[mapping.name] ?? '').trim();
      const normalized = normalizeArabic(name);
      const code = mapping.code ? String(raw[mapping.code] ?? '').trim() : '';
      const exact = existing.find((item) => (item.normalized_name || normalizeArabic(item.name)) === normalized || (code && item.location_code === code));
      let similar: ExistingLocation | undefined;
      let bestScore = 0;
      if (!exact && normalized) {
        existing.forEach((item) => {
          const score = similarity(normalized, item.normalized_name || normalizeArabic(item.name));
          if (score > bestScore) { bestScore = score; similar = item; }
        });
      }
      const status: ReviewStatus = !name ? 'invalid' : exact ? 'exact' : bestScore >= 0.72 ? 'similar' : 'new';
      return {
        rowNumber: index + 2,
        raw,
        name,
        normalized,
        code,
        type: mapping.type ? String(raw[mapping.type] ?? '').trim() || 'garden' : 'garden',
        district: mapping.district ? String(raw[mapping.district] ?? '').trim() : '',
        zone: mapping.zone ? String(raw[mapping.zone] ?? '').trim() : '',
        status,
        matched: exact || similar,
        action: status === 'new' ? 'create' : status === 'invalid' ? 'skip' : 'link',
      };
    });
    setPreview(analyzed);
    setStep(3);
    setLoading(false);
  }

  function updateAction(index: number, action: PreviewRow['action']) {
    setPreview((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, action } : row));
  }

  async function approveImport() {
    if (!projectId || !preview.length) return;
    setLoading(true);
    setMessage('');
    const stats = {
      total: preview.length,
      create: preview.filter((row) => row.action === 'create').length,
      duplicate: preview.filter((row) => row.status === 'exact' || row.status === 'similar').length,
      invalid: preview.filter((row) => row.status === 'invalid').length,
    };
    const { data: batch, error: batchError } = await supabase.from('location_import_batches').insert({
      project_id: projectId,
      file_name: fileName,
      status: 'previewed',
      total_rows: stats.total,
      valid_rows: stats.create,
      duplicate_rows: stats.duplicate,
      invalid_rows: stats.invalid,
      summary: stats,
    }).select('id').single();
    if (batchError || !batch) {
      setLoading(false);
      return setMessage('تعذر إنشاء دفعة الاستيراد.');
    }

    const rowPayload = preview.map((row) => ({
      batch_id: batch.id,
      row_number: row.rowNumber,
      raw_data: row.raw,
      proposed_name: row.name,
      proposed_code: row.code || null,
      proposed_type: row.type || 'garden',
      matched_location_id: row.action === 'link' ? row.matched?.id || null : null,
      validation_status: row.action,
      validation_notes: row.status === 'similar' ? ['اسم مشابه ويحتاج مراجعة'] : [],
    }));
    const { error: rowsError } = await supabase.from('location_import_rows').insert(rowPayload);
    if (rowsError) {
      setLoading(false);
      return setMessage('تم إنشاء الدفعة لكن تعذر حفظ تفاصيل الصفوف.');
    }

    const toCreate = preview.filter((row) => row.action === 'create').map((row) => ({
      project_id: projectId,
      location_code: row.code || null,
      name: row.name,
      normalized_name: row.normalized,
      location_type: row.type || 'garden',
      district: row.district || null,
      zone: row.zone || null,
      source_system: 'excel',
      source_file_name: fileName,
      metadata: { import_batch_id: batch.id, source_row: row.rowNumber },
    }));

    if (toCreate.length) {
      const { error: createError } = await supabase.from('locations').insert(toCreate);
      if (createError) {
        await supabase.from('location_import_batches').update({ status: 'failed' }).eq('id', batch.id);
        setLoading(false);
        return setMessage(`تعذر إضافة المواقع: ${createError.message}`);
      }
    }

    const aliases = preview
      .filter((row) => row.action === 'link' && row.matched && row.name && normalizeArabic(row.name) !== normalizeArabic(row.matched.name))
      .map((row) => ({ location_id: row.matched!.id, alias_name: row.name, normalized_alias: row.normalized, source_system: 'excel' }));
    if (aliases.length) await supabase.from('location_aliases').upsert(aliases, { onConflict: 'location_id,alias_name', ignoreDuplicates: true });

    await supabase.from('location_import_batches').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', batch.id);
    setStep(4);
    setMessage(`تم اعتماد الدفعة وإضافة ${toCreate.length} موقعًا جديدًا بنجاح.`);
    setLoading(false);
    await loadBaseData();
  }

  const summary = useMemo(() => ({
    total: preview.length,
    newRows: preview.filter((row) => row.status === 'new').length,
    exact: preview.filter((row) => row.status === 'exact').length,
    similar: preview.filter((row) => row.status === 'similar').length,
    invalid: preview.filter((row) => row.status === 'invalid').length,
  }), [preview]);

  return (
    <main className="platform-shell import-center" dir="rtl">
      <aside className="platform-sidebar">
        <div className="platform-brand-mark">م</div>
        <div><strong>منصة الأعمال الميدانية</strong><span>السجل المركزي والاستيراد</span></div>
        <nav>
          <Link href="/platform">المشاريع</Link>
          <Link href="/platform/locations">سجل المواقع المركزي</Link>
          <Link className="active" href="/platform/imports">استيراد المواقع</Link>
          <Link href="/platform/work-types">أنواع الأعمال</Link>
          <Link href="/legacy">النظام السابق</Link>
        </nav>
      </aside>

      <section className="platform-content">
        <header className="platform-header">
          <div><span className="eyebrow">المرحلة الثانية</span><h1>مركز استيراد المواقع</h1><p>ارفع ملف Excel، طابق الأعمدة، راجع التكرارات، ثم اعتمد الدفعة.</p></div>
          <Link className="secondary-action" href="/platform/locations">فتح سجل المواقع</Link>
        </header>

        <div className="import-steps">
          {['المشروع والملف', 'مطابقة الأعمدة', 'المراجعة', 'الاعتماد'].map((label, index) => (
            <div key={label} className={step >= index + 1 ? 'done' : ''}><b>{index + 1}</b><span>{label}</span></div>
          ))}
        </div>

        {message && <div className={`import-message ${step === 4 ? 'success' : ''}`}>{message}</div>}

        {step === 1 && (
          <section className="platform-panel import-card">
            <div className="panel-heading"><div><h2>اختيار المصدر</h2><p>لن يتم حفظ أي موقع قبل شاشة المراجعة والاعتماد.</p></div></div>
            <div className="form-grid">
              <label><span>المشروع</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">اختر المشروع</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label className="upload-box"><span>{loading ? 'جاري قراءة الملف...' : 'اختيار ملف Excel'}</span><small>يدعم XLSX وXLS وCSV</small><input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} disabled={!projectId || loading} /></label>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="platform-panel import-card">
            <div className="panel-heading"><div><h2>مطابقة الأعمدة</h2><p>{fileName} · {sheetRows.length} صف</p></div><button className="secondary-action" onClick={() => setStep(1)}>تغيير الملف</button></div>
            <div className="mapping-grid">
              {([
                ['name','اسم الموقع *'],['code','كود الموقع'],['type','نوع الموقع'],['district','الحي / النطاق'],['zone','الزون / المنطقة'],
              ] as [keyof Mapping,string][]).map(([key,label]) => (
                <label key={key}><span>{label}</span><select value={mapping[key]} onChange={(event) => setMapping({ ...mapping, [key]: event.target.value })}><option value="">غير مستخدم</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
              ))}
            </div>
            <div className="import-actions"><button className="primary-action" onClick={analyzeRows} disabled={loading}>{loading ? 'جاري التحليل...' : 'تحليل الملف ومراجعة التكرارات'}</button></div>
          </section>
        )}

        {step === 3 && (
          <>
            <section className="platform-stats import-summary">
              <article><span>إجمالي الصفوف</span><strong>{summary.total}</strong></article>
              <article><span>مواقع جديدة</span><strong>{summary.newRows}</strong></article>
              <article><span>مطابقة أو مشابهة</span><strong>{summary.exact + summary.similar}</strong></article>
              <article><span>غير صالحة</span><strong>{summary.invalid}</strong></article>
            </section>
            <section className="platform-panel">
              <div className="panel-heading"><div><h2>مراجعة الصفوف</h2><p>يمكن تغيير القرار لكل صف قبل الاعتماد.</p></div></div>
              <div className="review-table-wrap"><table className="review-table"><thead><tr><th>الصف</th><th>اسم الموقع</th><th>الحالة</th><th>الموقع المقترح</th><th>القرار</th></tr></thead><tbody>
                {preview.map((row, index) => <tr key={`${row.rowNumber}-${row.name}`}><td>{row.rowNumber}</td><td><strong>{row.name || 'بدون اسم'}</strong><small>{row.code || 'بدون كود'}</small></td><td><span className={`review-badge ${row.status}`}>{row.status === 'new' ? 'جديد' : row.status === 'exact' ? 'مطابق' : row.status === 'similar' ? 'متشابه' : 'غير صالح'}</span></td><td>{row.matched?.name || '—'}</td><td><select value={row.action} onChange={(event) => updateAction(index, event.target.value as PreviewRow['action'])} disabled={row.status === 'invalid'}><option value="create">إضافة كموقع جديد</option><option value="link" disabled={!row.matched}>ربط بالموقع المقترح</option><option value="skip">تجاهل الصف</option></select></td></tr>)}
              </tbody></table></div>
              <div className="import-actions"><button className="secondary-action" onClick={() => setStep(2)}>رجوع</button><button className="primary-action" onClick={approveImport} disabled={loading}>{loading ? 'جاري الاعتماد...' : `اعتماد وإضافة ${preview.filter((row) => row.action === 'create').length} موقع`}</button></div>
            </section>
          </>
        )}

        {step === 4 && (
          <section className="platform-panel import-complete"><div className="complete-icon">✓</div><h2>اكتملت عملية الاستيراد</h2><p>{message}</p><div className="import-actions"><Link className="primary-action" href="/platform/locations">عرض سجل المواقع</Link><button className="secondary-action" onClick={() => { setStep(1); setFileName(''); setSheetRows([]); setPreview([]); setMessage(''); }}>استيراد ملف آخر</button></div></section>
        )}

        <section className="platform-panel batches-panel">
          <div className="panel-heading"><div><h2>آخر دفعات الاستيراد</h2><p>سجل مختصر لأحدث الملفات المعتمدة أو قيد المراجعة.</p></div></div>
          <div className="data-list">{batches.length ? batches.map((batch) => <article key={batch.id}><div><strong>{batch.file_name}</strong><span>{batch.projects?.name || 'مشروع غير محدد'} · {new Date(batch.created_at).toLocaleDateString('ar-SA')}</span></div><div className="batch-stats"><span>{batch.total_rows} صف</span><span className={`pill ${batch.status !== 'approved' ? 'off' : ''}`}>{batch.status === 'approved' ? 'معتمد' : batch.status}</span></div></article>) : <div className="platform-empty">لا توجد دفعات استيراد حتى الآن.</div>}</div>
        </section>
      </section>
    </main>
  );
}
