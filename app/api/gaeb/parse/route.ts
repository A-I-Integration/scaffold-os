import { NextRequest, NextResponse } from 'next/server';
import { parseGaebPositions } from '@/lib/gaeb';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – GAEB einlesen (Phase 40)
// POST { xml: string } → Positionen (OZ, Menge, Einheit, Text, Preisvorschlag)
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const ROLES = ['admin', 'disponent'];

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

async function ladeKalkulationsEinstellungen() {
  try {
    const res = await fetch(`${url}/rest/v1/company_settings?select=calc_hourly_rate,calc_hours_per_sqm,calc_transport_per_kg,calc_transport_min,calc_trip_flat,calc_permit_low,calc_permit_high,calc_crane_day&limit=1`, { headers });
    if (!res.ok) return undefined;
    const row = (await res.json())?.[0];
    if (!row) return undefined;
    const num = (v: any) => (v != null && v !== '' ? Number(v) : undefined);
    return {
      hourlyRate: num(row.calc_hourly_rate), hoursPerSqm: num(row.calc_hours_per_sqm),
      transportPerKg: num(row.calc_transport_per_kg), transportMin: num(row.calc_transport_min),
      tripFlat: num(row.calc_trip_flat), permitLow: num(row.calc_permit_low),
      permitHigh: num(row.calc_permit_high), craneDay: num(row.calc_crane_day),
    };
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }

  try {
    const { xml } = await req.json();
    if (!xml || typeof xml !== 'string') {
      return NextResponse.json({ success: false, error: 'Keine Datei erhalten.' }, { status: 400 });
    }
    if (!xml.includes('<GAEB') && !xml.includes('<Award')) {
      return NextResponse.json({ success: false, error: 'Das sieht nicht nach einer GAEB-DA-XML-Datei aus (kein <GAEB>-Wurzelelement gefunden).' }, { status: 400 });
    }
    // NEU: eure echten Kalkulations-Grundlagen laden, statt der eingebauten
    // Standardwerte der Engine – sonst können Preisvorschläge deutlich von
    // euren tatsächlichen Sätzen abweichen.
    const costs = await ladeKalkulationsEinstellungen();
    const positionen = parseGaebPositions(xml, costs);
    if (positionen.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine Positionen (<Item>) in der Datei gefunden.' }, { status: 400 });
    }
    return NextResponse.json({ success: true, positionen });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Datei konnte nicht gelesen werden: ' + err.message }, { status: 500 });
  }
}
