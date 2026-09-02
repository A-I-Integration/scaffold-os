'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, History, RotateCcw } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Versionshistorie eines Projekts (Phase 25)
// Zeigt frühere Aufmaß-Stände, "Wiederherstellen" sichert den
// aktuellen Stand automatisch selbst als neue Version (nicht
// destruktiv).
// ============================================================

interface Version { id: string; version_number: number; name: string | null; adresse: string | null; created_at: string }

export default function VersionsHistorie({ projectId, onRestored }: { projectId: string; onRestored?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function toggle() {
    const neu = !open;
    setOpen(neu);
    if (neu && !loaded) {
      setLoading(true);
      try {
        const res = await fetch(`/api/project-versions?project_id=${projectId}`);
        const json = await res.json();
        if (json.success) setVersions(json.versions || []);
        setLoaded(true);
      } catch { /* still */ }
      setLoading(false);
    }
  }

  async function restore(versionId: string, versionNumber: number) {
    if (!confirm(`Version ${versionNumber} wiederherstellen? Der aktuelle Stand wird davor automatisch als neue Version gesichert.`)) return;
    setRestoring(versionId);
    try {
      const res = await fetch('/api/project-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, version_id: versionId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      alert('✅ Version wiederhergestellt.');
      setLoaded(false);
      onRestored?.();
    } catch (e: any) {
      alert('❌ ' + e.message);
    }
    setRestoring(null);
  }

  return (
    <div className="mt-3 pt-3 border-t border-black/5">
      <button onClick={toggle} className="flex items-center gap-1.5 text-xs text-[#86868b] hover:text-[#1d1d1f] font-medium">
        <History className="h-3.5 w-3.5" /> Versionshistorie
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="mt-2">
          {loading ? (
            <p className="text-xs text-[#86868b]">Lade…</p>
          ) : versions.length === 0 ? (
            <p className="text-xs text-[#86868b]">Noch keine früheren Versionen – dieser Auftrag wurde noch nicht überschrieben.</p>
          ) : (
            <ul className="space-y-1.5">
              {versions.map(v => (
                <li key={v.id} className="flex items-center justify-between text-xs bg-[#f5f5f7] rounded-lg px-3 py-2">
                  <span>Version {v.version_number} · {new Date(v.created_at).toLocaleString('de-DE')}</span>
                  <button
                    onClick={() => restore(v.id, v.version_number)}
                    disabled={restoring === v.id}
                    className="flex items-center gap-1 text-[#e8590c] hover:underline disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" /> {restoring === v.id ? 'Stellt wieder her…' : 'Wiederherstellen'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
