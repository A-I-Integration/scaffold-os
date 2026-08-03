import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

export async function GET() {
  try {
    // 1. ALLE PROJEKTE (inkl. data-Feld für KI-Ergebnisse)
    const projRes = await fetch(`${url}/rest/v1/projects?select=*&order=created_at.desc`, { headers });
    const allProjects = projRes.ok ? await projRes.json() : [];

    // Aus projects.data die KI-Ergebnisse extrahieren
    const enrichedProjects = allProjects.map((p: any) => {
      const step6 = p.data?.step6 || {};
      const ki = step6.kiResult || {};
      return {
        ...p,
        margin_percent: p.margin_percent || ki.marginPercent || 0,
        total_value: p.total_value || ki.suggestedPrice || 0,
        invoice_status: p.invoice_status || 'open',
      };
    });

    const activeProjects = enrichedProjects.filter((p: any) => p.status === 'active');
    const now = new Date();

    // 2. LAGER
    const invRes = await fetch(`${url}/rest/v1/inventory?select=*&deleted=eq.false`, { headers });
    const inventoryItems = invRes.ok ? await invRes.json() : [];
    const criticalStock = inventoryItems.filter((i: any) => i.min_stock && i.quantity <= i.min_stock);
    const inventoryValue = inventoryItems.reduce((sum: number, i: any) => sum + (i.quantity || 0) * (i.unit_price || 0), 0);

    // 3. MITARBEITER
    const empRes = await fetch(`${url}/rest/v1/employees?select=*`, { headers });
    const allEmployees = empRes.ok ? await empRes.json() : [];

    // 4. TRANSPORTE
    const transRes = await fetch(`${url}/rest/v1/transport_orders?select=*&status=in.(pending,in_transit)`, { headers });
    const activeTransports = transRes.ok ? await transRes.json() : [];

    // 5. MARGEN aus KI-Ergebnissen
    const margins = activeProjects.map((p: any) => p.margin_percent).filter((m: any) => m > 0);
    const avgMargin = margins.length > 0 ? margins.reduce((a: number, b: number) => a + b, 0) / margins.length : 0;

    // 6. ALERTS
    const alerts: any[] = [];
    if (criticalStock.length > 0) {
      alerts.push({
        severity: 'critical', icon: '📦',
        title: `${criticalStock.length} Artikel kritisch`,
        message: criticalStock.slice(0, 3).map((i: any) => i.name).join(', ') + (criticalStock.length > 3 ? '...' : ''),
        action: '/lager', actionLabel: 'Lager öffnen',
      });
    }
    if (avgMargin < 15 && activeProjects.length > 0) {
      alerts.push({
        severity: 'critical', icon: '📉',
        title: `Ø Marge nur ${avgMargin.toFixed(1)}%`,
        message: 'Ziel: mindestens 25%', action: '/aufmass', actionLabel: 'Neues Aufmaß',
      });
    }

    // 7. GESAMTUMSATZ aus allen Projekten
    const totalRevenue = enrichedProjects.reduce((sum: number, p: any) => sum + (p.total_value || 0), 0);

    return NextResponse.json({
      success: true,
      stats: {
        inventoryValue,
        criticalStockCount: criticalStock.length,
        totalArticles: inventoryItems.length,
        activeProjectsCount: activeProjects.length,
        avgMargin: Math.round(avgMargin * 10) / 10,
        materialWithoutRevenue: Math.round(inventoryValue),
        totalEmployees: allEmployees.length,
        activeEmployees: allEmployees.filter((e: any) => e.status === 'active').length,
        absentEmployees: allEmployees.filter((e: any) => ['sick', 'vacation'].includes(e.status)).length,
        pendingTransports: activeTransports.filter((t: any) => t.status === 'pending').length,
        totalTransportKm: activeTransports.reduce((sum: number, t: any) => sum + (t.distance_km || 0), 0),
        totalRevenue,
      },
      alerts: alerts.slice(0, 6),
      recentProjects: enrichedProjects.slice(0, 5).map((p: any) => ({
        id: p.id,
        name: p.name,
        customer: p.data?.step1?.name || 'Unbekannt',
        margin: p.margin_percent,
        value: p.total_value,
        status: p.status,
        daysSinceUpdate: Math.floor((now.getTime() - new Date(p.updated_at || p.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      })),
      recentCalculations: [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}