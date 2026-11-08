import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { importLeseZeilen, importProtokollieren } from '@/lib/import-auth';

// ============================================================
// SCAFFOLD OS – CSV-Import: Kundenstamm
// POST { rows: [...] } → legt Kunden in der Tabelle customers an.
//
// SICHERHEIT: Nur admin + disponent (Session-Check per Cookie).
// Datenbank-Zugriff danach per REST + SERVICE_ROLE_KEY.
// Insert in Blöcken à 100 Zeilen (PostgREST-Bulk).
//
// FIX (Kunden-Duplikate): Dubletten-Check lief bisher über die
// Kombination Name+PLZ+Ort - fehlte bei einem bestehenden Kunden
// PLZ/Ort (oder war leicht anders erfasst), griff der Check nicht und
// es entstand trotzdem ein Duplikat. Jetzt dieselbe Regel wie beim
// normalen Kunden-Anlegen (POST /api/kunden): Name allein (getrimmt,
// ohne Groß-/Kleinschreibung) reicht für den Dubletten-Treffer.
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

  const gelesen = await importLeseZeilen(req);
  if (gelesen instanceof NextResponse) return gelesen;
  const rows = gelesen.rows;

  // Vorhandene Kunden laden → Dubletten überspringen: zuerst über die Kundennummer der Altsoftware
  // (sicher), sonst über den Namen (getrimmt, ohne Groß-/Kleinschreibung)
  let vorhanden = new Set<string>();
  let vorhandenNr = new Set<string>();
  try {
    const res = await fetch(`${url}/rest/v1/customers?select=name,alt_nummer&is_active=eq.true&limit=50000`, { headers: adminHeaders });
    if (res.ok) {
      const bestand = (await res.json()) as { name: string; alt_nummer?: string | null }[];
      vorhanden = new Set(bestand.map((k) => String(k.name || '').trim().toLowerCase()));
      vorhandenNr = new Set(bestand.filter((k) => k.alt_nummer).map((k) => String(k.alt_nummer).trim()));
    } else {
      // Spalte alt_nummer noch nicht angelegt (phase-106 fehlt) → ohne Kundennummer prüfen
      const r2 = await fetch(`${url}/rest/v1/customers?select=name&is_active=eq.true&limit=50000`, { headers: adminHeaders });
      if (r2.ok) vorhanden = new Set(((await r2.json()) as { name: string }[]).map((k) => String(k.name || '').trim().toLowerCase()));
    }
  } catch (e) {
    console.error('customers-Bestand nicht lesbar (Import läuft ohne Dubletten-Check):', e);
  }
  const nummernSpalteDa = vorhandenNr.size > 0 || await spalteAltNummerDa();

  const fehler: { zeile: number; grund: string }[] = [];
  const hinweise: { zeile: number; text: string }[] = [];
  const eintraege: Record<string, unknown>[] = [];
  const zeilenNr: number[] = [];
  let uebersprungen = 0;

  rows.forEach((roh, i) => {
    const zeile = i + 1;
    const r = (roh || {}) as Record<string, unknown>;
    const name = s(r.name, 200);
    if (!name) {
      fehler.push({ zeile, grund: 'Name fehlt' });
      return;
    }
    const nr = s(r.alt_nummer, 60);
    if (nr && vorhandenNr.has(nr)) { uebersprungen++; return; }
    const nameKey = name.toLowerCase();
    if (vorhanden.has(nameKey)) {
      uebersprungen++;
      if (nr) hinweise.push({ zeile, text: `Name „${name}“ gibt es schon – Kundennummer ${nr} wurde nicht übernommen` });
      return;
    }
    const email = s(r.email, 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fehler.push({ zeile, grund: `E-Mail ungültig: ${email}` });
      return;
    }
    const zip = s(r.zip, 10);
    if (zip && !/^\d{4,5}$/.test(zip)) hinweise.push({ zeile, text: `PLZ ungewöhnlich: ${zip}` });
    vorhanden.add(nameKey); // gegen Dubletten INNERHALB derselben Import-Datei
    if (nr) vorhandenNr.add(nr);
    eintraege.push({
      name,
      contact_person: s(r.contact_person, 200),
      email,
      phone: s(r.phone, 50),
      street: s(r.street, 200),
      zip,
      city: s(r.city, 100),
      notes: s(r.notes, 2000),
      is_active: true,
      ...(nr && nummernSpalteDa ? { alt_nummer: nr } : {}),
    });
    zeilenNr.push(zeile);
  });
  if (!nummernSpalteDa && rows.some((r) => s((r as Record<string, unknown>).alt_nummer, 60))) {
    hinweise.push({ zeile: 0, text: 'Kundennummern wurden nicht gespeichert: Die Datenbank-Erweiterung phase-106-wechsel-import.sql fehlt noch.' });
  }

  // Trockenlauf: nur zählen und melden, nichts schreiben
  let importiert = 0;
  if (!gelesen.trockenlauf) {
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
          block.forEach((_, j) => fehler.push({ zeile: zeilenNr[von + j], grund: 'Datenbank-Fehler beim Einfügen' }));
        } else {
          importiert += block.length;
        }
      } catch (e) {
        console.error('customers-Import Fehler:', e);
        block.forEach((_, j) => fehler.push({ zeile: zeilenNr[von + j], grund: 'Verbindungsfehler' }));
      }
    }
  }

  await importProtokollieren({ art: 'kunden', anfrage: gelesen, importiert, uebersprungen, neu: eintraege.length, fehler, hinweise });
  return NextResponse.json({ success: true, trockenlauf: gelesen.trockenlauf, neu: eintraege.length, importiert, uebersprungen, fehler, hinweise });
}

/** Gibt es die Spalte customers.alt_nummer (phase-106)? */
async function spalteAltNummerDa(): Promise<boolean> {
  try {
    const res = await fetch(`${url}/rest/v1/customers?select=alt_nummer&limit=1`, { headers: adminHeaders });
    return res.ok;
  } catch { return false; }
}
