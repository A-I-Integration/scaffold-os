'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  werteAus, vorkommendeLaender, auswertungCsv, auswertungZeilen, summenZeilen,
  AUSWERTUNG_KOPF, SUMMEN_KOPF, LAENDER_VORSCHLAG, STANDARD_LAND,
  type AuswertungEintrag, type AuswertungMitarbeiter,
} from '@/lib/auswertung';
import { ladeExcel } from '@/lib/excel-liste';

// ============================================================
// SCAFFOLD OS – Auswertung der Zeiterfassung
// Mitarbeiter wählen · Monat oder Jahr · nur Tage über X Stunden · nach Land der Baustelle · CSV und Excel
// ============================================================

const jetzt = new Date();
const monatJetzt = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}`;
const datumDe = (d: string) => d.split('-').reverse().join('.');
const zahl = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Projekt { id: string; name: string; adresse?: string | null; land?: string | null }

export default function ZeitAuswertung({ canEdit }: { canEdit: boolean }) {
  const [zeitraum, setZeitraum] = useState<'monat' | 'jahr'>('monat');
  const [monat, setMonat] = useState(monatJetzt);
  const [jahr, setJahr] = useState(String(jetzt.getFullYear()));
  const [mitarbeiter, setMitarbeiter] = useState<AuswertungMitarbeiter[]>([]);
  const [auswahl, setAuswahl] = useState<string[]>([]);
  const [eintraege, setEintraege] = useState<AuswertungEintrag[]>([]);
  const [nurUeber, setNurUeber] = useState(true);
  const [schwelle, setSchwelle] = useState('8');
  const [land, setLand] = useState('');
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [spalteFehlt, setSpalteFehlt] = useState(false);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState('');
  const [meldung, setMeldung] = useState('');

  const laden = useCallback(async () => {
    setLaedt(true); setFehler('');
    try {
      const ep = zeitraum === 'jahr' ? `/api/zeiterfassung?year=${jahr}` : `/api/zeiterfassung?month=${monat}`;
      const res = await fetch(ep, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMitarbeiter(json.employees);
      setEintraege(Object.values(json.entriesByEmployee as Record<string, AuswertungEintrag[]>).flat());
    } catch (e: any) { setFehler(e.message); } finally { setLaedt(false); }
  }, [zeitraum, monat, jahr]);
  useEffect(() => { laden(); }, [laden]);

  const ladeProjekte = useCallback(async () => {
    try {
      const j = await (await fetch('/api/projekt-land', { cache: 'no-store' })).json();
      if (j.success) { setProjekte(j.projekte); setSpalteFehlt(!!j.spalteFehlt); }
    } catch { /* Länderliste bleibt leer */ }
  }, []);
  useEffect(() => { ladeProjekte(); }, [ladeProjekte]);

  const schwelleZahl = nurUeber ? Number(schwelle.replace(',', '.')) : null;
  const schwelleOk = schwelleZahl === null || (Number.isFinite(schwelleZahl) && schwelleZahl >= 0 && schwelleZahl <= 24);

  const laenderAuswahl = useMemo(() => {
    const s = new Set([...LAENDER_VORSCHLAG, ...vorkommendeLaender(eintraege)]);
    for (const p of projekte) if (p.land) s.add(p.land);
    return [...s].sort((a, b) => a.localeCompare(b, 'de'));
  }, [eintraege, projekte]);

  const { tage, summen } = useMemo(
    () => werteAus(eintraege, mitarbeiter, { employeeIds: auswahl, schwelleStunden: schwelleOk ? schwelleZahl : null, land }),
    [eintraege, mitarbeiter, auswahl, schwelleZahl, schwelleOk, land],
  );
  const gesamt = useMemo(() => ({ tage: tage.length, stunden: Math.round(tage.reduce((s, t) => s + t.stunden, 0) * 100) / 100 }), [tage]);

  const zeitraumText = zeitraum === 'jahr' ? jahr : monat;
  const dateiBasis = `auswertung_${zeitraumText}${nurUeber ? `_ueber_${schwelle.replace(',', '.')}h` : ''}${land ? `_${land}` : ''}`.replace(/[^\w.-]+/g, '_');

  function csv() {
    const blob = new Blob(['﻿' + auswertungCsv(tage)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${dateiBasis}.csv`; a.click();
  }
  function excel() {
    ladeExcel(`${dateiBasis}.xlsx`, [
      { name: 'Tage', kopf: AUSWERTUNG_KOPF, zeilen: auswertungZeilen(tage) },
      { name: 'Summen', kopf: SUMMEN_KOPF, zeilen: summenZeilen(summen) },
    ]);
  }

  function umschalten(id: string) { setAuswahl(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id])); }

  async function landSpeichern(p: Projekt, neu: string) {
    setMeldung('');
    try {
      const res = await fetch('/api/projekt-land', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: p.id, land: neu }) });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setProjekte(ps => ps.map(x => (x.id === p.id ? { ...x, land: j.land } : x)));
      setMeldung(`Land für „${p.name}“ gespeichert.`);
      laden();
    } catch (e: any) { setMeldung(e.message || 'Speichern fehlgeschlagen.'); }
  }

  const feld = 'bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#e8590c]';
  const knopf = 'border border-black/10 hover:border-[#e8590c] text-[#424245] hover:text-[#e8590c] text-sm px-4 py-2 rounded-xl transition-colors disabled:opacity-40';

  return (
    <div data-testid="zeit-auswertung">
      <h1 className="text-2xl font-bold mb-4">Auswertung</h1>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-2">
          {(['monat', 'jahr'] as const).map(k => (
            <button key={k} data-testid={`auswertung-${k}`} onClick={() => setZeitraum(k)}
              className={`text-sm px-4 py-2 rounded-xl border ${zeitraum === k ? 'bg-[#e8590c] text-white border-[#e8590c]' : 'border-black/10 text-[#424245]'}`}>{k === 'monat' ? 'Monat' : 'Jahr'}</button>
          ))}
        </div>
        {zeitraum === 'monat'
          ? <input type="month" value={monat} onChange={e => setMonat(e.target.value)} className={feld} />
          : <input type="number" min={2000} max={2100} value={jahr} onChange={e => /^\d{4}$/.test(e.target.value) && setJahr(e.target.value)} className={`${feld} w-24`} aria-label="Jahr" />}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" data-testid="auswertung-ueber" checked={nurUeber} onChange={e => setNurUeber(e.target.checked)} />
          nur Tage mit mehr als
          <input type="text" inputMode="decimal" value={schwelle} onChange={e => setSchwelle(e.target.value)} disabled={!nurUeber}
            className={`${feld} w-16 text-center`} aria-label="Stunden" /> Stunden
        </label>
        <select value={land} onChange={e => setLand(e.target.value)} data-testid="auswertung-land" className={feld} aria-label="Land der Baustelle">
          <option value="">Alle Länder</option>
          {laenderAuswahl.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <div className="flex gap-2 ml-auto">
          <button onClick={csv} disabled={!tage.length} data-testid="auswertung-csv" className={knopf}>CSV</button>
          <button onClick={excel} disabled={!tage.length} data-testid="auswertung-excel" className={knopf}>Excel</button>
        </div>
      </div>

      <details className="mb-4 bg-white border border-black/10 rounded-xl p-3" open={auswahl.length > 0}>
        <summary className="cursor-pointer text-sm font-medium">Mitarbeiter wählen ({auswahl.length ? `${auswahl.length} gewählt` : 'alle'})</summary>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
          {mitarbeiter.map(m => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={auswahl.includes(m.id)} onChange={() => umschalten(m.id)} />
              {m.last_name}, {m.first_name}
            </label>
          ))}
          {auswahl.length > 0 && <button className="text-sm text-[#e8590c] underline" onClick={() => setAuswahl([])}>Auswahl aufheben</button>}
        </div>
      </details>

      {!schwelleOk && <p className="text-sm text-red-600 mb-3">Bitte eine Stundenzahl zwischen 0 und 24 eingeben.</p>}
      {fehler && <p className="text-sm text-red-600 mb-3">{fehler}</p>}
      <p className="text-xs text-[#6e6e73] mb-3">
        Gezählt wird je Mitarbeiter und Tag die Summe aller Stempelzeiten. Beim Landfilter bleiben Tage mit mindestens einer Buchung auf einer Baustelle in diesem Land;
        „Stunden im Land“ zeigt den Anteil dieser Baustellen. Baustellen ohne Land gelten als {STANDARD_LAND}.
      </p>

      {laedt ? <p className="text-sm text-[#6e6e73]">Lade …</p> : (
        <>
          <p className="text-sm mb-2" data-testid="auswertung-summe"><strong>{gesamt.tage}</strong> Tage · <strong>{zahl(gesamt.stunden)}</strong> Stunden</p>
          {summen.length > 0 && (
            <table className="w-full text-sm mb-6 bg-white border border-black/10 rounded-xl overflow-hidden">
              <thead><tr className="text-left text-[#6e6e73]"><th className="p-2">Mitarbeiter</th><th className="p-2">Tage</th><th className="p-2">Stunden</th><th className="p-2">davon im Land</th>{nurUeber && <th className="p-2">Mehr als {schwelle} h</th>}</tr></thead>
              <tbody>{summen.map(s => (
                <tr key={s.employee_id} className="border-t border-black/5"><td className="p-2">{s.name}</td><td className="p-2">{s.tage}</td><td className="p-2">{zahl(s.stunden)}</td><td className="p-2">{zahl(s.stundenImLand)}</td>{nurUeber && <td className="p-2">{zahl(s.mehrAlsSchwelle)}</td>}</tr>
              ))}</tbody>
            </table>
          )}
          {tage.length === 0 ? <p className="text-sm text-[#6e6e73]" data-testid="auswertung-leer">Keine Tage mit diesen Filtern.</p> : (
            <table className="w-full text-sm bg-white border border-black/10 rounded-xl overflow-hidden">
              <thead><tr className="text-left text-[#6e6e73]"><th className="p-2">Mitarbeiter</th><th className="p-2">Datum</th><th className="p-2">Stunden</th><th className="p-2">im Land</th><th className="p-2">Land</th><th className="p-2">Baustellen</th></tr></thead>
              <tbody>{tage.map(t => (
                <tr key={`${t.employee_id}|${t.work_date}`} className="border-t border-black/5" data-testid="auswertung-zeile">
                  <td className="p-2">{t.name}</td><td className="p-2">{datumDe(t.work_date)}</td><td className="p-2">{zahl(t.stunden)}</td><td className="p-2">{zahl(t.stundenImLand)}</td>
                  <td className="p-2">{t.laender.join(', ')}</td><td className="p-2">{t.baustellen.join(', ') || '–'}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}

      <details className="mt-8 bg-white border border-black/10 rounded-xl p-3" data-testid="auswertung-laender">
        <summary className="cursor-pointer text-sm font-medium">Land der Baustellen festlegen</summary>
        {spalteFehlt && <p className="text-sm text-red-600 mt-2">Die Spalte „Land“ fehlt noch in der Datenbank. Bitte phase-139-baustelle-land.sql in Supabase ausführen.</p>}
        {meldung && <p className="text-sm text-emerald-700 mt-2">{meldung}</p>}
        <datalist id="laender-vorschlag">{LAENDER_VORSCHLAG.map(l => <option key={l} value={l} />)}</datalist>
        <table className="w-full text-sm mt-3">
          <tbody>{projekte.map(p => (
            <tr key={p.id} className="border-t border-black/5">
              <td className="p-2">{p.name}<span className="text-[#6e6e73]"> {p.adresse ? `· ${p.adresse}` : ''}</span></td>
              <td className="p-2 w-56">
                <input list="laender-vorschlag" defaultValue={p.land || ''} placeholder={STANDARD_LAND} disabled={!canEdit || spalteFehlt}
                  onBlur={e => { if ((e.target.value || '') !== (p.land || '')) landSpeichern(p, e.target.value); }}
                  className={`${feld} w-full`} aria-label={`Land für ${p.name}`} />
              </td>
            </tr>
          ))}</tbody>
        </table>
        {!canEdit && <p className="text-xs text-[#6e6e73] mt-2">Nur Chef und Disposition können das Land ändern.</p>}
      </details>
    </div>
  );
}
