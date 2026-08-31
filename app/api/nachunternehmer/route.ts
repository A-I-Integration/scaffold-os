import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Nachunternehmer-API (Stammdaten + Rahmenvertrag)
//
// GET    → alle Nachunternehmer (alphabetisch nach Firma)
// POST   → Nachunternehmer anlegen (Pflicht: firma)
// PATCH  → bearbeiten (nur erlaubte Felder, Whitelist)
//
// Rollen: admin + disponent (gleiches Muster wie /api/kunden):
// Session-/Rollenprüfung über createClient, Daten über
// Supabase REST mit SERVICE_ROLE_KEY.
//
// Braucht die Migration migration-nachunternehmer.sql
// (Tabellen subcontractors + subcontractor_entries).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

const ROLES = ['admin', 'disponent'];

// Text-Felder
const TEXT_FELDER = [
  'firma', 'ansprechpartner', 'email', 'phone', 'street', 'zip', 'city',
  'ust_idnr', 'steuernummer', 'notizen',
];
// Zahlen-Felder (Komma-Eingabe wird zu Punkt normalisiert)
const ZAHL_FELDER = [
  'preis_m2_montage', 'preis_m2_demontage', 'stundensatz_regie',
  'anfahrt_pauschale', 'sicherheitseinbehalt_prozent',
];
// Datums-Felder (Nachweise)
const DATUM_FELDER = ['freistellung_bis', 'unbedenklichkeit_bis', 'haftpflicht_bis'];
// Boolean-Felder
const BOOL_FELDER = ['gutschrift_verfahren', 'is_active'];

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

// PostgREST numeric verträgt kein deutsches Komma → normalisieren
function zuZahl(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

function zuDatum(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function sauber(body: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const f of TEXT_FELDER) {
    if (body[f] !== undefined) clean[f] = body[f] === '' ? null : String(body[f]).trim();
  }
  for (const f of ZAHL_FELDER) {
    if (body[f] !== undefined) clean[f] = zuZahl(body[f]) ?? 0;
  }
  for (const f of DATUM_FELDER) {
    if (body[f] !== undefined) clean[f] = zuDatum(body[f]);
  }
  for (const f of BOOL_FELDER) {
    if (body[f] !== undefined) clean[f] = !!body[f];
  }
  return clean;
}

function migrationFehler(t: string, status: number): boolean {
  return status === 404 || t.includes('subcontractors');
}

// ─── GET: alle Nachunternehmer ───
export async function GET() {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const res = await fetch(
      `${url}/rest/v1/subcontractors?select=*&order=firma`,
      { headers }
    );
    if (!res.ok) {
      const t = await res.text();
      if (migrationFehler(t, res.status)) {
        return NextResponse.json(
          { success: false, error: 'NACHUNTERNEHMER_MIGRATION_FEHLT', detail: t },
          { status: 409 }
        );
      }
      throw new Error(t);
    }
    const rows = await res.json();
    return NextResponse.json({ success: true, nachunternehmer: rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── POST: anlegen ───
export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const clean = sauber(body);
    delete clean.is_active; // beim Anlegen immer aktiv
    if (!clean.firma || !String(clean.firma).trim()) {
      return NextResponse.json({ success: false, error: 'Firma ist Pflicht.' }, { status: 400 });
    }
    const res = await fetch(`${url}/rest/v1/subcontractors`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(clean),
    });
    if (!res.ok) {
      const t = await res.text();
      if (migrationFehler(t, res.status)) {
        return NextResponse.json(
          { success: false, error: 'NACHUNTERNEHMER_MIGRATION_FEHLT', detail: t },
          { status: 409 }
        );
      }
      throw new Error(t);
    }
    const rows = await res.json();
    return NextResponse.json({ success: true, eintrag: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── PATCH: bearbeiten ───
export async function PATCH(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const { id, updates } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'id fehlt' }, { status: 400 });
    }
    const clean = sauber(updates || {});
    if (clean.firma !== undefined && !String(clean.firma).trim()) {
      return NextResponse.json({ success: false, error: 'Firma darf nicht leer sein.' }, { status: 400 });
    }
    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ success: false, error: 'Keine erlaubten Felder dabei.' }, { status: 400 });
    }
    clean.updated_at = new Date().toISOString();

    const res = await fetch(`${url}/rest/v1/subcontractors?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(clean),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    if (!rows?.length) {
      return NextResponse.json({ success: false, error: 'Nachunternehmer nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, eintrag: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
