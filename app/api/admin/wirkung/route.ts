import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Pilot-Wirkung (Phase 17, nur Master-Instanz)
//
// GET → Aggregiert die betrieblichen Kennzahlen aller aktiven
// Pilotkunden: Rechnungen, Umsatz, Projekte, Margen, Touren,
// erfasste Stunden + Impact-Events.
//
// Das ist die Datenquelle für das Pilot-Cockpit (/admin/wirkung)
// und später die Antwort auf die Investor-Frage:
// „Was bringt das einem Gerüstbaubetrieb in Euro und Stunden?"
//
// Sicherheit: MASTER_INSTANCE=true + Rolle admin (Master).
// Zugriff auf Kunden-Daten per REST mit deren Service-Key
// (nur aggregierte Zähler/Summen, keine Einzeldaten).
// ============================================================

const masterUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const masterKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const masterHeaders = {
  'Content-Type': 'application/json',
  'apikey': masterKey,
  'Authorization': `Bearer ${masterKey}`,
};

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

async function tenantFetch(tenant: any, endpoint: string): Promise<any[]> {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': tenant.supabase_service_role_key,
    'Authorization': `Bearer ${tenant.supabase_service_role_key}`,
  };
  const res = await fetch(`${tenant.supabase_url}/rest/v1/${endpoint}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  return res.json();
}

export async function GET() {
  // Nur auf der Master-Instanz
  if (process.env.MASTER_INSTANCE !== 'true') {
    return NextResponse.json({ success: false, error: 'Nur auf der Master-Instanz verfügbar.' }, { status: 404 });
  }
  const role = await callerRole();
  if (role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Nur für Admins.' }, { status: 403 });
  }

  try {
    const tRes = await fetch(
      `${masterUrl}/rest/v1/tenants?select=id,slug,company_name,subdomain,status,supabase_url,supabase_service_role_key&status=eq.active&order=created_at.asc`,
      { headers: masterHeaders }
    );
    if (!tRes.ok) throw new Error(await tRes.text());
    const tenants = await tRes.json();

    const kunden: any[] = [];
    const summe = {
      betriebe: 0,
      rechnungen: 0,
      umsatz_eur: 0,
      projekte: 0,
      projekte_abgeschlossen: 0,
      margen: [] as number[],
      touren: 0,
      stunden: 0,
      impact_events: 0,
    };

    for (const t of tenants) {
      if (!t.supabase_url || !t.supabase_service_role_key) continue;
      try {
        const [invoices, projects, tours, entries, events] = await Promise.all([
          tenantFetch(t, 'invoices?select=gross_amount,status&status=neq.storniert'),
          tenantFetch(t, 'projects?select=status,total_value,margin_percent'),
          tenantFetch(t, 'tours?select=id'),
          tenantFetch(t, 'time_entries?select=hours'),
          tenantFetch(t, 'impact_events?select=id'),
        ]);

        const umsatz = invoices.reduce((s: number, r: any) => s + (Number(r.gross_amount) || 0), 0);
        const abgeschlossen = projects.filter((p: any) => p.status === 'completed');
        const margen = projects
          .map((p: any) => Number(p.margin_percent) || 0)
          .filter((m: number) => m > 0);
        const schnittMarge = margen.length
          ? Math.round((margen.reduce((a, b) => a + b, 0) / margen.length) * 10) / 10
          : null;
        const stunden = Math.round(entries.reduce((s: number, r: any) => s + (Number(r.hours) || 0), 0) * 10) / 10;

        kunden.push({
          firma: t.company_name || t.slug,
          subdomain: t.subdomain,
          rechnungen: invoices.length,
          umsatz_eur: Math.round(umsatz * 100) / 100,
          projekte: projects.length,
          projekte_abgeschlossen: abgeschlossen.length,
          marge_prozent: schnittMarge,
          touren: tours.length,
          stunden,
          impact_events: events.length,
        });

        summe.betriebe++;
        summe.rechnungen += invoices.length;
        summe.umsatz_eur += umsatz;
        summe.projekte += projects.length;
        summe.projekte_abgeschlossen += abgeschlossen.length;
        summe.margen.push(...margen);
        summe.touren += tours.length;
        summe.stunden += entries.reduce((s: number, r: any) => s + (Number(r.hours) || 0), 0);
        summe.impact_events += events.length;
      } catch {
        // Ein Kunde nicht erreichbar → überspringen, Rest trotzdem zeigen
        kunden.push({ firma: t.company_name || t.slug, subdomain: t.subdomain, fehler: true });
      }
    }

    const ergebnis = {
      ...summe,
      umsatz_eur: Math.round(summe.umsatz_eur * 100) / 100,
      stunden: Math.round(summe.stunden * 10) / 10,
      marge_prozent: summe.margen.length
        ? Math.round((summe.margen.reduce((a, b) => a + b, 0) / summe.margen.length) * 10) / 10
        : null,
      margen: undefined,
    };

    return NextResponse.json({ success: true, gesamt: ergebnis, kunden });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
