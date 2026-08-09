"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Project {
  id: string;
  name: string;
  customer: string;
  margin: number;
  value: number;
  status: string;
  daysSinceUpdate: number;
}

interface Alert {
  severity: string;
  icon: string;
  title: string;
  message: string;
  action: string;
  actionLabel: string;
}

interface Stats {
  activeProjectsCount: number;
  completedProjectsCount: number;
  totalProjects: number;
  avgMargin: number;
  totalRevenue: number;
  totalEstimatedCosts: number;
  totalEstimatedProfit: number;
  inventoryValue: number;
  criticalStockCount: number;
  totalArticles: number;
  totalEmployees: number;
  activeEmployees: number;
  absentEmployees: number;
  pendingTransports: number;
  inTransitTransports: number;
  toursToday: number;
  toursPlanned: number;
  toursInProgress: number;
  absentToday: number;
  pendingAbsences: number;
  hoursThisWeek: number;
}

interface RevenueMonth {
  month: string;
  revenue: number;
  count: number;
}

interface MarginDist {
  '0-10%': number;
  '10-20%': number;
  '20-30%': number;
  '30%+': number;
  'Keine': number;
}

interface TopProfit {
  id: string;
  name: string;
  revenue: number;
  profit: number;
  margin: number;
}

interface ChartsData {
  revenueByMonth: RevenueMonth[];
  marginDistribution: MarginDist;
  topProfitProjects: TopProfit[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [charts, setCharts] = useState<ChartsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/stats?t=${Date.now()}`, { cache: "no-store" });
      const json = await res.json();
      console.log("[Dashboard] Response:", json);

      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (!json.success) throw new Error(json.error || "API success=false");

      setStats(json.stats);
      setProjects(json.recentProjects || []);
      setAlerts(json.alerts || []);
      setCharts(json.charts || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4" />
          <p className="text-gray-400">Dashboard wird geladen...</p>
        </div>
      </div>
    );
  }

  // ─── CHART HELPERS ───
  function formatCurrency(val: number) {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M €`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k €`;
    return `${val} €`;
  }

  function formatMonth(m: string) {
    const [y, mo] = m.split('-');
    return `${mo}/${y}`;
  }

  // Max für Chart-Skalierung
  const maxRevenue = charts?.revenueByMonth?.length
    ? Math.max(...charts.revenueByMonth.map(d => d.revenue)) * 1.1
    : 1;

  const marginTotal = charts?.marginDistribution
    ? Object.values(charts.marginDistribution).reduce((a, b) => a + b, 0)
    : 1;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-amber-500">SCAFFOLD OS</h1>
            <p className="text-gray-400 text-sm mt-1">CEO Dashboard – Live-Übersicht</p>
          </div>
          <div className="flex gap-3">
            <button onClick={loadDashboard} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">
              🔄 Aktualisieren
            </button>
            <button onClick={() => router.push("/aufmass/schritt1")} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition-colors">
              + Neues Aufmaß
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6 text-red-300">
            ❌ Fehler: {error}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* KPI CARDS – ERWEITERT */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <KpiCard label="Aktive Projekte" value={stats.activeProjectsCount} color="text-amber-400" />
            <KpiCard label="Gesamtumsatz" value={formatCurrency(stats.totalRevenue)} color="text-emerald-400" />
            <KpiCard label="Gesch. Kosten" value={formatCurrency(stats.totalEstimatedCosts)} color="text-red-400" />
            <KpiCard label="Gesch. Gewinn" value={formatCurrency(stats.totalEstimatedProfit)} color="text-green-400" />
            <KpiCard label="Ø Marge" value={`${stats.avgMargin}%`} color={stats.avgMargin < 15 ? "text-red-400" : "text-green-400"} />
            <KpiCard label="Lagerwert" value={formatCurrency(stats.inventoryValue)} color="text-blue-400" />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* BETRIEB HEUTE – Touren, Zeiterfassung, Abwesenheiten */}
        {stats && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-300 mb-3">🗓️ Betrieb heute</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard label="Touren heute" value={stats.toursToday} color="text-blue-400" />
              <KpiCard label="Unterwegs" value={stats.toursInProgress} color={stats.toursInProgress > 0 ? "text-amber-400" : "text-gray-400"} />
              <KpiCard label="Geplante Touren" value={stats.toursPlanned} color="text-purple-400" />
              <KpiCard label="Stunden (7 Tage)" value={stats.hoursThisWeek.toLocaleString("de-DE")} color="text-emerald-400" />
              <KpiCard label="Abwesend heute" value={stats.absentToday} color={stats.absentToday > 0 ? "text-red-400" : "text-green-400"} />
              <KpiCard label="Offene Anträge" value={stats.pendingAbsences} color={stats.pendingAbsences > 0 ? "text-amber-400" : "text-gray-400"} />
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* CHARTS ROW */}
        {charts && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* CHART 1: Umsatz pro Monat */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-300 mb-4">📊 Umsatz pro Monat</h3>
              {charts.revenueByMonth.length === 0 ? (
                <p className="text-gray-500 text-sm">Noch keine Umsatzdaten vorhanden.</p>
              ) : (
                <div className="space-y-3">
                  {charts.revenueByMonth.map((d) => (
                    <div key={d.month} className="flex items-center gap-3">
                      <div className="w-16 text-xs text-gray-500 text-right shrink-0">{formatMonth(d.month)}</div>
                      <div className="flex-1 h-8 bg-gray-800 rounded overflow-hidden relative">
                        <div
                          className="h-full bg-emerald-500/80 rounded transition-all duration-700"
                          style={{ width: `${Math.max(5, (d.revenue / maxRevenue) * 100)}%` }}
                        />
                        <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white drop-shadow">
                          {formatCurrency(d.revenue)} ({d.count} Proj{d.count === 1 ? 'ekt' : 'ekte'})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CHART 2: Margen-Verteilung */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-300 mb-4">📈 Margen-Verteilung</h3>
              {marginTotal === 0 ? (
                <p className="text-gray-500 text-sm">Noch keine Marge-Daten vorhanden.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(charts.marginDistribution).map(([label, count]) => {
                    if (count === 0) return null;
                    const pct = (count / marginTotal) * 100;
                    const barColor =
                      label === '30%+' ? 'bg-green-500' :
                      label === '20-30%' ? 'bg-emerald-400' :
                      label === '10-20%' ? 'bg-yellow-500' :
                      label === '0-10%' ? 'bg-red-500' :
                      'bg-gray-600';
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <div className="w-20 text-xs text-gray-500 text-right shrink-0">{label}</div>
                        <div className="flex-1 h-8 bg-gray-800 rounded overflow-hidden relative">
                          <div className={`h-full ${barColor}/80 rounded transition-all duration-700`} style={{ width: `${Math.max(5, pct)}%` }} />
                          <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white drop-shadow">
                            {count} Projekt{count !== 1 ? 'e' : ''} ({Math.round(pct)}%)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TOP-PROFIT-PROJEKTE */}
        {charts && charts.topProfitProjects.length > 0 && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-300 mb-4">🏆 Top-Gewinn-Projekte</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {charts.topProfitProjects.map((p) => (
                <div key={p.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-amber-500/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/aufmass/schritt6?id=${p.id}`)}>
                  <div className="text-sm font-medium text-white truncate">{p.name}</div>
                  <div className="text-xs text-gray-500 mt-1">Umsatz: {formatCurrency(p.revenue)}</div>
                  <div className="text-lg font-bold text-green-400 mt-2">+{formatCurrency(p.profit)}</div>
                  <div className="text-xs text-gray-400">Marge: {p.margin}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ALERTS */}
        {alerts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-300 mb-3">⚠️ Alerts</h2>
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-center justify-between p-4 rounded-lg border ${
                  a.severity === "critical" ? "bg-red-900/20 border-red-700/50" : "bg-yellow-900/20 border-yellow-700/50"
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{a.icon}</span>
                    <div>
                      <p className="font-medium text-white">{a.title}</p>
                      <p className="text-sm text-gray-400">{a.message}</p>
                    </div>
                  </div>
                  <button onClick={() => router.push(a.action)} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors">
                    {a.actionLabel}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PROJEKTE TABELLE */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-300">
              📋 Letzte Projekte {projects.length > 0 && `(${projects.length})`}
            </h2>
            <span className="text-xs text-gray-500">Auto-Refresh: 15s</span>
          </div>

          {projects.length === 0 ? (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-8 text-center">
              <p className="text-gray-500 mb-4">Keine Projekte gefunden.</p>
              <button onClick={() => router.push("/aufmass/schritt1")} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition-colors">
                Erstes Aufmaß anlegen
              </button>
            </div>
          ) : (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Projekt</th>
                    <th className="px-4 py-3">Kunde</th>
                    <th className="px-4 py-3">Wert</th>
                    <th className="px-4 py-3">Marge</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {projects.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-800/30 transition-colors cursor-pointer" onClick={() => router.push(`/aufmass/schritt6?id=${p.id}`)}>
                      <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                      <td className="px-4 py-3 text-gray-400">{p.customer}</td>
                      <td className="px-4 py-3 text-emerald-400">
                        {p.value > 0 ? `${p.value.toLocaleString("de-DE")} €` : "–"}
                      </td>
                      <td className="px-4 py-3">
                        {p.margin > 0 ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            p.margin >= 25 ? "bg-green-900/50 text-green-400" :
                            p.margin >= 15 ? "bg-yellow-900/50 text-yellow-400" :
                            "bg-red-900/50 text-red-400"
                          }`}>
                            {p.margin}%
                          </span>
                        ) : (
                          <span className="text-gray-600">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          p.status === "active" ? "bg-amber-900/50 text-amber-400" :
                          p.status === "completed" ? "bg-green-900/50 text-green-400" :
                          "bg-gray-800 text-gray-400"
                        }`}>
                          {p.status === "active" ? "Aktiv" : p.status === "completed" ? "Abgeschlossen" : p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-sm">
                        {p.daysSinceUpdate === 0 ? "Heute" : `vor ${p.daysSinceUpdate} Tagen`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
      <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}