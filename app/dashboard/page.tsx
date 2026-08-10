"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw, Plus, AlertTriangle, CalendarDays, Euro, Users, Warehouse,
  CheckCircle2, RotateCcw, Trash2,
} from "lucide-react";

// ============================================================
// SCAFFOLD OS – Dashboard (aufgeräumt, 10.08.2026)
//
// NEU gegenüber der alten Version:
// • Gruppierte Abschnitte in sinnvoller Reihenfolge:
//   Alerts → Betrieb heute → Finanzen → Team & Lager →
//   Charts → Projekte
// • KPI-Karten sind anklickbar und springen in den
//   passenden Bereich (Touren, Planung, Zeiterfassung …)
// • Einheitliches dunkles Slate-Design (wie die neueren
//   Seiten Prognose/Zeiterfassung)
// • Projekte direkt hier abschließen / wieder öffnen /
//   löschen (Admin + Dispo, Sicherheitsabfrage)
// • Hinweis, wenn Geldbeträge 0 € sind, weil noch keine
//   Aufmaß-Preise (Schritt 6) vorliegen
// Daten kommen weiterhin aus /api/dashboard/stats.
// ============================================================

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
  withValueCount: number;
}

interface RevenueMonth { month: string; revenue: number; count: number }
interface MarginDist { '0-10%': number; '10-20%': number; '20-30%': number; '30%+': number; 'Keine': number }
interface TopProfit { id: string; name: string; revenue: number; profit: number; margin: number }
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function loadDashboard() {
    setError("");
    try {
      const res = await fetch(`/api/dashboard/stats?t=${Date.now()}`, { cache: "no-store" });
      const json = await res.json();
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

  // ─── NEU: Projekt abschließen / wieder öffnen ───
  async function setProjectStatus(p: Project, status: 'active' | 'completed') {
    setBusyId(p.id);
    setMsg("");
    try {
      const res = await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, status }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg(status === 'completed' ? `✅ „${p.name}" abgeschlossen.` : `✅ „${p.name}" wieder geöffnet.`);
      await loadDashboard();
    } catch (e: any) {
      setMsg('Fehler: ' + e.message);
    } finally {
      setBusyId(null);
    }
  }

  // ─── NEU: Projekt löschen (mit Sicherheitsabfrage) ───
  async function deleteProject(p: Project) {
    if (!window.confirm(`Projekt „${p.name}" wirklich löschen?\n\nDas kann nicht rückgängig gemacht werden. Falls Touren/Transporte/Zeiten damit verknüpft sind, wird das Löschen verweigert – dann besser abschließen.`)) return;
    setBusyId(p.id);
    setMsg("");
    try {
      const res = await fetch(`/api/projects?id=${p.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg(`✅ „${p.name}" gelöscht.`);
      await loadDashboard();
    } catch (e: any) {
      setMsg('Fehler: ' + e.message);
    } finally {
      setBusyId(null);
    }
  }

  // ─── CHART HELPERS (unverändert) ───
  function formatCurrency(val: number) {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M €`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k €`;
    return `${Math.round(val)} €`;
  }
  function formatMonth(m: string) {
    const [y, mo] = m.split('-');
    return `${mo}/${y}`;
  }

  const maxRevenue = charts?.revenueByMonth?.length
    ? Math.max(...charts.revenueByMonth.map(d => d.revenue)) * 1.1
    : 1;
  const marginTotal = charts?.marginDistribution
    ? Object.values(charts.marginDistribution).reduce((a, b) => a + b, 0)
    : 1;

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4" />
          <p className="text-slate-400">Dashboard wird geladen …</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">

        {/* ─── Kopf ─── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-amber-400">Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">Live-Übersicht · aktualisiert alle 15 s</p>
          </div>
          <div className="flex gap-3">
            <button onClick={loadDashboard}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1e293b] border border-[#334155] hover:border-amber-400 rounded-lg text-sm transition-colors">
              <RefreshCw className="w-4 h-4" /> Aktualisieren
            </button>
            <button onClick={() => router.push("/aufmass/schritt1")}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg text-sm font-semibold transition-colors">
              <Plus className="w-4 h-4" /> Neues Aufmaß
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6 text-red-300">
            Fehler: {error}
          </div>
        )}
        {msg && (
          <div className={`rounded-lg p-3 text-sm mb-6 ${msg.startsWith('✅') ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-200' : 'bg-red-900/40 border border-red-700 text-red-200'}`}>
            {msg}
          </div>
        )}

        {/* ═══ 1) ALERTS – Wichtigstes zuerst ═══ */}
        {alerts.length > 0 && (
          <Section icon={<AlertTriangle className="w-5 h-5 text-red-400" />} title="Handlungsbedarf">
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-center justify-between gap-3 p-4 rounded-xl border ${
                  a.severity === "critical" ? "bg-red-900/20 border-red-700/50" : "bg-yellow-900/20 border-yellow-700/50"
                }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{a.icon}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-white">{a.title}</p>
                      <p className="text-sm text-slate-400 truncate">{a.message}</p>
                    </div>
                  </div>
                  <button onClick={() => router.push(a.action)}
                    className="shrink-0 px-3 py-1.5 bg-[#1e293b] border border-[#334155] hover:border-amber-400 rounded-lg text-sm transition-colors">
                    {a.actionLabel}
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ═══ 2) BETRIEB HEUTE ═══ */}
        {stats && (
          <Section icon={<CalendarDays className="w-5 h-5 text-blue-400" />} title="Betrieb heute">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard label="Touren heute" value={stats.toursToday} color="text-blue-400" href="/touren" />
              <KpiCard label="Unterwegs" value={stats.toursInProgress} color={stats.toursInProgress > 0 ? "text-amber-400" : "text-slate-400"} href="/touren" />
              <KpiCard label="Geplante Touren" value={stats.toursPlanned} color="text-purple-400" href="/touren" />
              <KpiCard label="Stunden (7 Tage)" value={stats.hoursThisWeek.toLocaleString("de-DE")} color="text-emerald-400" href="/zeiterfassung" />
              <KpiCard label="Abwesend heute" value={stats.absentToday} color={stats.absentToday > 0 ? "text-red-400" : "text-green-400"} href="/planung" />
              <KpiCard label="Offene Anträge" value={stats.pendingAbsences} color={stats.pendingAbsences > 0 ? "text-amber-400" : "text-slate-400"} href="/planung" />
            </div>
          </Section>
        )}

        {/* ═══ 3) FINANZEN ═══ */}
        {stats && (
          <Section icon={<Euro className="w-5 h-5 text-emerald-400" />} title="Finanzen">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard label="Aktive Projekte" value={stats.activeProjectsCount} color="text-amber-400" href="#projekte" />
              <KpiCard label="Abgeschlossen" value={stats.completedProjectsCount} color="text-slate-400" href="#projekte" />
              <KpiCard label="Gesamtumsatz" value={formatCurrency(stats.totalRevenue)} color="text-emerald-400" />
              <KpiCard label="Gesch. Kosten" value={formatCurrency(stats.totalEstimatedCosts)} color="text-red-400" />
              <KpiCard label="Gesch. Gewinn" value={formatCurrency(stats.totalEstimatedProfit)} color="text-green-400" />
              <KpiCard label="Ø Marge" value={`${stats.avgMargin}%`} color={stats.avgMargin < 15 ? "text-red-400" : "text-green-400"} />
            </div>
            {stats.withValueCount === 0 && stats.totalProjects > 0 && (
              <p className="text-xs text-slate-500 mt-3">
                Umsatz/Kosten/Gewinn/Marge stehen auf 0, weil noch kein Projekt einen
                KI-Preis aus Aufmaß Schritt 6 hat. Sobald ein Aufmaß komplett
                durchgerechnet ist, füllen sich diese Werte automatisch.
              </p>
            )}
          </Section>
        )}

        {/* ═══ 4) TEAM & LAGER ═══ */}
        {stats && (
          <Section icon={<Users className="w-5 h-5 text-amber-400" />} title="Team & Lager">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard label="Mitarbeiter aktiv" value={stats.activeEmployees} color="text-emerald-400" href="/planung" />
              <KpiCard label="Langzeit abwesend" value={stats.absentEmployees} color={stats.absentEmployees > 0 ? "text-amber-400" : "text-slate-400"} href="/planung" />
              <KpiCard label="Lagerwert" value={formatCurrency(stats.inventoryValue)} color="text-blue-400" href="/lager" />
              <KpiCard label="Artikel kritisch" value={stats.criticalStockCount} color={stats.criticalStockCount > 0 ? "text-red-400" : "text-green-400"} href="/prognose" />
              <KpiCard label="Transporte offen" value={stats.pendingTransports} color={stats.pendingTransports > 0 ? "text-amber-400" : "text-slate-400"} href="/lager" />
              <KpiCard label="Unterwegs (Transport)" value={stats.inTransitTransports} color="text-blue-400" href="/lager" />
            </div>
          </Section>
        )}

        {/* ═══ 5) CHARTS ═══ */}
        {charts && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Umsatz pro Monat */}
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-300 mb-4">📊 Umsatz pro Monat</h3>
              {charts.revenueByMonth.length === 0 ? (
                <p className="text-slate-500 text-sm">Noch keine Umsatzdaten – erscheint, sobald ein Aufmaß mit KI-Preis (Schritt 6) fertig ist.</p>
              ) : (
                <div className="space-y-3">
                  {charts.revenueByMonth.map((d) => (
                    <div key={d.month} className="flex items-center gap-3">
                      <div className="w-16 text-xs text-slate-500 text-right shrink-0">{formatMonth(d.month)}</div>
                      <div className="flex-1 h-8 bg-slate-800 rounded overflow-hidden relative">
                        <div className="h-full bg-emerald-500/80 rounded transition-all duration-700"
                          style={{ width: `${Math.max(5, (d.revenue / maxRevenue) * 100)}%` }} />
                        <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white drop-shadow">
                          {formatCurrency(d.revenue)} ({d.count} Proj{d.count === 1 ? 'ekt' : 'ekte'})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Margen-Verteilung */}
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-300 mb-4">📈 Margen-Verteilung</h3>
              {marginTotal === 0 ? (
                <p className="text-slate-500 text-sm">Noch keine Marge-Daten vorhanden.</p>
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
                      'bg-slate-600';
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <div className="w-20 text-xs text-slate-500 text-right shrink-0">{label}</div>
                        <div className="flex-1 h-8 bg-slate-800 rounded overflow-hidden relative">
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

        {/* Top-Gewinn-Projekte */}
        {charts && charts.topProfitProjects.length > 0 && (
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-slate-300 mb-4">🏆 Top-Gewinn-Projekte</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {charts.topProfitProjects.map((p) => (
                <div key={p.id}
                  className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-amber-500/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/aufmass/schritt6?id=${p.id}`)}>
                  <div className="text-sm font-medium text-white truncate">{p.name}</div>
                  <div className="text-xs text-slate-500 mt-1">Umsatz: {formatCurrency(p.revenue)}</div>
                  <div className="text-lg font-bold text-green-400 mt-2">+{formatCurrency(p.profit)}</div>
                  <div className="text-xs text-slate-400">Marge: {p.margin}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ 6) PROJEKTE – mit Abschließen / Löschen ═══ */}
        <div id="projekte">
          <h2 className="text-lg font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-amber-400" /> Letzte Projekte {projects.length > 0 && `(${projects.length})`}
          </h2>

          {projects.length === 0 ? (
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-8 text-center">
              <p className="text-slate-500 mb-4">Keine Projekte gefunden.</p>
              <button onClick={() => router.push("/aufmass/schritt1")}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg text-sm font-semibold transition-colors">
                Erstes Aufmaß anlegen
              </button>
            </div>
          ) : (
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl overflow-x-auto">
              <table className="w-full text-left min-w-[720px]">
                <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Projekt</th>
                    <th className="px-4 py-3">Kunde</th>
                    <th className="px-4 py-3">Wert</th>
                    <th className="px-4 py-3">Marge</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Update</th>
                    <th className="px-4 py-3 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {projects.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/aufmass/schritt6?id=${p.id}`)}>
                      <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                      <td className="px-4 py-3 text-slate-400">{p.customer}</td>
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
                          <span className="text-slate-600">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          p.status === "active" ? "bg-amber-900/50 text-amber-400" :
                          p.status === "completed" ? "bg-green-900/50 text-green-400" :
                          "bg-slate-800 text-slate-400"
                        }`}>
                          {p.status === "active" ? "Aktiv" : p.status === "completed" ? "Abgeschlossen" : p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-sm">
                        {p.daysSinceUpdate === 0 ? "Heute" : `vor ${p.daysSinceUpdate} Tagen`}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex gap-2">
                          {p.status === "active" ? (
                            <button
                              disabled={busyId === p.id}
                              onClick={() => setProjectStatus(p, 'completed')}
                              title="Projekt abschließen"
                              className="inline-flex items-center gap-1 text-xs border border-slate-600 hover:border-emerald-400 text-slate-300 hover:text-emerald-400 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-40">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Abschließen
                            </button>
                          ) : (
                            <button
                              disabled={busyId === p.id}
                              onClick={() => setProjectStatus(p, 'active')}
                              title="Projekt wieder öffnen"
                              className="inline-flex items-center gap-1 text-xs border border-slate-600 hover:border-amber-400 text-slate-300 hover:text-amber-400 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-40">
                              <RotateCcw className="w-3.5 h-3.5" /> Öffnen
                            </button>
                          )}
                          <button
                            disabled={busyId === p.id}
                            onClick={() => deleteProject(p)}
                            title="Projekt löschen"
                            className="inline-flex items-center gap-1 text-xs border border-slate-600 hover:border-red-400 text-slate-300 hover:text-red-400 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-40">
                            <Trash2 className="w-3.5 h-3.5" /> Löschen
                          </button>
                        </div>
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

// ─── Abschnitts-Rahmen ───
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-slate-300 mb-3 flex items-center gap-2">{icon} {title}</h2>
      {children}
    </div>
  );
}

// ─── KPI-Karte (jetzt optional anklickbar) ───
function KpiCard({ label, value, color, href }: { label: string; value: string | number; color: string; href?: string }) {
  const router = useRouter();
  const clickable = !!href;
  return (
    <div
      onClick={clickable ? () => router.push(href!) : undefined}
      className={`bg-[#1e293b] border border-[#334155] rounded-xl p-4 transition-colors ${
        clickable ? 'cursor-pointer hover:border-amber-400/60' : ''
      }`}
      title={clickable ? 'Bereich öffnen' : undefined}
    >
      <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
