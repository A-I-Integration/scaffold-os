'use client';

import { useState, useEffect, useCallback } from 'react';
import ProjektDokumentation from '@/components/ProjektDokumentation';

// ============================================================
// SCAFFOLD OS – Dokumentation (Phase 18)
// Projekt wählen, dann Prüfung/Freigabe, Standzeit, Gerüst-
// änderungen, Demontage und Rücktransport dokumentieren.
// Für alle 5 Rollen freigegeben (siehe SidebarLayout NAV_ITEMS).
// ============================================================

interface Project {
  id: string;
  name: string | null;
  adresse: string | null;
  status: string;
}

const PROJECT_KEY = 'scaffold_dokumentation_project';

export default function DokumentationPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Projekte konnten nicht geladen werden.');
      const list: Project[] = json.projects || [];
      setProjects(list);
      const saved = localStorage.getItem(PROJECT_KEY);
      if (saved && list.some(p => p.id === saved)) setProjectId(saved);
      else if (list.length === 1) setProjectId(list[0].id);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function selectProject(id: string) {
    setProjectId(id);
    localStorage.setItem(PROJECT_KEY, id);
  }

  const inputCls = 'w-full rounded-lg bg-[#f5f5f7] border border-black/10 px-3 py-2 text-[#1d1d1f] focus:border-[#e8590c] focus:outline-none';

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold">📋 Dokumentation</h1>
          <p className="text-[#86868b] mt-1">
            Prüfung/Freigabe, Standzeit, Gerüständerungen, Demontage und Rücktransport festhalten.
          </p>
        </header>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>}

        <section className="bg-white border border-black/5 rounded-2xl p-5">
          <label className="block text-sm text-[#86868b] mb-1">Projekt / Baustelle *</label>
          {loading ? (
            <p className="text-[#86868b] text-sm">Lade Projekte…</p>
          ) : (
            <select value={projectId} onChange={e => selectProject(e.target.value)} className={inputCls}>
              <option value="">– Projekt wählen –</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name || p.adresse || p.id} {p.status === 'completed' ? '(abgeschlossen)' : ''}
                </option>
              ))}
            </select>
          )}
        </section>

        {projectId && <ProjektDokumentation projectId={projectId} />}
      </div>
    </div>
  );
}
