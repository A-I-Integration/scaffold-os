'use client';

import { useState } from 'react';
import { ABSCHNITT_LABEL } from '@/lib/zeit-abschnitte';

// ============================================================
// SCAFFOLD OS – Ortung in der Tagesansicht
//  • OrtungVorschlag: Abschnitte aus Tour und Fahrzeug-Positionen vorschlagen und übernehmen
//  • OrtungImport: Positionen des Telematik-Anbieters per CSV einlesen
// ============================================================

interface V { art: string; start_time: string; end_time: string; note: string; begruendung: string; bereitsVorhanden: boolean }
interface T { tour: string; vorschlaege: V[]; hinweise: string[] }
const uhr = (t: string) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export function OrtungVorschlag({ employeeId, datum, onUebernommen }: { employeeId: string; datum: string; onUebernommen: () => void }) {
  const [touren, setTouren] = useState<T[] | null>(null);
  const [hinweise, setHinweise] = useState<string[]>([]);
  const [meldung, setMeldung] = useState('');
  const [laedt, setLaedt] = useState(false);

  async function pruefen() {
    setLaedt(true); setMeldung('');
    try {
      const r = await fetch(`/api/ortung-vorschlag?datum=${datum}&employee_id=${employeeId}`, { cache: 'no-store' });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setTouren(j.touren); setHinweise(j.hinweise);
    } catch (e: any) { setMeldung(e.message || 'Laden fehlgeschlagen.'); }
    finally { setLaedt(false); }
  }
  async function uebernehmen() {
    setMeldung('');
    try {
      const r = await fetch('/api/ortung-vorschlag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: employeeId, work_date: datum }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setMeldung(`${j.angelegt} Abschnitt(e) übernommen${j.uebersprungen ? `, ${j.uebersprungen} übersprungen (bereits vorhanden)` : ''}.`);
      setTouren(null); onUebernommen();
    } catch (e: any) { setMeldung(e.message || 'Übernehmen fehlgeschlagen.'); }
  }
  const frei = (touren || []).reduce((s, t) => s + t.vorschlaege.filter(v => !v.bereitsVorhanden).length, 0);

  return (
    <div className="mt-2 text-sm" data-testid={`ortung-${employeeId}`}>
      <button onClick={pruefen} disabled={laedt} className="text-xs border border-black/10 hover:border-[#e8590c] rounded-md px-2.5 py-1" data-testid="ortung-pruefen">{laedt ? 'Prüfe …' : 'Vorschläge aus Tour und Ortung'}</button>
      {meldung && <span className="ml-2 text-xs text-[#424245]" data-testid="ortung-meldung">{meldung}</span>}
      {touren && (
        <div className="mt-2 border border-black/10 rounded-xl p-3 bg-[#fbfbfd]" data-testid="ortung-liste">
          {hinweise.map(h => <p key={h} className="text-xs text-amber-700">{h}</p>)}
          {touren.map(t => (
            <div key={t.tour} className="mb-2">
              <p className="text-xs font-semibold">Tour {t.tour}</p>
              {t.hinweise.map(h => <p key={h} className="text-xs text-amber-700">⚠ {h}</p>)}
              <ul className="text-xs">
                {t.vorschlaege.map((v, i) => (
                  <li key={i} className="py-0.5" data-testid="ortung-vorschlag">
                    <span className="inline-block w-44">{ABSCHNITT_LABEL[v.art]}</span>{uhr(v.start_time)} – {uhr(v.end_time)} <span className="text-[#86868b]">· {v.note}</span>
                    {v.bereitsVorhanden && <span className="text-amber-700"> · überschneidet sich mit einem vorhandenen Abschnitt</span>}
                    <div className="text-[#86868b] ml-1">{v.begruendung}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {frei > 0 && <button onClick={uebernehmen} className="bg-[#e8590c] text-white text-xs px-3 py-1.5 rounded-lg" data-testid="ortung-uebernehmen">{frei} Vorschlag/Vorschläge als Abschnitte übernehmen</button>}
          <p className="text-[11px] text-[#86868b] mt-2">Vorschläge werden nicht automatisch gebucht. Nach dem Übernehmen lassen sich alle Abschnitte wie gewohnt ändern.</p>
        </div>
      )}
    </div>
  );
}

export function OrtungImport() {
  const [offen, setOffen] = useState(false);
  const [ergebnis, setErgebnis] = useState<any>(null);
  const [meldung, setMeldung] = useState('');
  const [laedt, setLaedt] = useState(false);

  async function lesen(datei: File | undefined) {
    if (!datei) return;
    setLaedt(true); setMeldung(''); setErgebnis(null);
    try {
      const r = await fetch('/api/ortung-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: await datei.text() }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setErgebnis(j);
    } catch (e: any) { setMeldung(e.message || 'Import fehlgeschlagen.'); }
    finally { setLaedt(false); }
  }
  return (
    <div className="bg-white border border-black/10 rounded-xl p-4 mt-4 text-sm" data-testid="ortung-import">
      <button onClick={() => setOffen(!offen)} className="font-semibold" data-testid="ortung-import-toggle">{offen ? '▾' : '▸'} Ortungsdaten importieren (CSV vom Telematik-Anbieter)</button>
      {offen && (
        <div className="mt-3">
          <p className="text-xs text-[#86868b] mb-2">Die Datei braucht eine Kopfzeile mit den Spalten Zeit (oder Datum und Uhrzeit), Kennzeichen, Breitengrad (lat) und Längengrad (lng). Trenner ; oder , sind möglich. Zeiten ohne Zeitzone gelten als deutsche Ortszeit. Das Fahrzeug wird über das Kennzeichen zugeordnet. Positionen älter als 90 Tage werden nicht übernommen.</p>
          <input type="file" accept=".csv,text/csv,text/plain" onChange={e => lesen(e.target.files?.[0])} disabled={laedt} data-testid="ortung-datei" />
          {laedt && <p className="text-xs mt-2">Lese Datei …</p>}
          {meldung && <p className="text-xs text-red-700 mt-2" data-testid="ortung-import-fehler">{meldung}</p>}
          {ergebnis && (
            <ul className="text-xs mt-2" data-testid="ortung-import-ergebnis">
              <li>{ergebnis.importiert} Positionen importiert, {ergebnis.doppelt} bereits vorhanden</li>
              {ergebnis.zuAlt > 0 && <li>{ergebnis.zuAlt} älter als 90 Tage (nicht übernommen)</li>}
              {ergebnis.ungueltig > 0 && <li>{ergebnis.ungueltig} Zeilen ungültig</li>}
              {ergebnis.unbekannteKennzeichen.length > 0 && <li className="text-amber-700">Kennzeichen ohne Fahrzeug im System: {ergebnis.unbekannteKennzeichen.join(', ')}</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
