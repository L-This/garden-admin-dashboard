'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function ProjectDetails({ params }: any) {
  const [project, setProject] = useState<any>(null);
  const [gardens, setGardens] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: p } = await supabase
      .from('projects')
      .select('*')
      .eq('id', params.id)
      .single();

    const { data: g } = await supabase
      .from('gardens')
      .select('*')
      .eq('project_id', params.id);

    setProject(p);
    setGardens(g || []);
  }

  const done = gardens.filter(x => x.status === 'تم الري').length;
  const no = gardens.filter(x => x.status === 'لم يتم').length;
  const focus = gardens.filter(x => x.status === 'يجب تكثيف الري').length;
  const fines = focus * 500;

  return (
    <main dir="rtl" style={{padding:'30px',background:'#eef8f2',minHeight:'100vh'}}>
      <Link href="/" style={{textDecoration:'none'}}>⬅ العودة</Link>

      <h1 style={{fontSize:'34px',marginTop:'20px'}}>
        {project?.name}
      </h1>

      <div style={{
        display:'grid',
        gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',
        gap:'15px',
        marginTop:'25px'
      }}>
        <Card title="إجمالي الحدائق" value={gardens.length} />
        <Card title="تم الري" value={done} />
        <Card title="لم يتم" value={no} />
        <Card title="تكثيف الري" value={focus} />
        <Card title="الغرامات" value={`${fines} ريال`} />
      </div>

      <div style={{
        marginTop:'30px',
        background:'#fff',
        padding:'20px',
        borderRadius:'18px'
      }}>
        <input
          placeholder="ابحث عن حديقة..."
          style={{
            width:'100%',
            padding:'14px',
            borderRadius:'12px',
            border:'1px solid #ddd'
          }}
        />
      </div>

      <div style={{
        marginTop:'25px',
        display:'grid',
        gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',
        gap:'15px'
      }}>
        {gardens.map((garden) => (
          <div key={garden.id} style={{
            background:'#fff',
            padding:'20px',
            borderRadius:'18px'
          }}>
            <h3>{garden.name}</h3>
            <p>{garden.status || 'بدون حالة'}</p>

            <select
              defaultValue={garden.status || ''}
              style={{
                width:'100%',
                padding:'10px',
                borderRadius:'10px',
                marginTop:'10px'
              }}
            >
              <option value="">اختر الحالة</option>
              <option>تم الري</option>
              <option>لم يتم</option>
              <option>يجب تكثيف الري</option>
            </select>

            <textarea
              placeholder="ملاحظة على الحديقة"
              style={{
                width:'100%',
                marginTop:'10px',
                minHeight:'90px',
                borderRadius:'10px',
                padding:'10px'
              }}
            />

            <button style={{
              width:'100%',
              marginTop:'10px',
              background:'#0b8f5a',
              color:'#fff',
              border:'none',
              padding:'12px',
              borderRadius:'12px'
            }}>
              حفظ
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}

function Card({ title, value }: any) {
  return (
    <div style={{
      background:'#fff',
      padding:'20px',
      borderRadius:'18px'
    }}>
      <div style={{fontSize:'15px',color:'#666'}}>{title}</div>
      <div style={{fontSize:'28px',fontWeight:'bold',marginTop:'10px'}}>
        {value}
      </div>
    </div>
  );
}