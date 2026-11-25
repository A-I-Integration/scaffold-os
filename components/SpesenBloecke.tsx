'use client';

import { useCallback, useEffect, useState } from 'react';
import { EINSATZARTEN, EINSATZ_LABEL, SATZ_SCHLUESSEL, berechneSpesen, endbetrag, satzAm, type Satz } from '@/lib/spesen';

// ============================================================
// SCAFFOLD OS – Spesen in der Tagesansicht der Zeiterfassung
//  • SpesenTag: Vorschlag nach Tarif (mit Begründung) und steuerlicher Pauschale, Einsatzart, Mahlzeiten, Betrag von Hand überschreibbar
//  • SpesenMonatBlock: Summe je Mitarbeiter im Monat und Auszahlungsmonat
//  • SpesenSaetzeBlock: Sätze mit Gültig-ab ansehen und neue Fassungen eintragen (Eintragen nur Chef)
// ============================================================

export interface SpesenZeile { id: string; employee_id: string; work_date: string; einsatzart: string; fruehstueck: boolean; mittag: boolean; abend: boolean; abwesenheit_stunden: number | null; vorschlag_tarif: number; vorschlag_steuer: number; betrag_manuell: number | null; begruendung: string | null; notiz: string | null }
export interface SatzZeile extends Satz { id: string; bemerkung: string | null }

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const inp = 'bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#e8590c]';

export function SpesenTag({ employeeId, datum, stempelStunden, fortbildung, zeile, saetze, onGespeichert }: {
  employeeId: string; datum: string; stempelStunden: number; fortbildung: boolean; zeile?: SpesenZeile; saetze: SatzZeile[]; onGespeichert: () => void;
}) {
  const [einsatzart, setEinsatzart] = useState(zeile?.einsatzart || 'heimfahrt');
  const [mahl, setMahl] = useState({ fruehstueck: !!zeile?.fruehstueck, mittag: !!zeile?.mittag, abend: !!zeile?.abend });
  const [stunden, setStunden] = useState(zeile?.abwesenheit_stunden != null ? String(zeile.abwesenheit_stunden) : '');
  const [manuell, setManuell] = useState(zeile?.betrag_manuell != null ? String(zeile.betrag_manuell) : '');
  const [meldung, setMeldung] = useState('');
  const [speichert, setSpeichert] = useState(false);

  const h = stunden.trim() !== '' ? Number(stunden.replace(',', '.')) : stempelStunden;
  const erg = berechneSpesen({ datum, einsatzart, abwesenheitStunden: Number.isFinite(h) ? h : 0, ...mahl, fortbildung }, saetze);
  const vorschlag = erg.ok ? erg.tarif.betrag : 0;
  const gespeichert = zeile ? endbetrag(zeile) : null;

  async function speichern(ohneManuell = false) {
    setSpeichert(true); setMeldung('');
    try {
      const r = await fetch('/api/spesen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: employeeId, work_date: datum, einsatzart, ...mahl, abwesenheit_stunden: stunden.trim() === '' ? null : stunden, betrag_manuell: ohneManuell ? null : manuell.trim() === '' ? null : manuell }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      if (ohneManuell) setManuell('');
      onGespeichert();
    } catch (e: any) { setMeldung(e.message || 'Speichern fehlgeschlagen.'); }
    finally { setSpeichert(false); }
  }

  return (
    <div className="mt-3 border-t border-black/10 pt-3 text-sm" data-testid={`spesen-tag-${employeeId}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="font-semibold">Spesen</span>
        <select value={einsatzart} onChange={e => setEinsatzart(e.target.value)} className={inp} data-testid="spesen-einsatzart">
          {EINSATZARTEN.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
        <label className="text-xs text-[#86868b]">Abwesenheit (h)
          <input value={stunden} onChange={e => setStunden(e.target.value)} placeholder={String(stempelStunden)} inputMode="decimal" className={inp + ' w-24 ml-2'} data-testid="spesen-stunden" />
        </label>
        {(['fruehstueck', 'mittag', 'abend'] as const).map(k => (
          <label key={k} className="text-xs flex items-center gap-1"><input type="checkbox" checked={mahl[k]} onChange={e => setMahl({ ...mahl, [k]: e.target.checked })} data-testid={`spesen-${k}`} />{k === 'fruehstueck' ? 'Frühstück' : k === 'mittag' ? 'Mittag' : 'Abend'} gestellt</label>
        ))}
      </div>
      {!erg.ok && <p className="text-xs text-red-700" data-testid="spesen-fehler">{erg.fehler}</p>}
      {erg.ok && (
        <div className="text-xs text-[#424245]" data-testid="spesen-vorschlag">
          <p><b>Vorschlag Tarif: {eur(erg.tarif.betrag)}</b> · steuerliche Pauschale zum Vergleich: {eur(erg.steuer.betrag)}</p>
          <ul className="list-disc ml-4 mt-1 text-[#86868b]">
            {erg.tarif.begruendung.map(t => <li key={t}>{t}</li>)}
            {erg.steuer.begruendung.map(t => <li key={'s' + t}>Steuerlich: {t}</li>)}
            {erg.hinweise.map(t => <li key={t} className="text-amber-700">{t}</li>)}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <label className="text-xs text-[#86868b]">Betrag von Hand (€)
          <input value={manuell} onChange={e => setManuell(e.target.value)} placeholder={vorschlag.toFixed(2).replace('.', ',')} inputMode="decimal" className={inp + ' w-28 ml-2'} data-testid="spesen-manuell" />
        </label>
        <button onClick={() => speichern(false)} disabled={speichert || !erg.ok} className="bg-[#e8590c] text-white text-sm px-4 py-2 rounded-xl disabled:opacity-50" data-testid="spesen-speichern">{speichert ? 'Speichere …' : 'Spesen speichern'}</button>
        {zeile?.betrag_manuell != null && <button onClick={() => speichern(true)} className="border border-black/10 text-sm px-3 py-2 rounded-xl" data-testid="spesen-zurueck">Zurück auf Vorschlag</button>}
        {gespeichert !== null && <span className="text-xs text-emerald-700" data-testid="spesen-gespeichert">Gespeichert: {eur(gespeichert)}{zeile?.betrag_manuell != null ? ' (von Hand)' : ''}</span>}
      </div>
      {meldung && <p className="text-xs text-red-700 mt-1" data-testid="spesen-meldung">{meldung}</p>}
    </div>
  );
}

export function SpesenMonatBlock({ monat, namen }: { monat: string; namen: Record<string, string> }) {
  const [tage, setTage] = useState<SpesenZeile[]>([]);
  const [auszahlung, setAuszahlung] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/spesen?monat=${monat}`, { cache: 'no-store' }).then(r => r.json()).then(j => { if (j.success) { setTage(j.tage); setAuszahlung(j.auszahlung); } }).catch(() => {});
  }, [monat]);
  const summen = new Map<string, { tarif: number; steuer: number; tage: number }>();
  for (const t of tage) { const s = summen.get(t.employee_id) || { tarif: 0, steuer: 0, tage: 0 }; s.tarif += endbetrag(t); s.steuer += Number(t.vorschlag_steuer || 0); s.tage++; summen.set(t.employee_id, s); }
  if (!summen.size) return null;
  const [y, m] = (auszahlung || monat).split('-');
  return (
    <div className="bg-white border border-black/10 rounded-xl p-4 mt-4 text-sm" data-testid="spesen-monat">
      <p className="font-semibold mb-2">Spesen im Monat {monat.split('-').reverse().join('/')}{auszahlung && <span className="font-normal text-[#86868b]"> · Auszahlung mit der Lohnabrechnung {m}/{y}</span>}</p>
      {[...summen.entries()].map(([id, s]) => (
        <div key={id} className="flex gap-4 py-1 border-t border-black/5"><span className="w-48">{namen[id] || id}</span><span>{s.tage} Tage</span><span className="font-semibold">{eur(s.tarif)}</span><span className="text-[#86868b]">steuerliche Pauschale zum Vergleich {eur(s.steuer)}</span></div>
      ))}
    </div>
  );
}

const SCHLUESSEL_LABEL: Record<string, string> = {
  verpflegung_heimfahrt: 'Verpflegungszuschuss je Tag (Heimfahrt)', verpflegung_schwelle_stunden: 'Verpflegungszuschuss ab Stunden Abwesenheit',
  ausloesung_voll: 'Auslösung je voller Tag', ausloesung_an_abreise: 'Auslösung An-/Abreisetag',
  pauschale_ueber_8h: 'Pauschale mehr als Schwelle', pauschale_schwelle_stunden: 'Schwelle in Stunden', pauschale_24h: 'Pauschale 24 Stunden', pauschale_an_abreise: 'Pauschale An-/Abreisetag',
  kuerzung_fruehstueck_prozent: 'Kürzung Frühstück (%)', kuerzung_mittag_prozent: 'Kürzung Mittagessen (%)', kuerzung_abend_prozent: 'Kürzung Abendessen (%)',
  auszahlung_monate_versatz: 'Auszahlung: Monate nach dem Arbeitsmonat',
};
const REGELWERK_LABEL: Record<string, string> = { tarif: 'Tarif Gerüstbauer-Handwerk', steuer: 'Steuerliche Pauschalen', betrieb: 'Betrieb' };

export function SpesenSaetzeBlock({ saetze, datum, onGeaendert }: { saetze: SatzZeile[]; datum: string; onGeaendert: () => void }) {
  const [offen, setOffen] = useState(false);
  const [f, setF] = useState({ regelwerk: 'tarif', schluessel: 'verpflegung_heimfahrt', wert: '', gueltig_ab: datum });
  const [meldung, setMeldung] = useState('');
  const speichern = useCallback(async () => {
    setMeldung('');
    const r = await fetch('/api/spesen-saetze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    if (!j.success) setMeldung(r.status === 403 ? 'Nur der Chef darf Sätze ändern.' : j.error || 'Speichern fehlgeschlagen.');
    else { setF({ ...f, wert: '' }); onGeaendert(); }
  }, [f, onGeaendert]);
  return (
    <div className="bg-white border border-black/10 rounded-xl p-4 mt-4 text-sm" data-testid="spesen-saetze">
      <button onClick={() => setOffen(!offen)} className="font-semibold" data-testid="spesen-saetze-toggle">{offen ? '▾' : '▸'} Spesensätze (gültig am {datum.split('-').reverse().join('.')})</button>
      {offen && (
        <div className="mt-3">
          {Object.entries(SATZ_SCHLUESSEL).map(([rw, keys]) => (
            <div key={rw} className="mb-3">
              <p className="text-xs font-semibold text-[#86868b] mb-1">{REGELWERK_LABEL[rw]}</p>
              {keys.map(k => {
                const aktuell = satzAm(saetze, rw, k, datum);
                const fassungen = saetze.filter(s => s.regelwerk === rw && s.schluessel === k);
                return <div key={k} className="flex flex-wrap gap-3 py-0.5"><span className="w-72">{SCHLUESSEL_LABEL[k]}</span><b>{aktuell === null ? 'fehlt' : String(aktuell).replace('.', ',')}</b><span className="text-xs text-[#86868b]">{fassungen.map(s => `${Number(s.wert).toLocaleString('de-DE')} ab ${s.gueltig_ab.split('-').reverse().join('.')}`).join(' · ')}</span></div>;
              })}
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2 border-t border-black/10 pt-3">
            <select value={f.regelwerk} onChange={e => setF({ ...f, regelwerk: e.target.value, schluessel: SATZ_SCHLUESSEL[e.target.value][0] })} className={inp}>{Object.keys(SATZ_SCHLUESSEL).map(k => <option key={k} value={k}>{REGELWERK_LABEL[k]}</option>)}</select>
            <select value={f.schluessel} onChange={e => setF({ ...f, schluessel: e.target.value })} className={inp}>{SATZ_SCHLUESSEL[f.regelwerk].map(k => <option key={k} value={k}>{SCHLUESSEL_LABEL[k]}</option>)}</select>
            <input value={f.wert} onChange={e => setF({ ...f, wert: e.target.value })} placeholder="neuer Wert" className={inp + ' w-28'} data-testid="satz-wert" />
            <label className="text-xs text-[#86868b]">gültig ab<input type="date" value={f.gueltig_ab} onChange={e => setF({ ...f, gueltig_ab: e.target.value })} className={inp + ' block'} data-testid="satz-gueltig" /></label>
            <button onClick={speichern} className="border border-black/10 hover:border-[#e8590c] px-4 py-2 rounded-xl" data-testid="satz-speichern">Neue Fassung speichern</button>
          </div>
          {meldung && <p className="text-xs text-red-700 mt-2">{meldung}</p>}
          <p className="text-xs text-[#86868b] mt-2">Die Sätze stammen aus dem Rahmentarifvertrag für das Gerüstbauer-Handwerk (§ 7) und den steuerlichen Verpflegungspauschalen. Der Tarifvertrag (27.02.2020, in Kraft seit 01.04.2021) war erstmals zum 31.12.2024 kündbar; ob die Beträge noch gelten, bitte beim Bundesverband Gerüstbau oder der IG BAU prüfen. Eine neue Fassung gilt ab dem eingetragenen Datum; frühere Tage rechnen weiter mit der alten.</p>
        </div>
      )}
    </div>
  );
}

export { EINSATZ_LABEL };
