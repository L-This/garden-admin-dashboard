'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import '../../platform.css';

type Location = {id:string;name:string;original_name?:string;location_code?:string;location_category?:string;location_type?:string;district?:string;zone?:string;active:boolean;source_file_name?:string;source_row?:number;created_at:string;updated_at:string;projects?:{name:string}};
export default function LocationDetailsPage(){
 const params=useParams<{id:string}>(); const [row,setRow]=useState<Location|null>(null); const [aliases,setAliases]=useState<any[]>([]); const [history,setHistory]=useState<any[]>([]); const [tab,setTab]=useState('data');
 useEffect(()=>{if(!params.id)return; void Promise.all([
  supabase.from('locations').select('*,projects(name)').eq('id',params.id).single(),
  supabase.from('location_aliases').select('*').eq('location_id',params.id).order('created_at'),
  supabase.from('location_history').select('*').eq('location_id',params.id).order('created_at',{ascending:false}).limit(30)
 ]).then(([a,b,c])=>{setRow(a.data as Location);setAliases(b.data||[]);setHistory(c.data||[])});},[params.id]);
 if(!row)return <main className="simple-platform-page" dir="rtl"><div className="platform-empty">جاري تحميل الموقع...</div></main>;
 return <main className="simple-platform-page" dir="rtl">
  <div className="breadcrumbs"><Link href="/platform">المنصة</Link><span>/</span><Link href="/platform/locations">المواقع</Link><span>/</span><strong>{row.name}</strong></div>
  <header className="simple-title location-title"><div><span className="eyebrow">{row.location_code||'بدون كود'}</span><h1>{row.name}</h1><p>{row.projects?.name} · {row.location_category||'غير مصنف'}</p></div><span className={row.active===false?'pill off':'pill'}>{row.active===false?'موقوف':'نشط'}</span></header>
  <nav className="record-tabs">{[['data','البيانات'],['works','الأعمال'],['reports','التقارير'],['photos','الصور'],['history','السجل']].map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</nav>
  {tab==='data'&&<section className="split-panels"><div className="platform-panel"><h2>بيانات الموقع</h2><div className="detail-grid"><article><span>الكود الموحد</span><strong>{row.location_code||'—'}</strong></article><article><span>التصنيف</span><strong>{row.location_category||'—'}</strong></article><article><span>المشروع</span><strong>{row.projects?.name||'—'}</strong></article><article><span>الحي / النطاق</span><strong>{row.district||'—'}</strong></article><article><span>الزون</span><strong>{row.zone||'—'}</strong></article><article><span>الاسم الأصلي</span><strong>{row.original_name||row.name}</strong></article></div></div><div className="platform-panel"><h2>المصدر</h2><div className="detail-stack"><span>الملف: <b>{row.source_file_name||'إضافة يدوية'}</b></span><span>صف المصدر: <b>{row.source_row||'—'}</b></span><span>آخر تحديث: <b>{new Date(row.updated_at).toLocaleDateString('ar-SA')}</b></span></div><h3>الأسماء البديلة</h3><div className="alias-list">{aliases.length?aliases.map(a=><span key={a.id}>{a.alias_name}</span>):<small>لا توجد أسماء بديلة.</small>}</div></div></section>}
  {tab==='history'&&<section className="platform-panel"><h2>سجل التغييرات</h2><div className="timeline">{history.length?history.map(h=><article key={h.id}><b>{h.action}</b><span>{new Date(h.created_at).toLocaleString('ar-SA')}</span></article>):<div className="platform-empty">لا توجد تغييرات مسجلة.</div>}</div></section>}
  {['works','reports','photos'].includes(tab)&&<section className="platform-panel"><div className="platform-empty">سيظهر هذا القسم بعد ربط الموقع بمحرك الأعمال والتقارير.</div></section>}
 </main>
}
