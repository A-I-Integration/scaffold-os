import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

export async function GET() {
  try {
    // 1. LAGER
    const invRes = await fetch(`${url}/rest/v1/inventory?select=*&deleted=eq.false`, { headers });
    const inventoryItems = invRes.ok ? await invRes.json() : [];
    const criticalStock = inventoryItems.filter((i: any) => i.min_stock && i.quantity <= i.min_stock);
    const inventoryValue = inventoryItems.reduce((sum: number, i: any) => sum + (i.quantity || 0) * (i.unit_price || 0), 0);

    // 2. PROJEKTE
    const projRes = await fetch(`${url}/rest/v1/projects?select=*&order=updated_at.desc`, { headers });
    const allProjects = projRes.ok ? await projRes.json() : [];
    const activeProjects = allProjects.filter((p: any) => p.status === 'active');
    const now = new Date();
    const stalledProjects = activeProjects.filter((p: any) => {
      const lastUpdate = new Date(p.updated_at || p.created_at);
      return (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24) > 30;
    });
    const projectsWithoutInvoice = activeProjects.filter((p: any) => p.invoice_status === 'open' || !p.invoice_status);
    const margins = activeProjects.map((p: any) => p.margin_percent).filter((m: any) => m != null);
    const avgMargin = margins.length > 0 ? margins.reduce((a: number, b: number) => a + b, 0) / margins.length : 0;

    // 3. MITARBEITER
    const empRes = await fetch(`${url}/rest/v1/employees?select=*`, { headers });
    const allEmployees = empRes.ok ? await empRes.json() : [];
    const sickEmployees = allEmployees.filter((e: any) => e.status === 'sick' || e.absence_type === 'krank').length;
    const vacationEmployees = allEmployees.filter((e: any) => e.status === 'vacation' || e.absence_type === 'urlaub').length;

    // 4. TRANSPORTE
    const transRes = await fetch(`${url}/rest/v1/transport_orders?select=*&status=in.(pending,in_transit)`, { headers });
    const activeTransports = transRes.ok ? await transRes.json() : [];
    const pendingTransports = activeTransports.filter((t: any) => t.status === 'pending').length;

    // 5. KI-BERECHNUNGEN
    const calcRes = await fetch(`${url}/rest/v1/project_calculations?select=*&order=created_at.desc&limit=5`, { headers });
    const recentCalculations = calcRes.ok ? await calcRes.json() : [];

    // 6. ALERTS
    const alerts: any[] = [];
    if (criticalStock.length > 0) {
      alerts.push({
        severity: 'critical',
        icon: '📦',
        title: `${criticalStock.length} Artikel im kritischen Bestand`,
        message: criticalStock.slice(0, 3).map((i: any) => i.name).join(', ') + (criticalStock.length > 3 ? '...' : ''),
        action: '/lager',
        actionLabel: 'Lager öffnen',
      });
    }
    if (stalledProjects.length > 0) {
      const oldest = stalledProjects.sort((a: any, b: any) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())[0];
      const daysStalled = Math.floor((now.getTime() - new Date(oldest.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      alerts.push({
        severity: 'warning',
        icon: '🏗️',
        title: `Gerüst "${oldest.name}" steht seit ${daysStalled} Tagen`,
        message: `Baustelle: ${oldest.address || 'unbekannt'}`,
        action: `/aufmass/${oldest.id}`,
        actionLabel: 'Zum Projekt',
      });
    }
    if (avgMargin < 15 && activeProjects.length > 0) {
      alerts.push({
        severity: 'critical',
        icon: '📉',
        title: `Durchschnittsmarge nur ${avgMargin.toFixed(1)}%`,
        message: 'Kalkulationen prüfen – Ziel: mindestens 25%',
        action: '/aufmass',
        actionLabel: 'Neues Aufmaß',
      });
    }

    return NextResponse.json({
      success: true,
      stats: {
        inventoryValue,
        criticalStockCount: criticalStock.length,
        lowStockCount: inventoryItems.filter((i: any) => i.min_stock && i.quantity > i.min_stock && i.quantity <= i.min_stock * 1.5).length,
        totalArticles: inventoryItems.length,
        activeProjectsCount: activeProjects.length,
        completedProjectsCount: allProjects.filter((p: any) => p.status === 'completed').length,
        stalledProjectsCount: stalledProjects.length,
        projectsWithoutInvoiceCount: projectsWithoutInvoice.length,
        avgMargin: Math.round(avgMargin * 10) / 10,
        materialWithoutRevenue: Math.round(inventoryValue),
        totalEmployees: allEmployees.length,
        activeEmployees: allEmployees.filter((e: any) => e.status === 'active').length,
        absentEmployees: sickEmployees + vacationEmployees,
        sickEmployees,
        vacationEmployees,
        pendingTransports,
        inTransitTransports: activeTransports.filter((t: any) => t.status === 'in_transit').length,
        totalTransportKm: activeTransports.reduce((sum: number, t: any) => sum + (t.distance_km || 0), 0),
      },
      alerts: alerts.slice(0, 6),
      recentProjects: activeProjects.slice(0, 5).map((p: any) => ({
        id: p.id,
        name: p.name,
        customer: p.customer,
        margin: p.margin_percent,
        value: p.total_value,
        status: p.status,
        daysSinceUpdate: Math.floor((now.getTime() - new Date(p.updated_at || p.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      })),
      recentCalculations: recentCalculations.map((c: any) => ({
        projectId: c.project_id,
        status: c.status,
        totalCost: c.result_data?.totalCost,
        suggestedPrice: c.result_data?.suggestedPrice,
        margin: c.result_data?.marginPercent,
        createdAt: c.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Dashboard-Stats fehlgeschlagen:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}