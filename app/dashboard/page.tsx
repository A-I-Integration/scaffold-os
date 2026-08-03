'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import StatsGrid from '@/components/dashboard/StatsGrid';
import AlertFeed from '@/components/dashboard/AlertFeed';
import ProjectsTable from '@/components/dashboard/ProjectsTable';
import LogoutButton from '@/components/LogoutButton';
// ...
<LogoutButton />

interface Project {
  id: string;
  kunde: string;
  status: string;
  created_at: string;
  projektbeginn?: string;
  projektende?: string;
  geplante_standzeit?: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  // ⭐ NEU: Dashboard-API Daten
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const allowedRoles = ['admin', 'disponent'];

      if (!profile || !allowedRoles.includes(profile.role)) {
        router.push('/');
        return;
      }

      setAuthorized(true);

      // Bestehende Projekte laden
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setProjects(data);
      }

      // ⭐ NEU: Dashboard-Stats laden
      try {
        const res = await fetch('/api/dashboard/stats');
        const json = await res.json();
        if (json.success) setDashboardData(json);
      } catch (e) {
        console.error('Dashboard-API Fehler:', e);
      } finally {
        setDashboardLoading(false);
        setLoading(false);
      }
    };

    checkAccess();
  }, []);

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-white">Prüfe Berechtigungen...</div>
      </div>
    );
  }

  const activeProjects = projects.filter((p) => p.status !== 'abgeschlossen');
  const completedProjects = projects.filter((p) => p.status === 'abgeschlossen');
  const criticalProjects = projects.filter((p) => {
    if (!p.projektende) return false;
    const end = new Date(p.projektende);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff <= 7 && diff >= 0;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-white text-lg">Dashboard wird geladen...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* Header */}
      <div className="bg-[#1e293b] border-b border-[#334155] px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">CEO Dashboard</h1>
            <p className="text-[#94a3b8] text-sm mt-1">
              Übersicht aller kritischen Unternehmenskennzahlen
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#94a3b8]">
              {new Date().toLocaleDateString('de-DE', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-[#334155] hover:bg-[#475569] text-white text-sm rounded-lg transition"
            >
              ← Zurück
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        {/* ⭐ NEU: ECHTE STATS AUS DER API */}
        {dashboardLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : dashboardData ? (
          <>
            <StatsGrid stats={dashboardData.stats} />

            {/* ⭐ NEU: ALERTS */}
            <div>
              <h2 className="text-lg font-bold text-white mb-3">
                🔴 Kritische Meldungen
              </h2>
              <AlertFeed alerts={dashboardData.alerts} />
            </div>

            {/* ⭐ NEU: PROJEKTE MIT MARGE */}
            <div>
              <h2 className="text-lg font-bold text-white mb-3">
                Aktive Baustellen
              </h2>
              <ProjectsTable projects={dashboardData.recentProjects} />
            </div>
          </>
        ) : (
          <p className="text-slate-400">Fehler beim Laden der Dashboard-Daten</p>
        )}

        {/* BESTEHENDE TABELLE (optional behalten oder entfernen) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-[#1e293b] border border-[#334155] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#334155] flex items-center justify-between">
              <h2 className="text-lg font-semibold">Laufende Projekte</h2>
              <span className="text-xs text-[#94a3b8] bg-[#0f172a] px-3 py-1 rounded-full">
                {activeProjects.length} aktiv
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#0f172a] text-[#94a3b8]">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium">Kunde</th>
                    <th className="text-left px-6 py-3 font-medium">Status</th>
                    <th className="text-left px-6 py-3 font-medium">Beginn</th>
                    <th className="text-left px-6 py-3 font-medium">Standzeit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#334155]">
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-[#64748b]">
                        Noch keine Projekte vorhanden.
                      </td>
                    </tr>
                  ) : (
                    projects.slice(0, 8).map((project) => (
                      <tr
                        key={project.id}
                        className="hover:bg-[#0f172a] transition cursor-pointer"
                        onClick={() => router.push(`/planung?id=${project.id}`)}
                      >
                        <td className="px-6 py-4 font-medium text-white">
                          {project.kunde || 'Unbenannt'}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                              project.status === 'abgeschlossen'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : project.status === 'in_planung'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}
                          >
                            {project.status || 'In Planung'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[#94a3b8]">
                          {project.projektbeginn
                            ? new Date(project.projektbeginn).toLocaleDateString('de-DE')
                            : '-'}
                        </td>
                        <td className="px-6 py-4 text-[#94a3b8]">
                          {project.geplante_standzeit
                            ? `${project.geplante_standzeit} Tage`
                            : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Seitenleiste */}
          <div className="space-y-6">
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-red-400">⏰</span> Kritische Termine
              </h3>
              {criticalProjects.length === 0 ? (
                <p className="text-sm text-[#64748b]">
                  Keine kritischen Termine diese Woche.
                </p>
              ) : (
                <div className="space-y-3">
                  {criticalProjects.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 bg-[#0f172a] rounded-lg border border-red-500/20"
                    >
                      <div>
                        <p className="text-sm font-medium">{p.kunde}</p>
                        <p className="text-xs text-[#64748b]">
                          Ende:{' '}
                          {p.projektende
                            ? new Date(p.projektende).toLocaleDateString('de-DE')
                            : '-'}
                        </p>
                      </div>
                      <span className="text-xs text-red-400 font-medium">
                        Dringend
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-amber-400">⚠️</span> Offene Risiken
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-[#0f172a] rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Fehlende Genehmigungen</p>
                    <p className="text-xs text-[#64748b] mt-1">
                      2 Projekte ohne Baugenehmigung
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-[#0f172a] rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Materialengpass Rahmen 2m</p>
                    <p className="text-xs text-[#64748b] mt-1">
                      Nur 12 Stück auf Lager
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-[#0f172a] rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Windbelastung Projekt #4</p>
                    <p className="text-xs text-[#64748b] mt-1">
                      Überprüfung erforderlich
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Schnellaktionen</h3>
              <div className="space-y-2">
                <button
                  onClick={() => router.push('/aufmass')}
                  className="w-full text-left px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition"
                >
                  + Neues Aufmaß starten
                </button>
                <button className="w-full text-left px-4 py-3 bg-[#334155] hover:bg-[#475569] rounded-lg text-sm transition">
                  📊 Export Managementbericht
                </button>
                <button className="w-full text-left px-4 py-3 bg-[#334155] hover:bg-[#475569] rounded-lg text-sm transition">
                  🚛 Disposition öffnen
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-[#475569] pt-4">
          SCAFFOLD OS v1.0 • Modul 7: CEO Dashboard • Echtzeit-Daten aus Supabase
        </div>
      </div>
    </div>
  );
}