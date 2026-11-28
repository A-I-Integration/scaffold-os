'use client';

import { useCallback, useEffect, useState } from 'react';
import { ABSCHNITT_LABEL, minutenZwischen, fmtMinuten } from '@/lib/zeit-abschnitte';
import { ARTEN_MITARBEITER } from '@/lib/zeit-knoepfe';

// ============================================================
// SCAFFOLD OS – „Mein Tag“: Zeit-Knöpfe für Mitarbeiter (Vom Hof gefahren, Baustelle, Pause, Fahrt zum Hof, Stoppen, Nachtragen)
// Nur Auswertung für Chef/Dispo: die gebuchten Stunden kommen weiterhin aus Ein-/Ausstempeln.
// ============================================================

interface Lauf { art: string; start_time: string; project_id: string | null }
interface Abs { id: string; art: string; start_time: string; end_time: string; quelle: string; note?: string | null; project?: { name: string } | null }
interface Knopf { aktion: string; label: string }

const uhr = (ts: string) => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const lokalJetzt = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const heute = () => new Date().toLocaleDateString('en-CA');
const inp = 'bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#e8590c]';

export default function ZeitKnoepfe() {
  const [geladen, setGeladen] = useState(false);
  const [vorhanden, setVorhanden] = useState(true);
  const [tabelleFehlt, setTabelleFehlt] = useState(false);
  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [knoepfe, setKnoepfe] = useState<Knopf[]>([]);
  const [abschnitte, setAbschnitte] = useState<Abs[]>([]);
  const [projekte, setProjekte] = useState<{ id: string; name: string }[]>([]);
  const [projekt, setProjekt] = useState('');
  const [zeitAn, setZeitAn] = useState(false);
  const [zeit, setZeit] = useState(lokalJetzt());
  const [meldung, setMeldung] = useState<{ art: 'fehler' | 'ok'; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [tick, setTick] = useState(0);
  const [nachtrag, setNachtrag] = useState<null | { art: string; datum: string; von: string; bis: string; project_id: string; note: string }>(null);

  const laden = useCallback(async () => {
    try {
      const r = await fetch('/api/zeit-knoepfe', { cache: 'no-store' });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setVorhanden(!!j.employee); setLauf(j.lauf ?? null); setKnoepfe(j.knoepfe ?? []); setAbschnitte(j.abschnitte ?? []); setTabelleFehlt(!!j.tabelleFehlt);
    } catch (e: any) { setMeldung({ art: 'fehler', text: e.message || 'Laden fehlgeschlagen.' }); }
    finally { setGeladen(true); }
  }, []);
  useEffect(() => { laden(); }, [laden]);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { fetch('/api/projects').then((r) => r.json()).then((j) => { if (j.success) setProjekte((j.projects || []).map((p: any) => ({ id: p.id, name: p.name }))); }).catch(() => {}); }, []);

  async function druecken(aktion: string) {
    setLaeuft(true); setMeldung(null);
    try {
      const body: any = { aktion, project_id: projekt || undefined };
      if (zeitAn && zeit) body.zeit = new Date(zeit).toISOString();
      const r = await fetch('/api/zeit-knoepfe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setZeitAn(false); setZeit(lokalJetzt()); setMeldung({ art: 'ok', text: 'Gespeichert.' });
      await laden();
    } catch (e: any) { setMeldung({ art: 'fehler', text: e.message || 'Das hat nicht geklappt.' }); }
    finally { setLaeuft(false); }
  }

  async function nachtragen() {
    if (!nachtrag) return;
    if (!nachtrag.von || !nachtrag.bis) { setMeldung({ art: 'fehler', text: 'Bitte Von und Bis angeben.' }); return; }
    setLaeuft(true); setMeldung(null);
    try {
      const body = { aktion: 'nachtragen', art: nachtrag.art, start_time: new Date(`${nachtrag.datum}T${nachtrag.von}`).toISOString(), end_time: new Date(`${nachtrag.datum}T${nachtrag.bis}`).toISOString(), project_id: nachtrag.project_id || undefined, note: nachtrag.note || undefined };
      const r = await fetch('/api/zeit-knoepfe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setNachtrag(null); setMeldung({ art: 'ok', text: 'Nachgetragen. Chef und Disposition sehen den Eintrag als „vom Mitarbeiter nachgetragen“.' }); await laden();
    } catch (e: any) { setMeldung({ art: 'fehler', text: e.message || 'Das hat nicht geklappt.' }); }
    finally { setLaeuft(false); }
  }

  async function loeschen(id: string) {
    setMeldung(null);
    const r = await fetch(`/api/zeit-knoepfe?id=${id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!j.success) setMeldung({ art: 'fehler', text: j.error || 'Löschen fehlgeschlagen.' });
    else await laden();
  }

  if (!geladen || !vorhanden) return null;
  void tick;
  const seit = lauf ? minutenZwischen(lauf.start_time, new Date().toISOString()) : 0;

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3" data-testid="zeit-knoepfe">
      <div className="font-semibold text-sm">Mein Tag</div>
      {tabelleFehlt && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">Die Tabellen dafür fehlen noch. Bitte den Chef bitten, phase-145-zeit-knoepfe.sql auszuführen.</p>}
      <p className="text-sm" data-testid="zeit-lauf">
        {lauf ? <>Läuft: <b>{ABSCHNITT_LABEL[lauf.art] || lauf.art}</b> seit {uhr(lauf.start_time)} Uhr ({fmtMinuten(Math.max(0, seit))})</> : 'Gerade läuft kein Abschnitt.'}
      </p>
      {projekte.length > 0 && (
        <select value={projekt} onChange={(e) => setProjekt(e.target.value)} className={inp + ' w-full'} data-testid="zeit-baustelle">
          <option value="">Baustelle (optional)</option>
          {projekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <div className="flex flex-wrap gap-2">
        {knoepfe.map((k) => (
          <button key={k.aktion} disabled={laeuft || tabelleFehlt} onClick={() => druecken(k.aktion)} data-testid={`zeit-${k.aktion}`}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${k.aktion === 'stopp' ? 'border border-black/15 bg-white' : 'bg-[#e8590c] text-white'}`}>{k.label}</button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-[#424245]">
        <input type="checkbox" checked={zeitAn} onChange={(e) => { setZeitAn(e.target.checked); if (e.target.checked) setZeit(lokalJetzt()); }} data-testid="zeit-einstellen" /> Zeit einstellen (falls du den Knopf später drückst)
      </label>
      {zeitAn && <input type="datetime-local" value={zeit} max={lokalJetzt()} onChange={(e) => setZeit(e.target.value)} className={inp} data-testid="zeit-wert" />}
      {meldung && <p className={`text-sm ${meldung.art === 'fehler' ? 'text-red-700' : 'text-green-700'}`} data-testid="zeit-meldung">{meldung.art === 'fehler' ? '❌ ' : '✅ '}{meldung.text}</p>}

      {abschnitte.length > 0 && (
        <ul className="text-sm border-t border-black/5 pt-2" data-testid="zeit-heute">
          {abschnitte.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
              <span className="w-40">{ABSCHNITT_LABEL[a.art] || a.art}</span>
              <span>{uhr(a.start_time)} – {uhr(a.end_time)}</span>
              {a.project?.name && <span className="text-blue-600">📁 {a.project.name}</span>}
              {a.quelle === 'mitarbeiter' && <span className="text-xs text-[#86868b]">nachgetragen</span>}
              {(a.quelle === 'knopf' || a.quelle === 'mitarbeiter') && <button onClick={() => loeschen(a.id)} className="ml-auto text-xs text-red-600 border border-black/10 rounded-md px-2 py-1">Löschen</button>}
            </li>
          ))}
        </ul>
      )}

      {!nachtrag ? (
        <button onClick={() => setNachtrag({ art: 'baustelle', datum: heute(), von: '', bis: '', project_id: '', note: '' })} className="text-sm border border-black/10 hover:border-[#e8590c] rounded-xl px-4 py-2" data-testid="zeit-nachtragen">+ Abschnitt nachtragen</button>
      ) : (
        <div className="grid gap-2 md:grid-cols-3 border-t border-black/5 pt-3" data-testid="zeit-nachtrag-formular">
          <select value={nachtrag.art} onChange={(e) => setNachtrag({ ...nachtrag, art: e.target.value })} className={inp}>
            {ARTEN_MITARBEITER.map((a) => <option key={a} value={a}>{ABSCHNITT_LABEL[a]}</option>)}
          </select>
          <input type="date" value={nachtrag.datum} max={heute()} onChange={(e) => setNachtrag({ ...nachtrag, datum: e.target.value })} className={inp} />
          <select value={nachtrag.project_id} onChange={(e) => setNachtrag({ ...nachtrag, project_id: e.target.value })} className={inp}>
            <option value="">ohne Baustelle</option>
            {projekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="text-xs text-[#86868b]">Von<input type="time" value={nachtrag.von} onChange={(e) => setNachtrag({ ...nachtrag, von: e.target.value })} className={inp + ' block w-full'} data-testid="nachtrag-von" /></label>
          <label className="text-xs text-[#86868b]">Bis<input type="time" value={nachtrag.bis} onChange={(e) => setNachtrag({ ...nachtrag, bis: e.target.value })} className={inp + ' block w-full'} data-testid="nachtrag-bis" /></label>
          <input value={nachtrag.note} maxLength={300} placeholder="Notiz (optional)" onChange={(e) => setNachtrag({ ...nachtrag, note: e.target.value })} className={inp} />
          <div className="md:col-span-3 flex gap-2">
            <button onClick={nachtragen} disabled={laeuft} className="bg-[#e8590c] text-white text-sm px-4 py-2 rounded-xl disabled:opacity-50" data-testid="nachtrag-speichern">Speichern</button>
            <button onClick={() => setNachtrag(null)} className="border border-black/10 text-sm px-4 py-2 rounded-xl">Abbrechen</button>
          </div>
          <p className="md:col-span-3 text-xs text-[#86868b]">Nachtragen geht für die letzten 7 Tage. Fortbildung und Schlechtwetter trägt der Chef oder die Disposition ein.</p>
        </div>
      )}
      <p className="text-[11px] text-[#86868b]">Diese Zeiten zeigen Chef und Disposition, wie dein Tag verlief. Deine Arbeitsstunden werden weiterhin über Ein- und Ausstempeln gebucht.</p>
    </div>
  );
}
