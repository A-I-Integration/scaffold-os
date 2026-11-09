'use client';

import { useEffect, useState } from 'react';

interface Ort { id: string; schluessel: string; name: string; typ: string; parent_id: string | null; project_id: string | null }

const TYP_NAME: Record<string, string> = {
  standort: 'Standort', lagerbereich: 'Lagerbereich', lagerplatz: 'Regalplatz', fahrzeug: 'LKW / Fahrzeug', werkstatt: 'Werkstatt', sperrlager: 'Sperrlager', baustelle: 'Baustelle',
};
const ANLEGBAR = ['standort', 'lagerbereich', 'lagerplatz', 'fahrzeug', 'werkstatt', 'sperrlager'];
const ELTERN: Record<string, string[]> = { lagerbereich: ['standort'], lagerplatz: ['lagerbereich', 'standort'], werkstatt: ['standort'], sperrlager: ['standort'] };

export default function LagerorteTab() {
  const [orte, setOrte] = useState<Ort[]>([]);
  const [version, setVersion] = useState(0);
  const [typ, setTyp] = useState('standort');
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    let weg = false;
    fetch('/api/lager/orte').then(r => r.json()).then(d => { if (!weg && d.success) setOrte(d.orte); }).catch(() => {});
    return () => { weg = true; };
  }, [version]);

  const eltern = orte.filter(o => (ELTERN[typ] || []).includes(o.typ));
  const name_ = (id: string | null) => orte.find(o => o.id === id)?.name || '';

  async function anlegen() {
    setMeldung(null);
    setLaeuft(true);
    try {
      const r = await fetch('/api/lager/orte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ typ, name, parent_id: parent || null }) });
      const d = await r.json();
      if (d.success) { setMeldung({ ok: true, text: 'Angelegt.' }); setName(''); setVersion(v => v + 1); }
      else setMeldung({ ok: false, text: d.error || 'Konnte nicht angelegt werden.' });
    } catch { setMeldung({ ok: false, text: 'Keine Verbindung.' }); }
    setLaeuft(false);
  }

  const feld = 'w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white';
  const sortiert = [...orte].sort((a, b) => a.schluessel.localeCompare(b.schluessel));
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Lagerort anlegen</h3>
        <div className="grid sm:grid-cols-3 gap-3 max-w-3xl">
          <select className={feld} value={typ} onChange={e => { setTyp(e.target.value); setParent(''); }}>
            {ANLEGBAR.map(t => <option key={t} value={t}>{TYP_NAME[t]}</option>)}
          </select>
          <input className={feld} placeholder="Name, z. B. Regal A1 oder LKW 3" value={name} onChange={e => setName(e.target.value)} />
          {ELTERN[typ] ? (
            <select className={feld} value={parent} onChange={e => setParent(e.target.value)}>
              <option value="">Gehört zu …</option>
              {eltern.map(o => <option key={o.id} value={o.id}>{TYP_NAME[o.typ]}: {o.name}</option>)}
            </select>
          ) : <div />}
        </div>
        {meldung && <div className={`text-sm ${meldung.ok ? 'text-green-700' : 'text-red-700'}`}>{meldung.text}</div>}
        <button disabled={laeuft || !name.trim()} onClick={anlegen} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">Anlegen</button>
        <p className="text-xs text-gray-500">Baustellen-Lagerorte entstehen automatisch mit der ersten Buchung auf die Baustelle.</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Lagerorte</h3>
        <table className="w-full text-sm text-left">
          <thead><tr className="text-xs text-gray-500 uppercase"><th className="py-2">Name</th><th>Typ</th><th>Gehört zu</th></tr></thead>
          <tbody>
            {sortiert.map(o => (
              <tr key={o.id} className="border-t border-gray-100"><td className="py-2">{o.name}</td><td>{TYP_NAME[o.typ] || o.typ}</td><td className="text-gray-500">{name_(o.parent_id)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
