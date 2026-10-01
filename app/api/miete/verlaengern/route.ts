import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { wirksamesMietende, verlaengertesEnde } from '@/lib/miete';

// ============================================================
// SCAFFOLD OS – Mietende verlängern (ein Klick)
// POST { project_id, wochen? (Standard 1) } → setzt
// projects.data.mietVerlaengertBis (ab wirksamem Ende, mind. ab heute)
// und protokolliert in data.mietVerlaengerungen.
//
// WICHTIG: step1.projektende bleibt UNVERÄNDERT – die automatische
// Standzeit-Nachberechnung (cron/standzeit-abrechnung) und die Seite
// Mietabrechnung rechnen weiter ab dem ursprünglichen Ende ab.
// Nur admin/disponent.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const ROLLEN = ['admin', 'disponent'];

function heuteIso(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
}
function parseData(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile?.role || !ROLLEN.includes(profile.role)) {
      return NextResponse.json({ success: false, error: 'Keine Berechtigung.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.project_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
      return NextResponse.json({ success: false, error: 'Ungültige Projekt-ID.' }, { status: 400 });
    }
    const wochen = Number.isFinite(Number(body?.wochen)) ? Number(body.wochen) : 1;

    const res = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=id,data`, { headers });
    if (!res.ok) throw new Error(await res.text());
    const row = (await res.json())?.[0];
    if (!row) return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 });

    const data = parseData(row.data);
    const wirksam = wirksamesMietende(data?.step1?.projektende, data?.mietVerlaengertBis);
    if (!wirksam) {
      return NextResponse.json({ success: false, error: 'Für dieses Projekt ist kein Mietende hinterlegt.' }, { status: 400 });
    }

    const heute = heuteIso();
    const neu = verlaengertesEnde(wirksam, heute, wochen);
    const eintrag = { am: heute, von: wirksam, bis: neu, wochen: Math.round((Date.parse(neu) - Date.parse(wirksam > heute ? wirksam : heute)) / (7 * 86400000)), user: user.id };
    const verlauf = Array.isArray(data.mietVerlaengerungen) ? data.mietVerlaengerungen : [];

    const upd = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ data: { ...data, mietVerlaengertBis: neu, mietVerlaengerungen: [...verlauf, eintrag] } }),
    });
    if (!upd.ok) throw new Error(await upd.text());

    return NextResponse.json({ success: true, ende: neu });
  } catch (err) {
    return serverErrorResponse(err);
  }
}
