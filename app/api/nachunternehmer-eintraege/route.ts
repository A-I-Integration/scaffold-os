import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import {
  validiere,
  uuid,
  nachunternehmerEintragPostSchema,
  nachunternehmerStatusPatchSchema,
  nachunternehmerEintragDeleteSchema,
} from '@/lib/validation';

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
//
// Phase 61 (Sicherheits-Review): Alle IDs werden vor der Interpolation
// in PostgREST-Filter-URLs per Zod als UUID validiert. Bisher kam der
// Schutz nur implizit vom uuid-Spalten-Typ der DB – das reicht nicht
// als Absicherung. Zusätzlich: DELETE ist jetzt atomar bedingt
// (status=eq.offen in der Delete-Query), statt Check-then-Delete mit
// Race-Condition. Kein SQL nötig, keine Daten-Veränderung.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

const ROLES = ['admin', 'disponent'];

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
    // Phase 61: sub landet in der PostgREST-Filter-URL – nur UUIDs erlauben.
    if (!uuid.safeParse(sub).success) {
      return NextResponse.json({ success: false, error: 'sub muss eine gültige UUID sein.' }, { status: 400 });
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
    return serverErrorResponse(err);
  }
}

// ─── POST: Eintrag anlegen ───
export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const roh = await req.json();
    // Alter Client-Vertrag: leerer String statt null für project_id.
    if (roh && typeof roh === 'object' && roh.project_id === '') roh.project_id = null;
    const v = validiere(nachunternehmerEintragPostSchema, roh);
    if (!v.ok) return v.response;
    const body = v.data;
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
      datum: body.datum,
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
    return serverErrorResponse(err);
  }
}

// ─── PATCH: Status setzen (einzeln per ids[] oder Monat gesammelt) ───
export async function PATCH(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const v = validiere(nachunternehmerStatusPatchSchema, await req.json());
    if (!v.ok) return v.response;
    const { status } = v.data;

    let filter: string;
    if ('ids' in v.data) {
      filter = `id=in.(${v.data.ids.join(',')})`;
    } else {
      // Schema garantiert YYYY-MM → monatsGrenzen kann hier nicht null liefern.
      const g = monatsGrenzen(v.data.monat)!;
      filter = `subcontractor_id=eq.${v.data.subcontractor_id}&datum=gte.${g.von}&datum=lte.${g.bis}`;
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
    return serverErrorResponse(err);
  }
}

// ─── DELETE: Eintrag löschen (nur solange 'offen') ───
export async function DELETE(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const v = validiere(nachunternehmerEintragDeleteSchema, await req.json());
    if (!v.ok) return v.response;
    const { id } = v.data;
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
    // Phase 61: atomare Bedingung statt Check-then-Delete. Bei zwei
    // parallelen Requests konnte sonst beide den Status-Check bestehen
    // (Race) – jetzt löscht nur, wer ZU DIESEM ZEITPUNKT noch 'offen' ist.
    const res = await fetch(`${url}/rest/v1/subcontractor_entries?id=eq.${id}&status=eq.offen`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
