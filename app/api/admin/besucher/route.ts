import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { heuteBerlin, tageAuffuellen } from '@/lib/besucher';

// ============================================================
// SCAFFOLD OS – Besucherstatistik (nur Master-Instanz, nur Admin)
//
// GET ?tage=30 → Aufrufe und Besucher pro Tag, Top-Seiten,
// Herkünfte, Geräte. Daten: Funktion besucher_statistik()
// (supabase/phase-besucherzaehler.sql).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    return profile?.role || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (process.env.MASTER_INSTANCE !== 'true') {
    return NextResponse.json({ success: false, error: 'Nur auf der Master-Instanz verfügbar.' }, { status: 404 });
  }
  if ((await callerRole()) !== 'admin') {
    return NextResponse.json({ success: false, error: 'Nur für Admins.' }, { status: 403 });
  }

  const roh = Number(req.nextUrl.searchParams.get('tage'));
  const tage = [7, 30, 90].includes(roh) ? roh : 30;

  try {
    const res = await fetch(`${url}/rest/v1/rpc/besucher_statistik`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_tage: tage }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text();
      const fehlt = /besucher_statistik|besuche/i.test(text);
      return NextResponse.json({
        success: false,
        error: fehlt
          ? 'Die Tabelle fehlt noch: supabase/phase-besucherzaehler.sql in der Master-Supabase ausführen.'
          : 'Statistik konnte nicht geladen werden.',
      }, { status: 500 });
    }
    const d = await res.json();
    return NextResponse.json({
      success: true,
      tage: tageAuffuellen(tage, heuteBerlin(), d.tage || []),
      seiten: d.seiten || [],
      quellen: d.quellen || [],
      geraete: d.geraete || [],
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Statistik konnte nicht geladen werden.' }, { status: 500 });
  }
}
