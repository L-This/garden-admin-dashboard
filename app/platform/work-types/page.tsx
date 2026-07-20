'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import '../platform.css';
export default function WorkTypesPage(){const [rows,setRows]=useState<any[]>([]);useEffect(()=>{void supabase.from('work_types').select('*').order('sort_order').then(({data})=>setRows(data||[]));},[]);return <main className="simple-platform-page" dir="rtl"><div className="breadcrumbs"><Link href="/platform">المنصة</Link><span>/</span><strong>أنواع الأعمال</strong></div><header className="simple-title"><div><span className="eyebrow">قابل للتوسع</span><h1>أنواع الأعمال</h1><p>الري أصبح نوع عمل ضمن منصة موحدة، وليس أساس قاعدة البيانات.</p></div></header><section className="platform-panel"><div className="work-grid">{rows.map(row=><article key={row.id}><div className="work-code">{row.code}</div><h3>{row.name}</h3><p>{row.description||'نوع عمل تشغيلي'}</p><span className={row.active===false?'pill off':'pill'}>{row.active===false?'موقوف':'نشط'}</span></article>)}{!rows.length&&<div className="platform-empty">نفّذ ملف supabase-field-operations-platform.sql لإضافة الأنواع الأساسية.</div>}</div></section></main>}
