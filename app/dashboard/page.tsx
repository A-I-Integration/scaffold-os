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

interface Stats {
  activeProjectsCount: number;
  completedProjectsCount: number;
  totalProjects: number;
  avgMargin: number;
  totalRevenue: number;
  inventoryValue: number;
  totalEmployees: number;
  pendingTransports: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [debug, setDebug] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/stats?t=${Date.now()}`, { cache: "no-store" });
      const json = await res.json();
      console.log("[Dashboard] API Response:", json);

      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (!json.success) throw new Error(json.error || "API success=false");

      setStats(json.stats);
      setProjects(json.recentProjects || []);
      setAlerts(json.alerts || []);
      setDebug(json.debug || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
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

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-amber-500">SCAFFOLD OS</h1>
            <p className="text-gray-400 text-sm mt-1">CEO Dashboard</p>
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">
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

        {/* Debug-Info (nur während Entwicklung) */}
        {debug && (
          <div className="mb-4 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-gray-500">
            Debug: raw={debug.rawCount} | enriched={debug.enrichedCount} | active={debug.activeCount} | completed={debug.completedCount}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Aktive Projekte" value={stats.activeProjectsCount} color="text-amber-400" />
            <StatCard label="Gesamt Projekte" value={stats.totalProjects} color="text-white" />
            <StatCard label="Ø Marge" value={`${stats.avgMargin}%`} color={stats.avgMargin < 15 && stats.avgMargin > 0 ? "text-red-400" : "text-green-400"} />
            <StatCard label="Gesamtumsatz" value={`${(stats.totalRevenue / 1000).toFixed(1)}k €`} color="text-emerald-400" />
            <StatCard label="Lagerwert" value={`${(stats.inventoryValue / 1000).toFixed(1)}k €`} color="text-blue-400" />
            <StatCard label="Mitarbeiter" value={stats.totalEmployees} color="text-purple-400" />
            <StatCard label="Transporte" value={stats.pendingTransports} color="text-orange-400" />
            <StatCard label="Abgeschlossen" value={stats.completedProjectsCount} color="text-gray-400" />
          </div>
        )}

        {/* Alerts */}
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

        {/* Projects Table */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-300">
              📋 Projekte {projects.length > 0 && `(${projects.length})`}
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
                    <tr key={p.id} className="hover:bg-gray-800/30 transition-colors">
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

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
      <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}