'use client';

import { useCallback, useEffect, useState } from 'react';
import RegieberichtBlock from '@/components/RegieberichtBlock';

// ============================================================
// SCAFFOLD OS – Regieberichte auf der Baustelle (Paket 10)
// Baustelle wählen, dann Regiebericht anlegen, vor Ort unterschreiben lassen oder (Büro) per Mail zum Ausdrucken senden.
// Mitarbeiter sehen keine Preise.
// ============================================================

interface Projekt { id: string; name: string | null; adresse: string | null; status: string }
const KEY = 'scaffold_regiebericht_project';

export default function RegieberichtSeite() {
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [id, setId] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState('');
  const [suche, setSuche] = useState('');

  const lade = useCallback(async () => {
    try {
      const j = await fetch('/api/projects', { cache: 'no-store' }).then((r) => r.json());
      if (!j.success) throw new Error(j.error || 'Baustellen konnten nicht geladen werden.');
      const liste: Projekt[] = (j.projects || []).filter((p: Projekt) => p.status === 'active');
      setProjekte(liste);
      try { const s = localStorage.getItem(KEY); if (s && liste.some((p) => p.id === s)) setId(s); } catch { /* ohne Speicher */ }
    } catch (e) { setFehler(e instanceof Error ? e.message : 'Baustellen konnten nicht geladen werden.'); } finally { setLaedt(false); }
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const waehle = (v: string) => { setId(v); try { localStorage.setItem(KEY, v); } catch { /* ohne Speicher */ } };
  const treffer = projekte.filter((p) => `${p.name || ''} ${p.adresse || ''}`.toLowerCase().includes(suche.trim().toLowerCase()));

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold text-[#1d1d1f]">Regieberichte</h1>
      {fehler && <p className="text-sm text-red-600">{fehler}</p>}
      {laedt ? <p className="text-sm text-[#86868b]">Wird geladen …</p> : (
        <div className="space-y-2">
          <input aria-label="Baustelle suchen" placeholder="Baustelle suchen" value={suche} onChange={(e) => setSuche(e.target.value)} className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm" />
          <select data-testid="regie-baustelle" aria-label="Baustelle" value={id} onChange={(e) => waehle(e.target.value)} className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm bg-white">
            <option value="">Baustelle wählen …</option>
            {treffer.map((p) => <option key={p.id} value={p.id}>{p.name || 'Unbenannt'}{p.adresse ? ` · ${p.adresse}` : ''}</option>)}
          </select>
        </div>
      )}
      {id && <RegieberichtBlock key={id} projectId={id} />}
    </div>
  );
}
