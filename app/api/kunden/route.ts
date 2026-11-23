import { pruefeKundenPreis } from '@/lib/kunden-preis';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';

// ============================================================
// SCAFFOLD OS – Kunden-API (Kundenstamm, Phase 18-Tabelle)
//
// GET    → alle Kunden (alphabetisch)
// POST   → Kunde anlegen (Pflicht: name)
// PATCH  → Kunde bearbeiten (nur erlaubte Felder, Whitelist)
//
// Für admin UND disponent – darum eigene Route:
// /api/admin/data ist bewusst admin-only.
// Muster wie /api/invoices: Session-/Rollenprüfung über
// createClient, Daten über Supabase REST mit SERVICE_ROLE_KEY.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

const ROLES = ['admin', 'disponent'];

// Felder, die angelegt / geändert werden dürfen (Whitelist)
const FELDER = ['name', 'contact_person', 'email', 'phone', 'street', 'zip', 'city', 'notes', 'is_active', 'datev_konto', 'kundentyp', 'ust_id', 'leitweg_id', 'bauleister_nachweis_bis', 'preis_modus', 'festpreis_m2', 'festpreis_pauschale', 'fahrt_nach_km', 'fahrt_satz_pro_km'];

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

// Kundentyp, USt-IdNr. und Leitweg-ID prüfen und normalisieren (ändert `clean` direkt); Rückgabe = Fehlertext oder null
function steuerFelderPruefen(clean: Record<string, any>): string | null {
  if (clean.kundentyp !== undefined && !['gewerblich', 'privat'].includes(clean.kundentyp)) return 'Kundentyp muss „gewerblich“ oder „privat“ sein.';
  if (clean.ust_id !== undefined) {
    const u = String(clean.ust_id || '').replace(/\s+/g, '').toUpperCase();
    if (u && !/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(u)) return 'USt-IdNr. ungültig (Beispiel: DE123456789).';
    clean.ust_id = u || null;
  }
  if (clean.bauleister_nachweis_bis !== undefined) {
    const d = String(clean.bauleister_nachweis_bis || '').trim();
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'Datum der Bescheinigung ungültig.';
    clean.bauleister_nachweis_bis = d || null;
  }
  if (clean.leitweg_id !== undefined) {
    const l = String(clean.leitweg_id || '').trim();
    if (l.length > 46) return 'Leitweg-ID ist zu lang (höchstens 46 Zeichen).';
    clean.leitweg_id = l || null;
  }
  return null;
}

function emailOk(email: any): boolean {
  if (email == null || email === '') return true; // leer ist erlaubt
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email));
}

// ─── GET: alle Kunden laden ───
export async function GET(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const sortiert = searchParams.get('sort') === 'neueste' ? 'created_at.desc' : 'name';
    const query = id
      ? `id=eq.${id}&select=id,name,contact_person,email,phone,street,zip,city,notes,is_active,datev_konto,kundentyp,ust_id,leitweg_id,bauleister_nachweis_bis,preis_modus,festpreis_m2,festpreis_pauschale,fahrt_nach_km,fahrt_satz_pro_km,created_at`
      : `select=id,name,contact_person,email,phone,street,zip,city,notes,is_active,datev_konto,kundentyp,ust_id,leitweg_id,bauleister_nachweis_bis,preis_modus,festpreis_m2,festpreis_pauschale,fahrt_nach_km,fahrt_satz_pro_km,created_at&order=${sortiert}`;
    const res = await fetch(`${url}/rest/v1/customers?${query}`, { headers });
    if (!res.ok) {
      const t = await res.text();
      // Tabelle fehlt (ältere Instanz ohne Phase-18-Migration)?
      if (res.status === 404 || t.includes('customers')) {
        return NextResponse.json(
          { success: false, error: 'KUNDENSTAMM_MIGRATION_FEHLT', detail: t },
          { status: 409 }
        );
      }
      throw new Error(t);
    }
    const rows = await res.json();
    return NextResponse.json({ success: true, kunden: rows });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// ─── POST: Kunde anlegen ───
export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const clean: Record<string, any> = {};
    for (const f of FELDER) {
      if (body[f] !== undefined && f !== 'is_active') clean[f] = body[f];
    }
    if (!clean.name || !String(clean.name).trim()) {
      return NextResponse.json({ success: false, error: 'Name ist Pflicht.' }, { status: 400 });
    }
    clean.name = String(clean.name).trim();
    const steuerFehler = steuerFelderPruefen(clean);
    if (steuerFehler) return NextResponse.json({ success: false, error: steuerFehler }, { status: 400 });
    const preisFehler = pruefeKundenPreis(clean);
    if (preisFehler) return NextResponse.json({ success: false, error: preisFehler }, { status: 400 });
    if (!emailOk(clean.email)) {
      return NextResponse.json({ success: false, error: 'E-Mail-Adresse ungültig.' }, { status: 400 });
    }

    // FIX: Dopplungs-Sperre. Mehrere Stellen im Frontend (CAD, Aufmaß-
    // Wizard) rufen dieses Endpoint auf, um bei Bedarf automatisch einen
    // neuen Kunden anzulegen - bei Frontend-Fehlern (z.B. Kundenliste
    // nicht geladen, ID nicht gemerkt) konnte das zu mehreren identisch
    // benannten Duplikaten führen. Vor dem Anlegen: existiert schon ein
    // Kunde mit exakt diesem Namen (Groß-/Kleinschreibung egal), wird
    // dieser zurückgegeben statt ein neuer Datensatz angelegt.
    const dupCheck = await fetch(
      `${url}/rest/v1/customers?name=ilike.${encodeURIComponent(clean.name)}&select=id,name,contact_person,email,phone,street,zip,city,notes,is_active,datev_konto,kundentyp,ust_id,leitweg_id,bauleister_nachweis_bis,preis_modus,festpreis_m2,festpreis_pauschale,fahrt_nach_km,fahrt_satz_pro_km,created_at&limit=1`,
      { headers }
    );
    if (dupCheck.ok) {
      const dupRows = await dupCheck.json();
      if (dupRows?.[0]) {
        return NextResponse.json({ success: true, kunde: dupRows[0], bereitsVorhanden: true });
      }
    }

    const res = await fetch(`${url}/rest/v1/customers`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(clean),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, kunde: rows[0] });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// ─── PATCH: Kunde bearbeiten ───
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
    const clean: Record<string, any> = {};
    for (const f of FELDER) {
      if (updates && updates[f] !== undefined) clean[f] = updates[f];
    }
    if (clean.name !== undefined && !String(clean.name).trim()) {
      return NextResponse.json({ success: false, error: 'Name darf nicht leer sein.' }, { status: 400 });
    }
    const steuerFehler = steuerFelderPruefen(clean);
    if (steuerFehler) return NextResponse.json({ success: false, error: steuerFehler }, { status: 400 });
    const preisFehler = pruefeKundenPreis(clean);
    if (preisFehler) return NextResponse.json({ success: false, error: preisFehler }, { status: 400 });
    if (!emailOk(clean.email)) {
      return NextResponse.json({ success: false, error: 'E-Mail-Adresse ungültig.' }, { status: 400 });
    }
    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ success: false, error: 'Keine erlaubten Felder dabei.' }, { status: 400 });
    }
    clean.updated_at = new Date().toISOString();

    const res = await fetch(`${url}/rest/v1/customers?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(clean),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    if (!rows?.length) {
      return NextResponse.json({ success: false, error: 'Kunde nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, kunde: rows[0] });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// DELETE ?id=... – echtes Löschen, aber NUR wenn keinerlei verknüpfte
// Daten existieren (Projekte, Rechnungen, Ansprechpartner). Sonst:
// klare Fehlermeldung mit Verweis auf "Deaktivieren" – ein versehentlich
// angelegter, noch leerer Kunde soll sich wirklich entfernen lassen,
// ein Kunde mit echten Geschäftsvorgängen aber nicht (würde sonst
// Rechnungen/Projekte verwaisen lassen oder mitlöschen).
export async function DELETE(req: NextRequest) {
  const role = await callerRole();
  if (!role || !['admin', 'disponent'].includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });

    const [projRes, invRes, kontakteRes] = await Promise.all([
      fetch(`${url}/rest/v1/projects?customer_id=eq.${id}&select=id&limit=1`, { headers }),
      fetch(`${url}/rest/v1/invoices?customer_id=eq.${id}&select=id&limit=1`, { headers }),
      fetch(`${url}/rest/v1/customer_contacts?customer_id=eq.${id}&select=id&limit=1`, { headers }).catch(() => null),
    ]);
    const hatProjekte = projRes.ok && (await projRes.json()).length > 0;
    const hatRechnungen = invRes.ok && (await invRes.json()).length > 0;
    const hatKontakte = kontakteRes && kontakteRes.ok && (await kontakteRes.json()).length > 0;

    if (hatProjekte || hatRechnungen || hatKontakte) {
      return NextResponse.json({
        success: false,
        error: `Dieser Kunde hat bereits ${hatProjekte ? 'Projekte' : hatRechnungen ? 'Rechnungen' : 'Ansprechpartner'} – kann nicht gelöscht werden (Daten blieben sonst verwaist). Bitte stattdessen „Deaktivieren" nutzen.`,
        code: 'HAT_VERKNUEPFTE_DATEN',
      }, { status: 409 });
    }

    const res = await fetch(`${url}/rest/v1/customers?id=eq.${id}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
