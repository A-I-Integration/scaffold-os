'use client';

import { useState } from 'react';

// ============================================================
// SCAFFOLD OS – Abbau-Rücklauf-Dialog (Phase 68-B)
//
// Zeigt pro Baustelle eine Checkliste aller Materialpositionen.
// Der Nutzer trägt je Position ein, wie viel intakt zurückkommt
// und wie viel fehlt/beschädigt ist. Nach Bestätigung:
//   - intakte Menge  → Zentrallager-Bestand steigt wieder
//   - Fehlmenge      → wird als Verlust protokolliert (Grund optional)
//   - Baustellenbestand sinkt um beide Mengen
// Kein SQL nötig, nutzt die bestehende API /api/inventory/return.
// ============================================================

interface AbbauPosition {
  inventory_id: string;
  name: string;
  unit: string;
  mengeVorOrt: number;   // aktuell physisch auf der Baustelle
}

interface Props {
  projektId: string;
  projektName: string;
  positionen: AbbauPosition[];
  onClose: () => void;
  onFertig: () => void;  // wird nach erfolgreicher Buchung aufgerufen
}

export default function AbbauDialog({ projektId, projektName, positionen, onClose, onFertig }: Props) {
  const [werte, setWerte] = useState<Record<string, { zurueck: string; fehlt: string; grund: string }>>(() => {
    const init: Record<string, { zurueck: string; fehlt: string; grund: string }> = {};
    for (const p of positionen) {
      init[p.inventory_id] = { zurueck: String(p.mengeVorOrt), fehlt: '0', grund: '' };
    }
    return init;
  });
  const [speichere, setSpeichere] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  function setze(id: string, feld: 'zurueck' | 'fehlt' | 'grund', wert: string) {
    setWerte((prev) => ({ ...prev, [id]: { ...prev[id], [feld]: wert } }));
  }

  async function bestaetigen() {
    setFehler(null);

    // Validierung je Position: zurueck + fehlt <= vor Ort
    for (const p of positionen) {
      const w = werte[p.inventory_id] || { zurueck: '0', fehlt: '0' };
      const z = Math.max(0, Number(w.zurueck) || 0);
      const f = Math.max(0, Number(w.fehlt) || 0);
      if (z + f > p.mengeVorOrt) {
        setFehler(`"${p.name}": ${z + f} eingegeben, aber nur ${p.mengeVorOrt} ${p.unit} vor Ort.`);
        return;
      }
    }

    const items = positionen
      .map((p) => {
        const w = werte[p.inventory_id];
        return {
          inventory_id: p.inventory_id,
          zurueck: Math.max(0, Number(w.zurueck) || 0),
          fehlt_beschaedigt: Math.max(0, Number(w.fehlt) || 0),
          grund: w.grund.trim() || undefined,
        };
      })
      .filter((i) => i.zurueck > 0 || i.fehlt_beschaedigt > 0);

    if (items.length === 0) {
      setFehler('Keine Mengen eingegeben.');
      return;
    }

    setSpeichere(true);
    try {
      const res = await fetch('/api/inventory/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projektId, items }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Buchung fehlgeschlagen');
      onFertig();
      onClose();
    } catch (err: any) {
      setFehler(err.message || 'Fehler beim Buchen.');
    } finally {
      setSpeichere(false);
    }
  }

  const gesamtZurueck = positionen.reduce((s, p) => s + (Math.max(0, Number(werte[p.inventory_id]?.zurueck) || 0)), 0);
  const gesamtFehlt = positionen.reduce((s, p) => s + (Math.max(0, Number(werte[p.inventory_id]?.fehlt) || 0)), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Abbau-Rücklauf</h2>
            <p className="text-sm text-gray-500">{projektName} — bitte bestätigen, was zurückkommt</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          <div className="mb-3 text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-800">
            Intaktes Material geht zurück ins Zentrallager. Fehlende/beschädigte Teile werden als Verlust protokolliert — die Buchung prüft später jemand in der Auswertung.
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-2">Material</th>
                <th className="py-2 pr-2 w-20">Vor Ort</th>
                <th className="py-2 pr-2 w-24">Zurück (intakt)</th>
                <th className="py-2 pr-2 w-28">Fehlt/Besch.</th>
                <th className="py-2 w-32">Grund (optional)</th>
              </tr>
            </thead>
            <tbody>
              {positionen.map((p) => {
                const w = werte[p.inventory_id] || { zurueck: '0', fehlt: '0', grund: '' };
                const z = Math.max(0, Number(w.zurueck) || 0);
                const f = Math.max(0, Number(w.fehlt) || 0);
                const zuViel = z + f > p.mengeVorOrt;
                return (
                  <tr key={p.inventory_id} className="border-b border-gray-100">
                    <td className="py-2 pr-2 font-medium text-gray-900">{p.name}</td>
                    <td className="py-2 pr-2 text-gray-600">{p.mengeVorOrt} {p.unit}</td>
                    <td className="py-2 pr-2">
                      <input type="number" min="0" max={p.mengeVorOrt} value={w.zurueck}
                        onChange={(e) => setze(p.inventory_id, 'zurueck', e.target.value)}
                        className={`w-full rounded-lg border px-2 py-1 ${zuViel ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" min="0" max={p.mengeVorOrt} value={w.fehlt}
                        onChange={(e) => setze(p.inventory_id, 'fehlt', e.target.value)}
                        className={`w-full rounded-lg border px-2 py-1 ${zuViel ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                    </td>
                    <td className="py-2">
                      <input type="text" value={w.grund} placeholder="z.B. beschädigt"
                        onChange={(e) => setze(p.inventory_id, 'grund', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {fehler && <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{fehler}</div>}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Summe: <span className="font-semibold text-green-700">{gesamtZurueck} zurück</span>
            {gesamtFehlt > 0 && <>, <span className="font-semibold text-red-600">{gesamtFehlt} Verlust</span></>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50">Abbrechen</button>
            <button onClick={bestaetigen} disabled={speichere}
              className="px-4 py-2 rounded-xl bg-[#0071e3] text-white font-medium hover:bg-[#0077ed] disabled:opacity-50">
              {speichere ? 'Buche…' : 'Rücklauf bestätigen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
