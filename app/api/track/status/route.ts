import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – E-Mail-Tracking: Öffnungs-Status (Phase 18)
//
// GET → Welche versendeten Angebote/Rechnungen wurden geöffnet?
// Antwort: { opens: [{ typ, ref, anzahl, zuletzt }] }
//
// Nur für eingeloggte Nutzer (eigene Instanz, eigene Daten).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    return profile?.role || null;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest) {
  const role = await callerRole();
  if (!role) {
    return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${url}/rest/v1/impact_events?event=eq.email_geoeffnet&select=meta,created_at&order=created_at.desc&limit=500`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();

    // Nach Referenz gruppieren (mehrfaches Öffnen zählt, Anzeige bleibt eine)
    const gruppen: Record<string, { typ: string; ref: string; anzahl: number; zuletzt: string }> = {};
    for (const r of rows) {
      const typ = r.meta?.typ || 'unbekannt';
      const ref = r.meta?.ref || '';
      if (!ref) continue;
      const k = `${typ}|${ref}`;
      if (!gruppen[k]) {
        gruppen[k] = { typ, ref, anzahl: 0, zuletzt: r.created_at };
      }
      gruppen[k].anzahl++;
    }

    return NextResponse.json({ success: true, opens: Object.values(gruppen) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
