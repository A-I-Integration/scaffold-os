import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { wirksamesMietende, tageBis } from '@/lib/miete';

// ============================================================
// SCAFFOLD OS – Mietende in den nächsten 14 Tagen (Dashboard)
// GET → aktive Projekte, deren wirksames Mietende (Projektende bzw.
// Verlängerung) heute bis in 14 Tagen liegt. Nur admin/disponent.
// Rein lesend. Überschrittene Enden gehören zur Mietabrechnung.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const ROLLEN = ['admin', 'disponent'];

function heuteIso(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
}
function parseData(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile?.role || !ROLLEN.includes(profile.role)) {
      return NextResponse.json({ success: false, error: 'Keine Berechtigung.' }, { status: 403 });
    }

    const res = await fetch(`${url}/rest/v1/projects?status=eq.active&select=id,name,adresse,data`, { headers });
    if (!res.ok) throw new Error(await res.text());
    const projekte = await res.json();
    const heute = heuteIso();

    const liste = projekte
      .map((p: any) => {
        const data = parseData(p.data);
        const ende = wirksamesMietende(data?.step1?.projektende, data?.mietVerlaengertBis);
        if (!ende) return null;
        const tage = tageBis(ende, heute);
        if (tage < 0 || tage > 14) return null;
        return {
          id: p.id,
          name: p.name || '–',
          kunde: data?.step1?.name || p.name || '–',
          adresse: p.adresse || null,
          ende,
          tage,
          verlaengert: !!data?.mietVerlaengertBis && data.mietVerlaengertBis >= (data?.step1?.projektende || ''),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.tage - b.tage);

    return NextResponse.json({ success: true, projekte: liste });
  } catch (err) {
    return serverErrorResponse(err);
  }
}
