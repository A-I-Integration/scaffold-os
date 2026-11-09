'use client';

import { useEffect, useMemo, useState } from 'react';

interface Artikel { id: string; sku: string; name: string }
interface Ort { id: string; schluessel: string; name: string; typ: string }
interface BestandZeile { lagerort_id: string; zustand: string; menge: number }

const ZUSTAENDE: Record<string, string> = {
  frei: 'Frei', reserviert: 'Reserviert', gesperrt: 'Gesperrt', in_pruefung: 'In Prüfung', defekt: 'Defekt', reparatur: 'In Reparatur',
};
const ARTEN: { code: string; name: string; von: boolean; nach: boolean; hinweis: string }[] = [
  { code: 'UL', name: 'Umlagern (anderer Ort, gleicher Zustand)', von: true, nach: true, hinweis: 'z. B. Hauptlager → LKW, Regal A → Regal B' },
  { code: 'ZW', name: 'Zustand ändern (gleicher Ort)', von: true, nach: true, hinweis: 'z. B. frei → defekt, defekt → Reparatur' },
  { code: 'WE', name: 'Wareneingang', von: false, nach: true, hinweis: 'Neues Material kommt ins Lager' },
  { code: 'VL', name: 'Verlust / Ausbuchung', von: true, nach: false, hinweis: 'Nur Admin und Disposition' },
];

export default function UmbuchenTab({ darfVerlust }: { darfVerlust: boolean }) {
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [orte, setOrte] = useState<Ort[]>([]);
  const [suche, setSuche] = useState('');
  const [gewaehlt, setGewaehlt] = useState<Artikel | null>(null);
  const [bestand, setBestand] = useState<{ id: string; zeilen: BestandZeile[] } | null>(null);
  const [version, setVersion] = useState(0);
  const [art, setArt] = useState('UL');
  const [von, setVon] = useState({ ort: '', zustand: 'frei' });
  const [nach, setNach] = useState({ ort: '', zustand: 'frei' });
  const [menge, setMenge] = useState('');
  const [bemerkung, setBemerkung] = useState('');
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    let weg = false;
    fetch('/api/inventory').then(r => r.json()).then(d => { if (!weg && d.success) setArtikel(d.items); }).catch(() => {});
    fetch('/api/lager/orte').then(r => r.json()).then(d => { if (!weg && d.success) setOrte(d.orte); }).catch(() => {});
    return () => { weg = true; };
  }, []);

  const artikelId = gewaehlt?.id;
  useEffect(() => {
    if (!artikelId) return;
    let weg = false;
    fetch(`/api/lager/orte?artikel=${artikelId}`).then(r => r.json())
      .then(d => { if (!weg && d.success) setBestand({ id: artikelId, zeilen: d.bestand }); }).catch(() => {});
    return () => { weg = true; };
  }, [artikelId, version]);

  const ortName = (id: string) => orte.find(o => o.id === id)?.name || id;
  const zeilen = bestand && bestand.id === artikelId ? bestand.zeilen : null;
  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    if (!s) return [];
    return artikel.filter(a => a.name.toLowerCase().includes(s) || a.sku.toLowerCase().includes(s)).slice(0, 8);
  }, [suche, artikel]);
  const cfg = ARTEN.find(a => a.code === art)!;

  async function buchen() {
    if (!gewaehlt) return;
    setMeldung(null);
    const m = Number(menge);
    if (!Number.isInteger(m) || m <= 0) return setMeldung({ ok: false, text: 'Bitte eine ganze Menge über 0 eingeben.' });
    if (cfg.von && !von.ort) return setMeldung({ ok: false, text: 'Bitte den Quell-Ort wählen.' });
    if (cfg.nach && !nach.ort) return setMeldung({ ok: false, text: 'Bitte den Ziel-Ort wählen.' });
    const pos: Record<string, unknown> = { inventory_id: gewaehlt.id, menge: m, bemerkung: bemerkung || undefined };
    if (cfg.von) { pos.von_lagerort = von.ort; pos.von_zustand = von.zustand; }
    if (cfg.nach) { pos.nach_lagerort = art === 'ZW' ? von.ort : nach.ort; pos.nach_zustand = nach.zustand; }
    setLaeuft(true);
    try {
      const r = await fetch('/api/lager/buchen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bewegungsart: art, positionen: [pos] }) });
      const d = await r.json();
      if (d.success) { setMeldung({ ok: true, text: 'Gebucht.' }); setMenge(''); setBemerkung(''); setVersion(v => v + 1); }
      else setMeldung({ ok: false, text: d.error || 'Buchung fehlgeschlagen.' });
    } catch { setMeldung({ ok: false, text: 'Keine Verbindung. Nichts wurde gebucht.' }); }
    setLaeuft(false);
  }

  const feld = 'w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white';
  const ortWahl = (w: { ort: string; zustand: string }, set: (v: { ort: string; zustand: string }) => void, titel: string, ortFix = false) => (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-500 uppercase">{titel}</div>
      {!ortFix && (
        <select className={feld} value={w.ort} onChange={e => set({ ...w, ort: e.target.value })}>
          <option value="">Ort wählen …</option>
          {orte.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )}
      <select className={feld} value={w.zustand} onChange={e => set({ ...w, zustand: e.target.value })}>
        {Object.entries(ZUSTAENDE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Umbuchen</h3>
        <input className={feld + ' max-w-md'} placeholder="Artikel suchen (Name oder Nummer) …" value={suche} onChange={e => setSuche(e.target.value)} />
        {treffer.length > 0 && (
          <ul className="border border-gray-200 rounded-xl divide-y max-w-md">
            {treffer.map(a => (
              <li key={a.id}><button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => { setGewaehlt(a); setSuche(''); }}>{a.name} <span className="text-gray-400">· {a.sku}</span></button></li>
            ))}
          </ul>
        )}
        {gewaehlt && (
          <div className="text-sm text-gray-700">
            <div className="font-medium">{gewaehlt.name} <span className="text-gray-400">· {gewaehlt.sku}</span></div>
            {zeilen === null ? <div className="text-gray-400">Bestand wird geladen …</div> : zeilen.length === 0 ? <div className="text-gray-500">Kein Bestand im neuen Lager.</div> : (
              <table className="mt-2 text-sm"><tbody>
                {zeilen.map((z, i) => <tr key={i}><td className="pr-6 py-0.5">{ortName(z.lagerort_id)}</td><td className="pr-6 text-gray-500">{ZUSTAENDE[z.zustand] || z.zustand}</td><td className="font-semibold text-right">{z.menge}</td></tr>)}
              </tbody></table>
            )}
          </div>
        )}
      </div>

      {gewaehlt && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div>
            <select className={feld + ' max-w-md'} value={art} onChange={e => setArt(e.target.value)}>
              {ARTEN.filter(a => a.code !== 'VL' || darfVerlust).map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
            </select>
            <div className="text-xs text-gray-500 mt-1">{cfg.hinweis}</div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
            {cfg.von && ortWahl(von, setVon, art === 'ZW' ? 'Ort und bisheriger Zustand' : 'Von')}
            {cfg.nach && ortWahl(nach, setNach, art === 'ZW' ? 'Neuer Zustand' : 'Nach', art === 'ZW')}
          </div>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
            <input className={feld} inputMode="numeric" placeholder="Menge" value={menge} onChange={e => setMenge(e.target.value)} />
            <input className={feld} placeholder="Bemerkung (optional)" value={bemerkung} onChange={e => setBemerkung(e.target.value)} />
          </div>
          {meldung && <div className={`text-sm ${meldung.ok ? 'text-green-700' : 'text-red-700'}`}>{meldung.text}</div>}
          <button disabled={laeuft} onClick={buchen} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">{laeuft ? 'Bucht …' : 'Buchen'}</button>
        </div>
      )}
    </div>
  );
}
