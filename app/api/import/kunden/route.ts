import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – CSV-Import: Kundenstamm
// POST { rows: [...] } → legt Kunden in der Tabelle customers an.
//
// SICHERHEIT: Nur admin + disponent (Session-Check per Cookie).
// Datenbank-Zugriff danach per REST + SERVICE_ROLE_KEY.
// Exakte Dubletten (Name + PLZ + Ort) werden übersprungen.
// Insert in Blöcken à 100 Zeilen (PostgREST-Bulk).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

const ALLOWED_CALLERS = ['admin', 'disponent'];
const MAX_ROWS = 5000;

async function checkCaller(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || !ALLOWED_CALLERS.includes(profile.role)) {
    return NextResponse.json({ success: false, error: 'Keine Berechtigung (nur CEO/Dispo)' }, { status: 403 });
  }
  return null;
}

function s(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t.slice(0, max);
}

export async function POST(req: NextRequest) {
  const denied = await checkCaller();
  if (denied) return denied;

  let body: { rows?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ success: false, error: 'Keine Zeilen übergeben' }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { success: false, error: `Maximal ${MAX_ROWS.toLocaleString('de-DE')} Zeilen pro Import` },
      { status: 400 }
    );
  }

  // Vorhandene Kunden laden → exakte Dubletten überspringen
  let vorhanden = new Set<string>();
  try {
    const res = await fetch(`${url}/rest/v1/customers?select=name,zip,city&is_active=eq.true`, { headers: adminHeaders });
    if (res.ok) {
      const bestand = (await res.json()) as { name: string; zip: string | null; city: string | null }[];
      vorhanden = new Set(bestand.map((k) => `${k.name}|${k.zip || ''}|${k.city || ''}`.toLowerCase()));
    }
  } catch (e) {
    console.error('customers-Bestand nicht lesbar (Import läuft ohne Dubletten-Check):', e);
  }

  const fehler: { zeile: number; grund: string }[] = [];
  const eintraege: Record<string, unknown>[] = [];
  let uebersprungen = 0;

  rows.forEach((roh, i) => {
    const zeile = i + 1;
    const r = (roh || {}) as Record<string, unknown>;
    const name = s(r.name, 200);
    if (!name) {
      fehler.push({ zeile, grund: 'Name fehlt' });
      return;
    }
    const zip = s(r.zip, 10);
    const city = s(r.city, 100);
    if (vorhanden.has(`${name}|${zip || ''}|${city || ''}`.toLowerCase())) {
      uebersprungen++;
      return;
    }
    const email = s(r.email, 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fehler.push({ zeile, grund: `E-Mail ungültig: ${email}` });
      return;
    }
    eintraege.push({
      name,
      contact_person: s(r.contact_person, 200),
      email,
      phone: s(r.phone, 50),
      street: s(r.street, 200),
      zip,
      city,
      notes: s(r.notes, 2000),
      is_active: true,
    });
  });

  // In Blöcken à 100 einfügen
  let importiert = 0;
  for (let von = 0; von < eintraege.length; von += 100) {
    const block = eintraege.slice(von, von + 100);
    try {
      const res = await fetch(`${url}/rest/v1/customers`, {
        method: 'POST',
        headers: { ...adminHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(block),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('customers-Import Blockfehler:', res.status, text);
        block.forEach((_, j) => fehler.push({ zeile: von + j + 1, grund: 'Datenbank-Fehler beim Einfügen' }));
      } else {
        importiert += block.length;
      }
    } catch (e) {
      console.error('customers-Import Fehler:', e);
      block.forEach((_, j) => fehler.push({ zeile: von + j + 1, grund: 'Verbindungsfehler' }));
    }
  }

  return NextResponse.json({ success: true, importiert, uebersprungen, fehler });
}
