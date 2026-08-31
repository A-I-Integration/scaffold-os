import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Nachunternehmer-Leistungserfassung
//
// Erfasst abrechenbare Leistungen von Nachunternehmern:
//   montage_m2 | demontage_m2  → Werklohn nach Fläche (m²)
//   regie_stunden              → Regiearbeiten (nur mit
//                                Stundenlohnzettel, VOB/B § 15)
//   anfahrt                    → Anfahrts-Pauschale
//
// GET    ?sub=<uuid>[&monat=YYYY-MM] → Einträge (neueste zuerst)
// POST   → Eintrag anlegen (betrag wird SERVERSEITIG gerechnet,
//          einheitspreis = Snapshot zum Erfassungszeitpunkt)
// PATCH  → status setzen: { ids: [...] } oder gesammelt
//          { subcontractor_id, monat: 'YYYY-MM' } → 'abgerechnet'
// DELETE → { id } – nur solange status = 'offen'
//
// Rollen: admin + disponent. Muster: createClient nur für die
// Rollenprüfung, Daten über REST mit SERVICE_ROLE_KEY.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

const ROLES = ['admin', 'disponent'];
const ARTEN = ['montage_m2', 'demontage_m2', 'regie_stunden', 'anfahrt'];

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

function zuZahl(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

// 'YYYY-MM' → { von: 'YYYY-MM-01', bis: 'YYYY-MM-<letzter Tag>' }
function monatsGrenzen(monat: string): { von: string; bis: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monat);
  if (!m) return null;
  const jahr = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  const letzter = new Date(Date.UTC(jahr, mon, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { von: `${jahr}-${pad(mon)}-01`, bis: `${jahr}-${pad(mon)}-${pad(letzter)}` };
}

// ─── GET: Einträge laden ───
export async function GET(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const sub = searchParams.get('sub');
    if (!sub) {
      return NextResponse.json({ success: false, error: 'sub fehlt' }, { status: 400 });
    }
    let query = `subcontractor_id=eq.${sub}&select=*&order=datum.desc`;
    const monat = searchParams.get('monat');
    if (monat) {
      const g = monatsGrenzen(monat);
      if (!g) {
        return NextResponse.json({ success: false, error: 'monat ungültig (YYYY-MM)' }, { status: 400 });
      }
      query += `&datum=gte.${g.von}&datum=lte.${g.bis}`;
    }
    const res = await fetch(`${url}/rest/v1/subcontractor_entries?${query}`, { headers });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 404 || t.includes('subcontractor_entries')) {
        return NextResponse.json(
          { success: false, error: 'NACHUNTERNEHMER_MIGRATION_FEHLT', detail: t },
          { status: 409 }
        );
      }
      throw new Error(t);
    }
    const rows = await res.json();
    return NextResponse.json({ success: true, eintraege: rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── POST: Eintrag anlegen ───
export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const body = await req.json();
    if (!body.subcontractor_id) {
      return NextResponse.json({ success: false, error: 'subcontractor_id fehlt' }, { status: 400 });
    }
    if (!ARTEN.includes(body.art)) {
      return NextResponse.json({ success: false, error: 'art ungültig.' }, { status: 400 });
    }
    const datum = String(body.datum || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
      return NextResponse.json({ success: false, error: 'datum fehlt (YYYY-MM-DD).' }, { status: 400 });
    }
    const menge = zuZahl(body.menge);
    const einheitspreis = zuZahl(body.einheitspreis);
    if (!menge || menge <= 0) {
      return NextResponse.json({ success: false, error: 'Menge muss größer 0 sein.' }, { status: 400 });
    }
    if (einheitspreis === null || einheitspreis < 0) {
      return NextResponse.json({ success: false, error: 'Einheitspreis ungültig.' }, { status: 400 });
    }
    // Betrag IMMER serverseitig rechnen – nie dem Client trauen
    const betrag = Math.round(menge * einheitspreis * 100) / 100;

    const clean: Record<string, any> = {
      subcontractor_id: body.subcontractor_id,
      project_id: body.project_id || null,
      project_name: body.project_name ? String(body.project_name).trim() : null,
      datum,
      art: body.art,
      menge,
      einheitspreis,
      betrag,
      stundenzettel: body.art === 'regie_stunden' ? !!body.stundenzettel : false,
      bemerkung: body.bemerkung ? String(body.bemerkung).trim() : null,
      status: 'offen',
    };

    const res = await fetch(`${url}/rest/v1/subcontractor_entries`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(clean),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, eintrag: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── PATCH: Status setzen (einzeln per ids[] oder Monat gesammelt) ───
export async function PATCH(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const status = body.status === 'abgerechnet' ? 'abgerechnet' : 'offen';

    let filter = '';
    if (Array.isArray(body.ids) && body.ids.length) {
      filter = `id=in.(${body.ids.join(',')})`;
    } else if (body.subcontractor_id && body.monat) {
      const g = monatsGrenzen(String(body.monat));
      if (!g) {
        return NextResponse.json({ success: false, error: 'monat ungültig (YYYY-MM)' }, { status: 400 });
      }
      filter = `subcontractor_id=eq.${body.subcontractor_id}&datum=gte.${g.von}&datum=lte.${g.bis}`;
    } else {
      return NextResponse.json(
        { success: false, error: 'ids[] oder subcontractor_id + monat nötig.' },
        { status: 400 }
      );
    }

    const res = await fetch(
      `${url}/rest/v1/subcontractor_entries?${filter}&status=eq.${status === 'abgerechnet' ? 'offen' : 'abgerechnet'}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ status }),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, geaendert: rows?.length || 0 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── DELETE: Eintrag löschen (nur solange 'offen') ───
export async function DELETE(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'id fehlt' }, { status: 400 });
    }
    // Erst Status prüfen: Abgerechnetes bleibt unantastbar (GoBD)
    const check = await fetch(
      `${url}/rest/v1/subcontractor_entries?id=eq.${id}&select=id,status`,
      { headers }
    );
    if (!check.ok) throw new Error(await check.text());
    const rows = await check.json();
    if (!rows?.length) {
      return NextResponse.json({ success: false, error: 'Eintrag nicht gefunden.' }, { status: 404 });
    }
    if (rows[0].status !== 'offen') {
      return NextResponse.json(
        { success: false, error: 'Abgerechnete Einträge können nicht gelöscht werden.' },
        { status: 409 }
      );
    }
    const res = await fetch(`${url}/rest/v1/subcontractor_entries?id=eq.${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
