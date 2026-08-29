// ============================================================
// app/api/ki-material/route.ts
// ============================================================

import { NextResponse } from 'next/server';
import { calculateScaffoldMaterial, CostSettings } from '@/lib/calculations/scaffold-engine';
import { loadArticlePrices } from '@/lib/calculations/article-prices';

// Kalkulations-Grundlagen aus den Firmeneinstellungen laden
// (company_settings.calc_* – per REST + SERVICE_ROLE_KEY, createClient crasht auf Vercel).
// Fehlt die Migration oder die Werte, greifen die Standardwerte in der Engine.
async function loadCostSettings(): Promise<CostSettings> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return {};
    const res = await fetch(
      `${url}/rest/v1/company_settings?select=calc_hourly_rate,calc_hours_per_sqm,calc_transport_per_kg,calc_transport_min,calc_trip_flat,calc_permit_low,calc_permit_high,calc_crane_day&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' }
    );
    if (!res.ok) return {};
    const row = (await res.json())?.[0];
    if (!row) return {};
    const num = (v: any) => (Number(v) > 0 ? Number(v) : undefined);
    return {
      hourlyRate: num(row.calc_hourly_rate),
      hoursPerSqm: num(row.calc_hours_per_sqm),
      transportPerKg: num(row.calc_transport_per_kg),
      transportMin: num(row.calc_transport_min),
      tripFlat: num(row.calc_trip_flat),
      permitLow: num(row.calc_permit_low),
      permitHigh: num(row.calc_permit_high),
      craneDay: num(row.calc_crane_day),
    };
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Minimal-Validierung
    if (!body.lengthM || !body.heightM) {
      return NextResponse.json(
        { error: 'Länge und Höhe erforderlich' },
        { status: 400 }
      );
    }

    // Preise + Kalkulations-Grundlagen laden (DB oder Fallback/Standardwerte)
    const [articlePrices, settings] = await Promise.all([
      loadArticlePrices(),
      loadCostSettings(),
    ]);

    // Mitarbeiter-Stundensatz hat Vorrang: Wenn der Aufruf einen Satz
    // mitliefert (z. B. vom zugeordneten Mitarbeiter), schlägt er den
    // Firmen-Standard aus den Einstellungen.
    if (Number(body.hourly_rate) > 0) {
      settings.hourlyRate = Number(body.hourly_rate);
    }

    // Berechnung durchführen
    const result = calculateScaffoldMaterial(body, articlePrices, settings);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('KI-Fehler:', error);
    return NextResponse.json(
      { error: error.message || 'Berechnung fehlgeschlagen' },
      { status: 500 }
    );
  }
}