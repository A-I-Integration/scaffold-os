'use client';

import { useEffect, useMemo, useState } from 'react';

interface Pos { inventory_id: string; menge: number; von_lagerort: string | null; von_zustand: string | null; nach_lagerort: string | null; nach_zustand: string | null }
interface Beleg { id: string; belegnummer: string; bewegungsart: string; gebucht_am: string; bemerkung: string | null; storno_von: string | null; materialbeleg_positionen: Pos[] }
interface Artikel { id: string; sku: string; name: string }
interface Ort { id: string; name: string }

const ART: Record<string, string> = {
  AB: 'Anfangsbestand', WE: 'Wareneingang', AU: 'Ausgabe an Baustelle', AN: 'Anlieferung', RN: 'Rücknahme', UL: 'Umlagerung',
  ZW: 'Zustandswechsel', VL: 'Verlust', IP: 'Inventur Mehrbestand', IM: 'Inventur Fehlbestand', ST: 'Storno',
};
const ZUSTAND: Record<string, string> = { frei: 'frei', reserviert: 'reserviert', gesperrt: 'gesperrt', in_pruefung: 'in Prüfung', defekt: 'defekt', reparatur: 'Reparatur' };

export default function BewegungenTab({ darfStornieren }: { darfStornieren: boolean }) {
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [orte, setOrte] = useState<Ort[]>([]);
  const [gewaehlt, setGewaehlt] = useState<Artikel | null>(null);
  const [suche, setSuche] = useState('');
  const [version, setVersion] = useState(0);
  const [geladen, setGeladen] = useState<{ key: string; belege: Beleg[] } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    fetch('/api/inventory').then(r => r.json()).then(d => { if (!weg && d.success) setArtikel(d.items); }).catch(() => {});
    fetch('/api/lager/orte').then(r => r.json()).then(d => { if (!weg && d.success) setOrte(d.orte); }).catch(() => {});
    return () => { weg = true; };
  }, []);

  const key = `${gewaehlt?.id || ''}|${version}`;
  useEffect(() => {
    let weg = false;
    const qs = gewaehlt ? `?artikel=${gewaehlt.id}&limit=100` : '?limit=100';
    fetch(`/api/lager/belege${qs}`).then(r => r.json()).then(d => { if (!weg && d.success) setGeladen({ key, belege: d.belege }); }).catch(() => {});
    return () => { weg = true; };
  }, [key, gewaehlt]);

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return s ? artikel.filter(a => a.name.toLowerCase().includes(s) || a.sku.toLowerCase().includes(s)).slice(0, 8) : [];
  }, [suche, artikel]);
  const artName = (id: string) => { const a = artikel.find(x => x.id === id); return a ? `${a.name} (${a.sku})` : id; };
  const ortName = (id: string | null) => (id ? orte.find(o => o.id === id)?.name || '…' : '');
  const belege = geladen && geladen.key === key ? geladen.belege : null;
  const bereitsStorniert = new Set((belege || []).map(b => b.storno_von).filter(Boolean));

  async function storno(b: Beleg) {
    if (!confirm(`Beleg ${b.belegnummer} stornieren? Es wird ein Gegenbeleg gebucht.`)) return;
    setFehler(null);
    const r = await fetch('/api/lager/buchen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storno_von: b.id }) });
    const d = await r.json().catch(() => ({}));
    if (d.success) setVersion(v => v + 1); else setFehler(d.error || 'Storno fehlgeschlagen.');
  }

  const feld = 'w-full max-w-md px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white';
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Bewegungen</h3>
      <div className="flex flex-wrap items-center gap-3">
        <input className={feld} placeholder="Nach Artikel filtern (Name oder Nummer) …" value={suche} onChange={e => setSuche(e.target.value)} />
        {gewaehlt && <button className="text-sm text-blue-600" onClick={() => setGewaehlt(null)}>Filter „{gewaehlt.name}“ entfernen</button>}
      </div>
      {treffer.length > 0 && (
        <ul className="border border-gray-200 rounded-xl divide-y max-w-md">
          {treffer.map(a => <li key={a.id}><button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { setGewaehlt(a); setSuche(''); }}>{a.name} <span className="text-gray-400">· {a.sku}</span></button></li>)}
        </ul>
      )}
      {fehler && <div className="text-sm text-red-700">{fehler}</div>}
      {belege === null ? <div className="text-sm text-gray-400">Wird geladen …</div> : belege.length === 0 ? <div className="text-sm text-gray-500">Keine Bewegungen.</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead><tr className="text-xs text-gray-500 uppercase"><th className="py-2">Beleg</th><th>Art</th><th>Artikel</th><th className="text-right">Menge</th><th>Von</th><th>Nach</th><th></th></tr></thead>
            <tbody>
              {belege.flatMap(b => b.materialbeleg_positionen.map((p, i) => (
                <tr key={b.id + i} className="border-t border-gray-100 align-top">
                  <td className="py-2 whitespace-nowrap">{i === 0 && (<><div className="font-medium">{b.belegnummer}</div><div className="text-xs text-gray-400">{new Date(b.gebucht_am).toLocaleString('de-DE')}</div></>)}</td>
                  <td>{i === 0 && <>{ART[b.bewegungsart] || b.bewegungsart}{b.bemerkung && <div className="text-xs text-gray-400">{b.bemerkung}</div>}</>}</td>
                  <td>{artName(p.inventory_id)}</td>
                  <td className="text-right font-semibold">{p.menge}</td>
                  <td>{ortName(p.von_lagerort)}{p.von_zustand && <span className="text-gray-400"> · {ZUSTAND[p.von_zustand]}</span>}</td>
                  <td>{ortName(p.nach_lagerort)}{p.nach_zustand && <span className="text-gray-400"> · {ZUSTAND[p.nach_zustand]}</span>}</td>
                  <td>{i === 0 && darfStornieren && !b.storno_von && b.bewegungsart !== 'AB' && !bereitsStorniert.has(b.id) && <button className="text-xs text-red-600 hover:underline" onClick={() => storno(b)}>Stornieren</button>}{i === 0 && bereitsStorniert.has(b.id) && <span className="text-xs text-gray-400">storniert</span>}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
