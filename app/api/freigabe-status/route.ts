import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { berechneFreigabeStatus } from '@/lib/freigabe-status';
import { UUID_MUSTER } from '@/lib/baustellenmappe';

// GET /api/freigabe-status?project_ids=a,b,c → { success, status: { [project_id]: FreigabeStatus } }
// Nur Lesen, Login Pflicht.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });

    const roh = new URL(req.url).searchParams.get('project_ids') || '';
    const ids = Array.from(new Set(roh.split(',').map(s => s.trim()).filter(s => UUID_MUSTER.test(s)))).slice(0, 100);
    if (ids.length === 0) return NextResponse.json({ success: true, status: {} });

    const res = await fetch(
      `${url}/rest/v1/project_events?project_id=in.(${ids.join(',')})&type=in.(pruefung_freigabe,ereignis)&select=project_id,type,created_at,pruefung_details&order=created_at.desc&limit=2000`,
      { headers, cache: 'no-store' },
    );
    if (!res.ok) throw new Error(await res.text());
    const rows: any[] = await res.json();
    const status: Record<string, ReturnType<typeof berechneFreigabeStatus>> = {};
    for (const id of ids) status[id] = berechneFreigabeStatus(rows.filter(r => r.project_id === id));
    return NextResponse.json({ success: true, status });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
