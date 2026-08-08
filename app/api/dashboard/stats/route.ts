import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

function parseData(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

function getCustomerName(data: any): string {
  // Unterstützt BEIDE Datenstrukturen (s1..s5 und step1..step5)
  const s1 = data?.s1 || data?.step1 || {};
  return s1.name || s1.ansprechpartnerName || 'Unbekannt';
}

function getAddress(data: any, fallback: string): string {
  const s1 = data?.s1 || data?.step1 || {};
  return s1.adresse || fallback || '';
}

export async function GET() {
  try {
    // NUR Projekte holen – nichts anderes
    const res = await fetch(`${url}/rest/v1/projects?select=*&order=created_at.desc`, { headers });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Supabase ${res.status}: ${text}` }, { status: 500 });
    }

    const rawProjects = await res.json();
    const now = new Date();

    // Projekte anreichern – robust gegen fehlende Felder
    const enrichedProjects = rawProjects.map((p: any) => {
      const data = parseData(p.data);
      const step6 = data?.step6 || data?.s6 || {};
      const ki = step6.kiResult || step6.ki_result || {};

      return {
        id: p.id,
        name: p.name || 'Unbenannt',
        status: p.status || 'active',
        created_at: p.created_at,
        updated_at: p.updated_at || p.created_at,
        adresse: p.adresse || getAddress(data, ''),
        customer: getCustomerName(data),
        margin_percent: p.margin_percent || ki.marginPercent || ki.margin_percent || 0,
        total_value: p.total_value || ki.suggestedPrice || ki.suggested_price || 0,
        data,
      };
    });

    const activeProjects = enrichedProjects.filter((p: any) => p.status !== 'completed');
    const completedProjects = enrichedProjects.filter((p: any) => p.status === 'completed');

    // Margen nur aus Projekten mit tatsächlichem Wert
    const margins = activeProjects
      .map((p: any) => p.margin_percent)
      .filter((m: any) => typeof m === 'number' && m > 0);
    const avgMargin = margins.length > 0
      ? margins.reduce((a: number, b: number) => a + b, 0) / margins.length
      : 0;

    // Gesamtumsatz
    const totalRevenue = enrichedProjects.reduce(
      (sum: number, p: any) => sum + (typeof p.total_value === 'number' ? p.total_value : 0),
      0
    );

    // Alerts
    const alerts: any[] = [];
    if (avgMargin > 0 && avgMargin < 15 && activeProjects.length > 0) {
      alerts.push({
        severity: 'critical',
        icon: '📉',
        title: `Ø Marge nur ${avgMargin.toFixed(1)}%`,
        message: 'Ziel: mindestens 25%',
        action: '/aufmass',
        actionLabel: 'Neues Aufmaß',
      });
    }

    return NextResponse.json({
      success: true,
      debug: {
        rawCount: rawProjects.length,
        enrichedCount: enrichedProjects.length,
        activeCount: activeProjects.length,
        completedCount: completedProjects.length,
      },
      stats: {
        activeProjectsCount: activeProjects.length,
        completedProjectsCount: completedProjects.length,
        totalProjects: enrichedProjects.length,
        avgMargin: Math.round(avgMargin * 10) / 10,
        totalRevenue,
        // Lager/Mitarbeiter/Transporte – 0 weil Tabellen leer
        inventoryValue: 0,
        totalEmployees: 0,
        pendingTransports: 0,
      },
      alerts,
      recentProjects: enrichedProjects.slice(0, 10).map((p: any) => ({
        id: p.id,
        name: p.name,
        customer: p.customer,
        margin: p.margin_percent,
        value: p.total_value,
        status: p.status,
        daysSinceUpdate: Math.floor(
          (now.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24)
        ),
      })),
    });
  } catch (error: any) {
    console.error('[Dashboard API] CRASH:', error);
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}