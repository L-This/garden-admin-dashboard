'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import '../platform.css';

const CATEGORIES=['الكل','الحدائق المنسقة','الحدائق التقليدية','الزوائد','الميادين','الشوارع','زون','غير مصنف'];
export default function CentralLocationsPage(){
 const [rows,setRows]=useState<any[]>([]); const [query,setQuery]=useState(''); const [category,setCategory]=useState('الكل'); const [project,setProject]=useState('الكل');
 useEffect(()=>{void supabase.from('locations').select('*, projects(name)').order('location_category').order('name').then(({data})=>setRows(data||[]));},[]);
 const projects=useMemo(()=>['الكل',...Array.from(new Set(rows.map(r=>r.projects?.name).filter(Boolean)))],[rows]);
 const visible=useMemo(()=>{const q=query.trim().toLowerCase();return rows.filter(r=>(category==='الكل'||(r.location_category||r.location_type||'غير مصنف')===category)&&(project==='الكل'||r.projects?.name===project)&&(!q||`${r.name} ${r.location_code||''} ${r.projects?.name||''} ${r.location_category||''}`.toLowerCase().includes(q)));},[rows,query,category,project]);
 const counts=useMemo(()=>rows.reduce((a:any,r:any)=>{const key=r.location_category||r.location_type||'غير مصنف';a[key]=(a[key]||0)+1;return a},{}),[rows]);
 return <main className="simple-platform-page" dir="rtl">
  <div className="breadcrumbs"><Link href="/platform">المنصة</Link><span>/</span><strong>سجل المواقع المركزي</strong></div>
  <header className="simple-title"><div><span className="eyebrow">المصدر الموحد</span><h1>سجل المواقع المركزي</h1><p>المصدر الثابت للأعمال الميدانية وأوامر العمل، مع تقسيم واضح حسب المشروع والتصنيف.</p></div><Link className="primary-action" href="/platform/imports">استيراد Excel</Link></header>
  <section className="platform-stats compact"><article><span>إجمالي المواقع</span><strong>{rows.length}</strong></article><article><span>النشطة</span><strong>{rows.filter(r=>r.active!==false).length}</strong></article><article><span>الموقوفة</span><strong>{rows.filter(r=>r.active===false).length}</strong></article><article><span>التصنيفات</span><strong>{Object.keys(counts).length}</strong></article></section>
  <section className="category-strip">{CATEGORIES.map(item=><button key={item} className={category===item?'active':''} onClick={()=>setCategory(item)}><span>{item}</span>{item!=='الكل'&&<b>{counts[item]||0}</b>}</button>)}</section>
  <section className="platform-panel"><div className="panel-heading"><div><h2>المواقع</h2><p>اعرض المعلومات بالتدريج، وافتح بطاقة الموقع للتفاصيل الكاملة.</p></div><div className="location-filters"><select value={project} onChange={e=>setProject(e.target.value)}>{projects.map(p=><option key={p} value={p}>{p}</option>)}</select><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="بحث بالاسم أو الكود..."/></div></div>
  <div className="location-card-grid">{visible.map(row=><Link className="location-card" key={row.id} href={`/platform/locations/${row.id}`}><div className="location-card-top"><span className="location-code">{row.location_code||'بدون كود'}</span><span className={row.active===false?'pill off':'pill'}>{row.active===false?'موقوف':'نشط'}</span></div><h3>{row.name}</h3><p>{row.projects?.name||'بدون مشروع'}</p><div className="location-card-meta"><span>{row.location_category||row.location_type||'غير مصنف'}</span><span>فتح السجل ←</span></div></Link>)}{!visible.length&&<div className="platform-empty full-span">لا توجد مواقع مطابقة. استخدم مركز الاستيراد لإضافة ملفات المشاريع.</div>}</div></section>
 </main>
}
