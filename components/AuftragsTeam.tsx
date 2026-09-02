'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, X } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Mitarbeiter-Auftrags-Zuordnung (Phase 28)
// ============================================================

interface Zuweisung { id: string; rolle: string | null; employee: { id: string; first_name: string; last_name: string } | null }
interface Mitarbeiter { id: string; first_name: string; last_name: string }

export default function AuftragsTeam({ projectId }: { projectId: string }) {
  const [zuweisungen, setZuweisungen] = useState<Zuweisung[]>([]);
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [neuOffen, setNeuOffen] = useState(false);
  const [gewaehlteId, setGewaehlteId] = useState('');
  const [rolle, setRolle] = useState('');
  const [speichern, setSpeichern] = useState(false);

  const lade = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/project-assignments?project_id=${projectId}`);
      const json = await res.json();
      if (json.success) setZuweisungen(json.assignments || []);
    } catch { /* still */ }
    setLoading(false);
  }, [projectId]);
  useEffect(() => { lade(); }, [lade]);

  async function ladeMitarbeiterliste() {
    if (mitarbeiter.length > 0) return;
    try {
      const { getEmployees } = await import('@/lib/actions/employees');
      const liste = await getEmployees();
      setMitarbeiter(liste.map((m: any) => ({ id: m.id, first_name: m.first_name, last_name: m.last_name })));
    } catch { /* Liste optional */ }
  }

  async function zuweisen() {
    if (!gewaehlteId) return;
    setSpeichern(true);
    try {
      const res = await fetch('/api/project-assignments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, employee_id: gewaehlteId, rolle: rolle.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setGewaehlteId(''); setRolle(''); setNeuOffen(false);
      lade();
    } catch (e: any) { alert('❌ ' + e.message); }
    setSpeichern(false);
  }

  async function entfernen(id: string) {
    try {
      const res = await fetch(`/api/project-assignments?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      lade();
    } catch (e: any) { alert('❌ ' + e.message); }
  }

  return (
    <div className="mt-3 pt-3 border-t border-black/5">
      <p className="text-xs font-semibold text-[#1d1d1f] flex items-center gap-1.5 mb-2"><Users className="h-3.5 w-3.5 text-[#e8590c]" /> Team für diesen Auftrag</p>
      {loading ? <p className="text-xs text-[#86868b]">Lade…</p> : zuweisungen.length === 0 ? (
        <p className="text-xs text-[#86868b] mb-2">Noch niemand zugewiesen.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {zuweisungen.map(z => (
            <span key={z.id} className="flex items-center gap-1 text-xs bg-[#f5f5f7] rounded-full pl-2.5 pr-1 py-1">
              {z.employee ? `${z.employee.first_name} ${z.employee.last_name}` : 'Unbekannt'}{z.rolle ? ` (${z.rolle})` : ''}
              <button onClick={() => entfernen(z.id)} className="p-0.5 rounded-full hover:bg-black/10"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}

      {!neuOffen ? (
        <button onClick={() => { setNeuOffen(true); ladeMitarbeiterliste(); }} className="flex items-center gap-1 text-xs text-[#e8590c] font-semibold hover:underline">
          <Plus className="h-3.5 w-3.5" /> Mitarbeiter zuweisen
        </button>
      ) : (
        <div className="flex flex-wrap gap-2 items-center bg-[#f5f5f7] rounded-lg p-2">
          <select value={gewaehlteId} onChange={e => setGewaehlteId(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border border-black/10 bg-white">
            <option value="">– Mitarbeiter wählen –</option>
            {mitarbeiter.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
          </select>
          <input value={rolle} onChange={e => setRolle(e.target.value)} placeholder="Rolle (optional)" className="text-xs px-2 py-1.5 rounded-lg border border-black/10 bg-white w-32" />
          <button onClick={zuweisen} disabled={speichern || !gewaehlteId} className="text-xs px-3 py-1.5 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 text-white font-semibold">{speichern ? '…' : 'Zuweisen'}</button>
          <button onClick={() => setNeuOffen(false)} className="text-xs px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10">Abbrechen</button>
        </div>
      )}
    </div>
  );
}
