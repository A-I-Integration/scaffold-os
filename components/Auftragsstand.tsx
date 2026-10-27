'use client'

import { useEffect, useMemo, useState } from 'react'
import { baueRechnungsPositionen, eingabeAusProjektData, summeNetto } from '@/lib/schlussrechnung'
import { normalisiereNachtraege, nachtragNummer, NACHTRAG_STATUS_LABEL } from '@/lib/nachtrag'
import { berechneAuftragsstand, bezahltBrutto, sortiereRechnungen, TYP_LABEL, type StandRechnung } from '@/lib/auftragsstand'

// Gesamtübersicht einer Baustelle: Auftragswert, Teilrechnungen (z. B. 70/30), Nachträge/Verlängerungen,
// bezahlt/offen. Alle Rechnungen sind anklickbar. Die Zahlen kommen aus den vorhandenen Daten; es wird nichts doppelt gepflegt.

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const datum = (d?: string | null) => { if (!d) return '–'; const x = new Date(String(d).slice(0, 10) + 'T12:00:00'); return Number.isNaN(x.getTime()) ? '–' : x.toLocaleDateString('de-DE') }

interface Props {
  project: { id: string; name: string | null; data: any }
  invoices: (StandRechnung & { project_id?: string | null })[]
}

export default function Auftragsstand({ project, invoices }: Props) {
  const [kranSatz, setKranSatz] = useState(850)
  useEffect(() => {
    let aktiv = true
    fetch('/api/company').then(r => r.json()).then(j => { if (aktiv && j.success) setKranSatz(Number(j.company?.calc_crane_day) || 850) }).catch(() => { /* Standardwert */ })
    return () => { aktiv = false }
  }, [])

  const nachtraege = useMemo(() => normalisiereNachtraege(project.data?.nachtraege), [project.data])
  const angebotNetto = useMemo(() => {
    if (!project.data?.kiResult && !project.data?.festpreisProM2) return 0
    try { return summeNetto(baueRechnungsPositionen({ eingabe: eingabeAusProjektData(project.data, kranSatz), basis: 'angebot' })) } catch { return 0 }
  }, [project.data, kranSatz])

  const stand = useMemo(() => berechneAuftragsstand({ angebotNetto, nachtraege, rechnungen: invoices }), [angebotNetto, nachtraege, invoices])
  const liste = sortiereRechnungen(invoices)

  const kachel = (titel: string, wert: string, hinweis?: string, rot = false) => (
    <div className="rounded border border-black/30 bg-white p-3">
      <div className="text-xs text-black/70">{titel}</div>
      <div className={`text-lg font-bold tabular-nums ${rot ? 'text-red-700' : 'text-black'}`}>{wert}</div>
      {hinweis && <div className="text-xs text-black/70 mt-0.5">{hinweis}</div>}
    </div>
  )

  return (
    <section className="space-y-3 text-black">
      <h3 className="font-bold text-base">Auftragsstand: {project.name || 'Baustelle'}</h3>
      {angebotNetto === 0 && <p className="text-sm rounded border border-black/30 px-3 py-2">Für diese Baustelle ist kein Angebotswert hinterlegt. Der Auftragswert besteht dann nur aus bestätigten Nachträgen, und der Prozentstand entfällt.</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kachel('Auftragswert (netto)', eur(stand.auftragswert), `Angebot ${eur(stand.angebotNetto)}${stand.nachtraegeBestaetigt ? ` + Nachträge ${eur(stand.nachtraegeBestaetigt)}` : ''}`)}
        {kachel('Abgerechnet (netto)', eur(stand.abgerechnet), stand.prozentAbgerechnet === null ? undefined : `${stand.prozentAbgerechnet.toLocaleString('de-DE')} % des Auftragswerts`)}
        {kachel('Noch abzurechnen (netto)', eur(stand.restZuAbrechnen), stand.nachtraegeOffen > 0 ? `Dazu offene Nachträge: ${eur(stand.nachtraegeOffen)} (noch nicht bestätigt)` : undefined)}
        {kachel('Offen (brutto)', eur(stand.offenBrutto), `Bezahlt ${eur(stand.bezahlt)}`, stand.ueberfaellig > 0)}
      </div>
      {stand.auftragswert > 0 && stand.abgerechnet > stand.auftragswert && <p className="text-sm text-red-700">Es ist mehr abgerechnet als der Auftragswert. Bitte prüfen, ob ein Nachtrag fehlt oder eine Rechnung doppelt gestellt wurde.</p>}
      {stand.ueberfaellig > 0 && <p className="text-sm text-red-700">Davon überfällig: {eur(stand.ueberfaellig)}</p>}

      <div>
        <h4 className="font-semibold text-sm mb-1">Rechnungen dieser Baustelle</h4>
        {liste.length === 0 ? <p className="text-sm text-black/70">Noch keine Rechnung.</p> : (
          <table className="w-full border-collapse text-sm">
            <thead><tr className="text-left bg-[#f0f0f0]">{['Datum', 'Art', 'Nummer', 'Status', 'Netto', 'Brutto', 'Offen'].map((h, i) => <th key={h} className={`px-2 py-1 border border-black/20 ${i >= 4 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
            <tbody>
              {liste.map(r => {
                const offen = r.status === 'storniert' ? 0 : Math.round((Number(r.gross_amount) - bezahltBrutto(r)) * 100) / 100
                return (
                  <tr key={r.id} className={r.status === 'storniert' ? 'line-through text-black/50' : ''}>
                    <td className="px-2 py-1 border border-black/20">{datum(r.invoice_date)}</td>
                    <td className="px-2 py-1 border border-black/20">{TYP_LABEL[r.invoice_type || 'standard'] || 'Rechnung'}</td>
                    <td className="px-2 py-1 border border-black/20"><a className="underline font-semibold" href={`/rechnungen/${r.id}`}>{r.invoice_number}</a></td>
                    <td className="px-2 py-1 border border-black/20">{r.status === 'bezahlt' ? 'Bezahlt' : r.status === 'storniert' ? 'Storniert' : r.status === 'ueberfaellig' ? 'Überfällig' : 'Offen'}</td>
                    <td className="px-2 py-1 border border-black/20 text-right tabular-nums">{eur(Number(r.net_amount))}</td>
                    <td className="px-2 py-1 border border-black/20 text-right tabular-nums">{eur(Number(r.gross_amount))}</td>
                    <td className="px-2 py-1 border border-black/20 text-right tabular-nums">{offen > 0 ? eur(offen) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <p className="text-xs text-black/70 mt-1">Die Schlussrechnung weist nur den Rest nach Abzug der Teilrechnungen aus, daher ergibt die Summe den Gesamtbetrag. Stornierte Rechnungen zählen nicht.</p>
      </div>

      {nachtraege.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm mb-1">Nachträge und Verlängerungen</h4>
          <ul className="space-y-1 text-sm">
            {nachtraege.map(n => (
              <li key={n.id} className="rounded border border-black/20 px-3 py-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <span><b>{nachtragNummer(n)}</b> · {datum(n.datum)} · {n.titel}{n.grund ? ` – ${n.grund}` : ''}</span>
                <span className="tabular-nums">{eur(n.betrag)} · {NACHTRAG_STATUS_LABEL[n.status]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
