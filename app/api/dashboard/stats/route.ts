// ============================================================
// app/api/dashboard/stats/route.ts
// SCAFFOLD OS – CEO-Dashboard Daten-API
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // ========================================================
    // 1. LAGER: Kritische Bestände & Wert
    // ========================================================
    const { data: inventory } = await supabase
      .from('inventory')
      .select('article_number, name, quantity, min_stock, unit_price, category')
      .eq('deleted', false);

    const inventoryItems = inventory || [];
    const criticalStock = inventoryItems.filter(
      (i) => i.min_stock && i.quantity <= i.min_stock
    );
    const lowStock = inventoryItems.filter(
      (i) => i.min_stock && i.quantity > i.min_stock && i.quantity <= i.min_stock * 1.5
    );
    const inventoryValue = inventoryItems.reduce(
      (sum, i) => sum + (i.quantity || 0) * (i.unit_price || 0),
      0
    );

    // ========================================================
    // 2. PROJEKTE: Aktive, Margen, Dauer
    // ========================================================
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, customer, address, status, created_at, updated_at, margin_percent, total_value, invoice_status')
      .order('updated_at', { ascending: false });

    const allProjects = projects || [];
    const activeProjects = allProjects.filter((p) => p.status === 'active');
    const completedProjects = allProjects.filter((p) => p.status === 'completed');
    
    // Projekte ohne Schlussrechnung
    const projectsWithoutInvoice = activeProjects.filter(
      (p) => p.invoice_status === 'open' || !p.invoice_status
    );

    // Gerüst steht seit X Tagen (kein Update seit 30+ Tagen)
    const now = new Date();
    const stalledProjects = activeProjects.filter((p) => {
      const lastUpdate = new Date(p.updated_at || p.created_at);
      const daysDiff = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff > 30;
    });

    // Durchschnittliche Marge
    const margins = activeProjects
      .map((p) => p.margin_percent)
      .filter((m) => m !== null && m !== undefined) as number[];
    const avgMargin = margins.length > 0 
      ? margins.reduce((a, b) => a + b, 0) / margins.length 
      : 0;

    // Material ohne Umsatz (im Lager gebunden)
    const materialWithoutRevenue = inventoryValue; // Vereinfacht

    // ========================================================
    // 3. MITARBEITER: Abwesenheiten & Aktive
    // ========================================================
    const { data: employees } = await supabase
      .from('employees')
      .select('id, name, status, absence_type, role');

    const allEmployees = employees || [];
    const totalEmployees = allEmployees.length;
    const activeEmployees = allEmployees.filter((e) => e.status === 'active').length;
    const sickEmployees = allEmployees.filter((e) => e.status === 'sick' || e.absence_type === 'krank').length;
    const vacationEmployees = allEmployees.filter((e) => e.status === 'vacation' || e.absence_type === 'urlaub').length;
    const absentEmployees = sickEmployees + vacationEmployees;

    // ========================================================
    // 4. TRANSPORTE: Aktive & Optimierungspotenzial
    // ========================================================
    const { data: transports } = await supabase
      .from('transport_orders')
      .select('id, status, from_site, to_site, distance_km, created_at')
      .in('status', ['pending', 'in_transit']);

    const activeTransports = transports || [];
    const pendingTransports = activeTransports.filter((t) => t.status === 'pending').length;
    const inTransitTransports = activeTransports.filter((t) => t.status === 'in_transit').length;
    const totalTransportKm = activeTransports.reduce((sum, t) => sum + (t.distance_km || 0), 0);

    // ========================================================
    // 5. KI-BERECHNUNGEN: Letzte Analysen
    // ========================================================
    const { data: calculations } = await supabase
      .from('project_calculations')
      .select('project_id, result_data, created_at, status')
      .order('created_at', { ascending: false })
      .limit(5);

    const recentCalculations = calculations || [];

    // ========================================================
    // 6. ALERTS GENERIEREN
    // ========================================================
    const alerts: DashboardAlert[] = [];

    // Lager-Alerts
    if (criticalStock.length > 0) {
      alerts.push({
        severity: 'critical',
        icon: '📦',
        title: `${criticalStock.length} Artikel im kritischen Bestand`,
        message: criticalStock.slice(0, 3).map((i) => i.name).join(', ') + (criticalStock.length > 3 ? '...' : ''),
        action: '/lager',
        actionLabel: 'Lager öffnen',
      });
    }

    // Projekt-Alerts
    if (stalledProjects.length > 0) {
      const oldest = stalledProjects.sort((a, b) => 
        new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
      )[0];
      const daysStalled = Math.floor(
        (now.getTime() - new Date(oldest.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      alerts.push({
        severity: 'warning',
        icon: '🏗️',
        title: `Gerüst "${oldest.name}" steht seit ${daysStalled} Tagen`,
        message: `Baustelle: ${oldest.address || 'unbekannt'} – Prüfung erforderlich`,
        action: `/aufmass/${oldest.id}`,
        actionLabel: 'Zum Projekt',
      });
    }

    if (projectsWithoutInvoice.length > 0) {
      alerts.push({
        severity: 'warning',
        icon: '💶',
        title: `${projectsWithoutInvoice.length} Baustellen ohne Schlussrechnung`,
        message: `Offener Umsatz: ${projectsWithoutInvoice.reduce((s, p) => s + (p.total_value || 0), 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`,
        action: '/planung',
        actionLabel: 'Rechnungen prüfen',
      });
    }

    // Mitarbeiter-Alerts
    if (sickEmployees > 0) {
      alerts.push({
        severity: 'info',
        icon: '🤒',
        title: `${sickEmployees} Mitarbeiter krankgemeldet`,
        message: 'Einsatzplanung prüfen',
        action: '/planung',
        actionLabel: 'Planung öffnen',
      });
    }

    // Transport-Alerts
    if (pendingTransports > 0) {
      alerts.push({
        severity: 'info',
        icon: '🚛',
        title: `${pendingTransports} Transporte ausstehend`,
        message: 'Disposition prüfen',
        action: '/lager',
        actionLabel: 'Transporte anzeigen',
      });
    }

    // Marge-Alert
    if (avgMargin < 15) {
      alerts.push({
        severity: 'critical',
        icon: '📉',
        title: `Durchschnittsmarge nur ${avgMargin.toFixed(1)}%`,
        message: 'Kalkulationen prüfen – Ziel: mindestens 25%',
        action: '/aufmass',
        actionLabel: 'Neues Aufmaß',
      });
    }

    // ========================================================
    // RESPONSE
    // ========================================================
    return NextResponse.json({
      success: true,
      stats: {
        // Lager
        inventoryValue,
        criticalStockCount: criticalStock.length,
        lowStockCount: lowStock.length,
        totalArticles: inventoryItems.length,

        // Projekte
        activeProjectsCount: activeProjects.length,
        completedProjectsCount: completedProjects.length,
        stalledProjectsCount: stalledProjects.length,
        projectsWithoutInvoiceCount: projectsWithoutInvoice.length,
        avgMargin: Math.round(avgMargin * 10) / 10,
        materialWithoutRevenue: Math.round(inventoryValue),

        // Mitarbeiter
        totalEmployees,
        activeEmployees,
        absentEmployees,
        sickEmployees,
        vacationEmployees,

        // Transporte
        pendingTransports,
        inTransitTransports,
        totalTransportKm,
      },
      alerts: alerts.slice(0, 6), // Max 6 Alerts
      recentProjects: activeProjects.slice(0, 5).map((p) => ({
        id: p.id,
        name: p.name,
        customer: p.customer,
        margin: p.margin_percent,
        value: p.total_value,
        status: p.status,
        daysSinceUpdate: Math.floor(
          (now.getTime() - new Date(p.updated_at || p.created_at).getTime()) / (1000 * 60 * 60 * 24)
        ),
      })),
      recentCalculations: recentCalculations.map((c) => ({
        projectId: c.project_id,
        status: c.status,
        totalCost: c.result_data?.totalCost,
        suggestedPrice: c.result_data?.suggestedPrice,
        margin: c.result_data?.marginPercent,
        createdAt: c.created_at,
      })),
    });
  } catch (error) {
    console.error('Dashboard-Stats fehlgeschlagen:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Dashboard-Daten' },
      { status: 500 }
    );
  }
}

interface DashboardAlert {
  severity: 'critical' | 'warning' | 'info';
  icon: string;
  title: string;
  message: string;
  action: string;
  actionLabel: string;
}