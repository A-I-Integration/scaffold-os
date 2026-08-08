import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function safeFetch(endpoint: string) {
  try {
    const res = await fetch(`${url}/rest/v1/${endpoint}`, { headers });
    if (!res.ok) { console.warn(`[Dashboard API] ${endpoint} ${res.status}`); return []; }
    return await res.json();
  } catch (e: any) { console.warn(`[Dashboard API] ${endpoint} failed:`, e.message); return []; }
}

function parseData(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

function getMonthKey(d: string) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export async function GET() {
  try {
    // ─── PROJEKTE ───
    const allProjects = await safeFetch('projects?select=*&order=created_at.desc');
    const now = new Date();

    const enrichedProjects = allProjects.map((p: any) => {
      const data = parseData(p.data);
      const step6 = data?.step6 || data?.s6 || {};
      const ki = step6.kiResult || step6.ki_result || {};
      const total_value = p.total_value || ki.suggestedPrice || ki.suggested_price || 0;
      const margin_percent = p.margin_percent || ki.marginPercent || ki.margin_percent || 0;
      // Geschätzte Kosten = Umsatz * (1 - Marge/100)
      const estimated_costs = total_value > 0 && margin_percent > 0
        ? total_value * (1 - margin_percent / 100)
        : 0;
      const estimated_profit = total_value - estimated_costs;
      return {
        id: p.id,
        name: p.name || 'Unbenannt',
        status: p.status || 'active',
        created_at: p.created_at,
        updated_at: p.updated_at || p.created_at,
        customer: data?.step1?.name || data?.s1?.name || p.name || 'Unbekannt',
        total_value,
        margin_percent,
        estimated_costs,
        estimated_profit,
        monthKey: getMonthKey(p.created_at),
      };
    });

    const activeProjects = enrichedProjects.filter((p: any) => p.status !== 'completed');
    const completedProjects = enrichedProjects.filter((p: any) => p.status === 'completed');

    // ─── CHART: Umsatz pro Monat ───
    const monthlyRevenue: Record<string, number> = {};
    const monthlyCount: Record<string, number> = {};
    enrichedProjects.forEach((p: any) => {
      if (p.total_value > 0) {
        monthlyRevenue[p.monthKey] = (monthlyRevenue[p.monthKey] || 0) + p.total_value;
        monthlyCount[p.monthKey] = (monthlyCount[p.monthKey] || 0) + 1;
      }
    });
    const months = Object.keys(monthlyRevenue).sort();
    const revenueChart = months.map(m => ({ month: m, revenue: Math.round(monthlyRevenue[m]), count: monthlyCount[m] || 0 }));

    // ─── CHART: Margen-Verteilung ───
    const marginBuckets = { '0-10%': 0, '10-20%': 0, '20-30%': 0, '30%+': 0, 'Keine': 0 };
    enrichedProjects.forEach((p: any) => {
      const m = p.margin_percent;
      if (m <= 0) marginBuckets['Keine']++;
      else if (m < 10) marginBuckets['0-10%']++;
      else if (m < 20) marginBuckets['10-20%']++;
      else if (m < 30) marginBuckets['20-30%']++;
      else marginBuckets['30%+']++;
    });

    // ─── CHART: Top-Profit-Projekte ───
    const topProfitProjects = [...enrichedProjects]
      .filter((p: any) => p.estimated_profit > 0)
      .sort((a: any, b: any) => b.estimated_profit - a.estimated_profit)
      .slice(0, 5);

    // ─── KPIs ───
    const totalRevenue = enrichedProjects.reduce((s: number, p: any) => s + p.total_value, 0);
    const totalEstimatedCosts = enrichedProjects.reduce((s: number, p: any) => s + p.estimated_costs, 0);
    const totalEstimatedProfit = enrichedProjects.reduce((s: number, p: any) => s + p.estimated_profit, 0);
    const avgMargin = enrichedProjects.filter((p: any) => p.margin_percent > 0).length > 0
      ? enrichedProjects.filter((p: any) => p.margin_percent > 0).reduce((s: number, p: any) => s + p.margin_percent, 0) / enrichedProjects.filter((p: any) => p.margin_percent > 0).length
      : 0;

    // ─── LAGER ───
    const inventoryItems = await safeFetch('inventory?select=*&is_active=eq.true');
    const criticalStock = inventoryItems.filter((i: any) => i.min_stock && i.quantity <= i.min_stock);
    const inventoryValue = inventoryItems.reduce((sum: number, i: any) => sum + (i.quantity || 0) * (i.unit_price || 0), 0);

    // ─── MITARBEITER ───
    const allEmployees = await safeFetch('employees?select=*');

    // ─── TRANSPORTE ───
    const activeTransports = await safeFetch('transport_orders?select=*&status=in.(pending,in_transit)');

    // ─── ALERTS ───
    const alerts: any[] = [];
    if (criticalStock.length > 0) {
      alerts.push({
        severity: 'critical', icon: '📦',
        title: `${criticalStock.length} Artikel kritisch`,
        message: criticalStock.slice(0, 3).map((i: any) => i.name).join(', ') + (criticalStock.length > 3 ? '...' : ''),
        action: '/lager', actionLabel: 'Lager öffnen',
      });
    }
    if (avgMargin > 0 && avgMargin < 15 && activeProjects.length > 0) {
      alerts.push({
        severity: 'critical', icon: '📉',
        title: `Ø Marge nur ${avgMargin.toFixed(1)}%`,
        message: 'Ziel: mindestens 25%', action: '/aufmass', actionLabel: 'Neues Aufmaß',
      });
    }

    return NextResponse.json({
      success: true,
      debug: {
        totalProjects: enrichedProjects.length,
        activeCount: activeProjects.length,
        completedCount: completedProjects.length,
        withValue: enrichedProjects.filter((p: any) => p.total_value > 0).length,
      },
      stats: {
        activeProjectsCount: activeProjects.length,
        completedProjectsCount: completedProjects.length,
        totalProjects: enrichedProjects.length,
        avgMargin: Math.round(avgMargin * 10) / 10,
        totalRevenue,
        totalEstimatedCosts: Math.round(totalEstimatedCosts),
        totalEstimatedProfit: Math.round(totalEstimatedProfit),
        inventoryValue,
        criticalStockCount: criticalStock.length,
        totalArticles: inventoryItems.length,
        totalEmployees: allEmployees.length,
        activeEmployees: allEmployees.filter((e: any) => e.status === 'active').length,
        absentEmployees: allEmployees.filter((e: any) => ['sick', 'vacation'].includes(e.status)).length,
        pendingTransports: activeTransports.filter((t: any) => t.status === 'pending').length,
        inTransitTransports: activeTransports.filter((t: any) => t.status === 'in_transit').length,
      },
      charts: {
        revenueByMonth: revenueChart,
        marginDistribution: marginBuckets,
        topProfitProjects: topProfitProjects.map((p: any) => ({
          id: p.id,
          name: p.name,
          revenue: p.total_value,
          profit: Math.round(p.estimated_profit),
          margin: p.margin_percent,
        })),
      },
      alerts: alerts.slice(0, 6),
      recentProjects: enrichedProjects.slice(0, 10).map((p: any) => ({
        id: p.id,
        name: p.name,
        customer: p.customer,
        margin: p.margin_percent,
        value: p.total_value,
        status: p.status,
        daysSinceUpdate: Math.floor((now.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
      })),
    });
  } catch (error: any) {
    console.error('[Dashboard API] CRASH:', error);
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}