import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Massen-Import von Kunden (z.B. Umstieg von CP-Pro,
// Excel-Listen o.ä. – Phase 44)
//
// Erwartet bereits VOM CLIENT zugeordnete, fertige Datensätze (Spalten-
// Zuordnung passiert in der Oberfläche, hier wird nur noch validiert
// und eingefügt). Überspringt Zeilen ohne Namen statt den ganzen
// Import abzubrechen – bei 500 Zeilen soll ein einzelner Fehler nicht
// alles blockieren.
//
// POST { kunden: { name, contact_person?, email?, phone?, street?, zip?, city?, notes? }[] }
// → { success, importiert, uebersprungen: { zeile, grund }[] }
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' };

const FELDER = ['name', 'contact_person', 'email', 'phone', 'street', 'zip', 'city', 'notes'];
const emailOk = (e: any) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim());

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'disponent'].includes(profile.role)) {
      return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
    }

    const { kunden } = await req.json();
    if (!Array.isArray(kunden) || kunden.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine Datensätze erhalten.' }, { status: 400 });
    }
    if (kunden.length > 1000) {
      return NextResponse.json({ success: false, error: 'Maximal 1000 Datensätze pro Import.' }, { status: 400 });
    }

    const gueltig: Record<string, any>[] = [];
    const uebersprungen: { zeile: number; grund: string }[] = [];

    kunden.forEach((k: any, i: number) => {
      const clean: Record<string, any> = {};
      for (const f of FELDER) if (k[f] !== undefined && k[f] !== null && String(k[f]).trim() !== '') clean[f] = String(k[f]).trim();
      if (!clean.name) { uebersprungen.push({ zeile: i + 1, grund: 'Kein Name' }); return; }
      if (!emailOk(clean.email)) { uebersprungen.push({ zeile: i + 1, grund: `Ungültige E-Mail: ${clean.email}` }); return; }
      gueltig.push(clean);
    });

    if (gueltig.length > 0) {
      const res = await fetch(`${url}/rest/v1/customers`, { method: 'POST', headers, body: JSON.stringify(gueltig) });
      if (!res.ok) throw new Error(await res.text());
    }

    return NextResponse.json({ success: true, importiert: gueltig.length, uebersprungen });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
