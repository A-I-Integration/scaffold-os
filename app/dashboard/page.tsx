'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Alert {
  severity: 'critical' | 'warning' | 'info';
  icon: string;
  title: string;
  message: string;
  action: string;
  actionLabel: string;
}

interface DashboardData {
  success: boolean;
  stats: {
    inventoryValue: number;
    criticalStockCount: number;
    lowStockCount: number;
    totalArticles: number;
    activeProjectsCount: number;
    completedProjectsCount: number;
    stalledProjectsCount: number;
    projectsWithoutInvoiceCount: number;
    avgMargin: number;
    materialWithoutRevenue: number;
    totalEmployees: number;
    activeEmployees: number;
    absentEmployees: number;
    sickEmployees: number;
    vacationEmployees: number;
    pendingTransports: number;
    inTransitTransports: number;
    totalTransportKm: number;
  };
  alerts: Alert[];
  recentProjects: Array<{
    id: string;
    name: string;
    customer: string;
    margin: number;
    value: number;
    status: string;
    daysSinceUpdate: number;
  }>;
  recentCalculations: Array<{
    projectId: string;
    status: string;
    totalCost: number;
    suggestedPrice: number;
    margin: number;
    createdAt: string;
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <p className="text-center text-slate-400 mt-20">Fehler beim Laden</p>
      </div>
    );
  }

  const s = data.stats;
  const formatCurrency = (n: number) =>
    (n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">📊 CEO Dashboard</h1>
            <p className="text-slate-400">Echtzeit-Kennzahlen</p>
          </div>
          <Link href="/aufmass/schritt1" className="rounded-lg bg-orange-600 hover:bg-orange-700 px-6 py-3 font-bold transition">
            + Neues Projekt
          </Link>
        </div>

        {/* Vision-Message (wenn Daten da) */}
        {s.activeProjectsCount > 0 && (
          <div className="rounded-xl bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-blue-500/20 p-4">
            <p className="text-sm text-blue-200">
              🎯 <span className="font-bold">Heute:</span> {s.activeProjectsCount} aktive Baustellen · Ø Marge {s.avgMargin}% · {formatCurrency(s.materialWithoutRevenue)} Material im Lager
            </p>
          </div>
        )}

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Aktive Projekte" value={s.activeProjectsCount} color="text-emerald-400" />
          <KpiCard label="Lagerwert" value={formatCurrency(s.inventoryValue)} color="text-orange-400" />
          <KpiCard label="Ø Marge" value={`${s.avgMargin}%`} color="text-blue-400" />
          <KpiCard label="Mitarbeiter" value={`${s.activeEmployees}/${s.totalEmployees}`} color="text-purple-400" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Kritische Bestände" value={s.criticalStockCount} color="text-red-400" />
          <KpiCard label="Ausstehende Transporte" value={s.pendingTransports} color="text-yellow-400" />
          <KpiCard label="Kranke/Urlaub" value={s.absentEmployees} color="text-pink-400" />
          <KpiCard label="Ohne Rechnung" value={s.projectsWithoutInvoiceCount} color="text-amber-400" />
        </div>

        {/* Alerts */}
        {data.alerts.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white">🔔 Alerts</h2>
            {data.alerts.map((alert, i) => (
              <div key={i} className={`rounded-lg border p-4 flex items-center justify-between ${
                alert.severity === 'critical' ? 'border-red-500/30 bg-red-500/10' :
                alert.severity === 'warning' ? 'border-amber-500/30 bg-amber-500/10' :
                'border-blue-500/30 bg-blue-500/10'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{alert.icon}</span>
                  <div>
                    <p className={`font-bold ${
                      alert.severity === 'critical' ? 'text-red-300' :
                      alert.severity === 'warning' ? 'text-amber-300' :
                      'text-blue-300'
                    }`}>{alert.title}</p>
                    <p className="text-sm text-slate-400">{alert.message}</p>
                  </div>
                </div>
                <Link href={alert.action} className="text-sm font-bold text-white bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition">
                  {alert.actionLabel}
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Letzte Projekte */}
        <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
          <div className="border-b border-slate-700 p-4">
            <h2 className="text-lg font-bold text-white">🏗️ Aktive Projekte</h2>
          </div>
          {data.recentProjects.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <p className="text-4xl mb-2">📭</p>
              <p>Keine aktiven Projekte</p>
              <Link href="/aufmass/schritt1" className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">Jetzt erstellen →</Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {data.recentProjects.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-4 hover:bg-slate-700/30 transition">
                  <div>
                    <p className="font-semibold text-white">{p.name}</p>
                    <p className="text-sm text-slate-400">{p.customer || 'Kein Kunde'}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-orange-400">{formatCurrency(p.value)}</p>
                      <p className="text-xs text-slate-500">Marge: {p.margin || 0}%</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                      p.daysSinceUpdate > 30 ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {p.daysSinceUpdate} Tage
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Letzte KI-Berechnungen */}
        {data.recentCalculations.length > 0 && (
          <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
            <div className="border-b border-slate-700 p-4">
              <h2 className="text-lg font-bold text-white">🤖 Letzte KI-Berechnungen</h2>
            </div>
            <div className="divide-y divide-slate-700">
              {data.recentCalculations.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-semibold text-white">Projekt {c.projectId.slice(0, 8)}</p>
                    <p className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString('de-DE')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-400">{formatCurrency(c.suggestedPrice)}</p>
                    <p className="text-xs text-slate-500">Kosten: {formatCurrency(c.totalCost)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
      <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}