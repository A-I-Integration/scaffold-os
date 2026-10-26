'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { positionDetailZeilen } from '@/lib/rechnung-position';
import { ENTSCHEIDUNG_LABEL, type PruefEntscheidung } from '@/lib/rechnung-pruefung';

// ============================================================
// SCAFFOLD OS – Rechnung prüfen (Auftraggeber, ohne Login)
// Zeigt Rechnungskopf, Einzelpositionen und Summen; der Auftraggeber
// akzeptiert, verlangt eine Änderung oder lehnt ab ("Geprüft von / am").
// ============================================================

const eur = (n: number) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const datum = (d?: string | null) => (d ? new Date(d.length <= 10 ? d + 'T00:00:00' : d).toLocaleDateString('de-DE') : '–');
const zahl = (n: number) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 3 });

export default function RechnungPruefenPage() {
  const { token } = useParams<{ token: string }>();
  const [daten, setDaten] = useState<any>(null);
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [entscheidung, setEntscheidung] = useState<PruefEntscheidung | ''>('');
  const [name, setName] = useState('');
  const [kommentar, setKommentar] = useState('');
  const [sendet, setSendet] = useState(false);
  const [fertig, setFertig] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/rechnung-pruefung?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => { if (!j.success) setFehler(j.error || 'Rechnung nicht gefunden.'); else setDaten(j); })
      .catch(() => setFehler('Die Rechnung konnte nicht geladen werden.'))
      .finally(() => setLaedt(false));
  }, [token]);

  async function absenden() {
    setFehler('');
    setSendet(true);
    try {
      const res = await fetch('/api/public/rechnung-pruefung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, entscheidung, geprueft_von: name, kommentar }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Speichern fehlgeschlagen.');
      setFertig(j.geprueftAm);
    } catch (e: any) { setFehler(e.message); }
    setSendet(false);
  }

  if (laedt) return <div className="min-h-screen flex items-center justify-center bg-[#fbfbfd]"><p className="text-sm text-[#86868b]">Lade Rechnung…</p></div>;
  if (!daten) return <div className="min-h-screen flex items-center justify-center bg-[#fbfbfd] px-4"><p className="text-sm text-[#86868b] text-center">{fehler}</p></div>;

  const r = daten.rechnung;
  const positionen: any[] = Array.isArray(r.positions) ? r.positions : [];
  const typ = ({ standard: 'Rechnung', abschlag: 'Abschlagsrechnung', schluss: 'Schlussrechnung', gutschrift: 'Gutschrift' } as Record<string, string>)[r.invoice_type] || 'Rechnung';
  const storniert = r.status === 'storniert';

  return (
    <div className="min-h-screen bg-[#fbfbfd] px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs text-[#86868b]">{daten.firma?.name}{daten.firma?.ort ? ` · ${daten.firma.ort}` : ''}</p>
          <h1 className="text-2xl font-bold text-[#1d1d1f]">{typ} {r.invoice_number} prüfen</h1>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 text-sm shadow-sm sm:grid-cols-4">
          <div><p className="text-xs text-[#86868b]">Rechnungsnummer</p><p className="font-medium">{r.invoice_number}</p></div>
          <div><p className="text-xs text-[#86868b]">Gerüstnummer</p><p className="font-medium">{r.geruest_nr || '–'}</p></div>
          <div><p className="text-xs text-[#86868b]">Leistungsdatum</p><p className="font-medium">{datum(r.leistungsdatum || r.invoice_date)}</p></div>
          <div><p className="text-xs text-[#86868b]">Rechnungsdatum</p><p className="font-medium">{datum(r.invoice_date)}</p></div>
        </div>

        {r.notes && (
          <div className="rounded-2xl bg-white p-4 text-sm shadow-sm">
            <p className="text-xs text-[#86868b]">Bemerkungen</p>
            <p className="whitespace-pre-wrap">{r.notes}</p>
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-black/10 text-left text-xs text-[#86868b]">
              <th className="p-3">Pos.</th><th className="p-3">Bezeichnung</th><th className="p-3 text-right">Menge</th><th className="p-3">Einh.</th><th className="p-3 text-right">Einzel</th><th className="p-3 text-right">Gesamt</th>
            </tr></thead>
            <tbody>
              {positionen.map((p, i) => (
                <tr key={i} className="border-b border-black/5 align-top">
                  <td className="p-3">{i + 1}</td>
                  <td className="p-3">
                    <p>{p.bezeichnung}</p>
                    {positionDetailZeilen(p).map((z, k) => <p key={k} className="text-xs text-[#86868b]">{z}</p>)}
                  </td>
                  <td className="p-3 text-right">{zahl(p.menge)}</td>
                  <td className="p-3">{p.einheit}</td>
                  <td className="p-3 text-right">{eur(p.einzelpreis)}</td>
                  <td className="p-3 text-right font-medium">{eur(p.menge * p.einzelpreis)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1 p-4 text-right text-sm">
            <p className="text-[#86868b]">Netto {eur(r.net_amount)}</p>
            <p className="text-[#86868b]">zzgl. {zahl(r.tax_rate)} % USt {eur(r.tax_amount)}</p>
            <p className="text-lg font-bold">Rechnungsbetrag {eur(r.gross_amount)}</p>
          </div>
        </div>

        {daten.pruefungen?.length > 0 && (
          <div className="rounded-2xl bg-white p-4 text-sm shadow-sm">
            <p className="mb-2 text-xs text-[#86868b]">Bisherige Prüfungen</p>
            {daten.pruefungen.map((p: any, i: number) => (
              <p key={i}><b>{ENTSCHEIDUNG_LABEL[p.entscheidung as PruefEntscheidung] || p.entscheidung}</b> · Geprüft von {p.geprueft_von} am {datum(p.geprueft_am)}{p.kommentar ? ` – ${p.kommentar}` : ''}</p>
            ))}
          </div>
        )}

        {storniert ? (
          <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">Diese Rechnung wurde storniert und kann nicht mehr geprüft werden.</p>
        ) : fertig ? (
          <p className="rounded-2xl bg-green-50 p-4 text-sm text-green-800">Danke – Ihre Prüfung wurde am {datum(fertig)} gespeichert. Sie können diese Seite schließen.</p>
        ) : (
          <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm font-medium">Ihre Prüfung</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(['akzeptiert', 'aenderung', 'abgelehnt'] as PruefEntscheidung[]).map((e) => (
                <button key={e} type="button" onClick={() => setEntscheidung(e)}
                  className={`rounded-xl border px-3 py-2 text-sm ${entscheidung === e ? 'border-[#e8590c] bg-[#e8590c]/10 text-[#e8590c]' : 'border-black/10'}`}>
                  {ENTSCHEIDUNG_LABEL[e]}
                </button>
              ))}
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Geprüft von (Ihr Name)" className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
            <textarea value={kommentar} onChange={(e) => setKommentar(e.target.value)} rows={3}
              placeholder={entscheidung && entscheidung !== 'akzeptiert' ? 'Begründung / gewünschte Änderung (Pflicht)' : 'Bemerkung (optional)'}
              className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
            {fehler && <p className="text-sm text-red-600">{fehler}</p>}
            <button type="button" disabled={!entscheidung || sendet} onClick={absenden}
              className="rounded-xl bg-[#e8590c] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
              {sendet ? 'Speichere…' : 'Prüfung abschicken'}
            </button>
            <p className="text-xs text-[#86868b]">Geprüft am wird automatisch mit dem Absenden gespeichert. Link gültig bis {datum(daten.gueltigBis)}.</p>
          </div>
        )}
      </div>
    </div>
  );
}
