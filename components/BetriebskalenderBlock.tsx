'use client';

import { useCallback, useEffect, useState } from 'react';
import { KALENDER_ARTEN, KALENDER_LABEL } from '@/lib/betriebskalender';
import { arbeitstage, feiertageNrw, kalenderTage } from '@/lib/urlaubskonto';

// ============================================================
// SCAFFOLD OS – Betriebskalender: Betriebsferien und zusätzliche freie Tage für ALLE Mitarbeiter (nur Chef pflegt, Dispo liest)
// Betriebsferien werden bei jedem Mitarbeiter fest vom Urlaub abgezogen; freie Tage zählen nicht als Urlaubstag.
// Die gesetzlichen Feiertage in NRW gelten automatisch.
// ============================================================

interface Eintrag { id: string; art: string; bezeichnung: string; von: string; bis: string }
const de = (iso: string) => iso.split('-').reverse().join('.');
const heute = () => new Date().toLocaleDateString('sv-SE');
const inputCls = 'w-full rounded-lg bg-[#f5f5f7] border border-black/10 px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:border-[#e8590c] focus:outline-none';

export default function BetriebskalenderBlock() {
  const [liste, setListe] = useState<Eintrag[]>([]);
  const [art, setArt] = useState('betriebsferien');
  const [bez, setBez] = useState('');
  const [von, setVon] = useState(heute());
  const [bis, setBis] = useState(heute());
  const [laeuft, setLaeuft] = useState(false);
  const [darfPflegen, setDarfPflegen] = useState(true);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async () => {
    const res = await fetch('/api/betriebskalender', { cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    if (j.success) setListe(j.eintraege || []);
    else setMeldung({ ok: false, text: j.error || 'Betriebskalender konnte nicht geladen werden.' });
  }, []);
  useEffect(() => { laden(); }, [laden]);

  async function speichern() {
    setLaeuft(true); setMeldung(null);
    try {
      const res = await fetch('/api/betriebskalender', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ art, bezeichnung: bez, von, bis }) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 403) { setDarfPflegen(false); setMeldung({ ok: false, text: 'Nur der Chef darf den Betriebskalender ändern.' }); return; }
      if (!res.ok || !j.success) { setMeldung({ ok: false, text: j.error || 'Speichern fehlgeschlagen' }); return; }
      setBez(''); await laden(); setMeldung({ ok: true, text: 'Eintrag gespeichert.' });
    } catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler beim Speichern' }); }
    finally { setLaeuft(false); }
  }
  async function loeschen(id: string) {
    setLaeuft(true); setMeldung(null);
    const res = await fetch(`/api/betriebskalender?id=${id}`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    setLaeuft(false);
    if (!res.ok || !j.success) { setMeldung({ ok: false, text: j.error || 'Löschen fehlgeschlagen' }); return; }
    await laden();
  }

  const frei = kalenderTage({ anspruch: [], kalender: liste }).frei;
  const tageVon = (e: Eintrag) => e.art === 'betriebsferien' ? arbeitstage(e.von, e.bis, frei).length : null;
  const jahr = Number(heute().slice(0, 4));

  return (
    <section className="bg-white border border-black/5 rounded-2xl p-5 space-y-3" data-testid="betriebskalender">
      <h3 className="font-semibold">📅 Betriebsferien und freie Tage (für alle Mitarbeiter)</h3>
      <p className="text-sm text-[#86868b]">Betriebsferien werden bei jedem Mitarbeiter fest vom Urlaub abgezogen, in dem Monat, in dem sie liegen. Ein freier Tag (z. B. Heiligabend) zählt nicht als Urlaubstag. Die gesetzlichen Feiertage in NRW gelten automatisch.</p>
      {darfPflegen && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <div className="md:col-span-2"><label className="block text-xs text-[#86868b] mb-1">Art</label>
            <select value={art} onChange={e => setArt(e.target.value)} className={inputCls} data-testid="kalender-art">{KALENDER_ARTEN.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
          <div><label className="block text-xs text-[#86868b] mb-1">Von</label><input type="date" value={von} onChange={e => { setVon(e.target.value); if (bis < e.target.value) setBis(e.target.value); }} className={inputCls} data-testid="kalender-von" /></div>
          <div><label className="block text-xs text-[#86868b] mb-1">Bis</label><input type="date" value={bis} onChange={e => setBis(e.target.value)} className={inputCls} data-testid="kalender-bis" /></div>
          <div><label className="block text-xs text-[#86868b] mb-1">Bezeichnung *</label><input value={bez} onChange={e => setBez(e.target.value)} placeholder="z. B. Betriebsferien Sommer" className={inputCls} data-testid="kalender-bezeichnung" /></div>
          <div className="md:col-span-5"><button type="button" disabled={laeuft} onClick={speichern} data-testid="kalender-speichern" className="rounded-lg bg-[#e8590c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Eintragen</button></div>
        </div>
      )}
      {liste.length === 0 ? <p className="text-sm text-[#86868b]" data-testid="kalender-leer">Noch keine Betriebsferien oder freien Tage eingetragen.</p> : (
        <ul className="text-sm space-y-1" data-testid="kalender-liste">
          {liste.map(e => (
            <li key={e.id} className="flex justify-between gap-3 border-t border-black/5 pt-1">
              <span><b>{e.bezeichnung}</b> · {KALENDER_LABEL[e.art] || e.art} · {de(e.von)}{e.bis !== e.von ? ` – ${de(e.bis)}` : ''}{tageVon(e) !== null ? ` · ${tageVon(e)} Arbeitstage abgezogen` : ''}</span>
              {darfPflegen && <button type="button" onClick={() => loeschen(e.id)} className="text-xs text-red-600 hover:underline">löschen</button>}
            </li>
          ))}
        </ul>
      )}
      <details className="text-xs text-[#86868b]"><summary className="cursor-pointer">Gesetzliche Feiertage {jahr} (NRW, automatisch berücksichtigt)</summary>
        <p className="mt-1">{[...feiertageNrw(jahr)].sort().map(de).join(' · ')}</p></details>
      {meldung && <p className={`text-sm ${meldung.ok ? 'text-emerald-700' : 'text-red-600'}`} data-testid="kalender-meldung">{meldung.ok ? '✅' : '❌'} {meldung.text}</p>}
    </section>
  );
}
