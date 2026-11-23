'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalisiereNachtraege, nachtragNummer, NACHTRAG_STATUS_LABEL } from '@/lib/nachtrag'
import { berechneBaustellenErgebnis, type PersonalZeile } from '@/lib/baustellen-ergebnis'
import { berechneAuftragsstand, angebotNettoAusProjekt, auftragUrl, type StandRechnung } from '@/lib/auftragsstand'

// Gesamtübersicht einer Baustelle: Auftragswert, Teilrechnungen (z. B. 70/30), Nachträge/Verlängerungen,
// bezahlt/offen. Alle Rechnungen sind anklickbar. Die Zahlen kommen aus den vorhandenen Daten; es wird nichts doppelt gepflegt.

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const datum = (d?: string | null) => { if (!d) return '–'; const x = new Date(String(d).slice(0, 10) + 'T12:00:00'); return Number.isNaN(x.getTime()) ? '–' : x.toLocaleDateString('de-DE') }

interface Props {
  project: { id: string; name: string | null; data: any }
  invoices: (StandRechnung & { project_id?: string | null; positions?: any[] | null })[]
  /** Öffnet den Rechnungsdialog mit vorbelegter Art/Prozent. Ohne Angabe werden die Knöpfe nicht gezeigt. */
  onRechnungStellen?: (art: 'abschlag' | 'schluss', prozent?: number) => void
  /** Wird nach Erinnerung/Mahnung/Pause aufgerufen, damit die Rechnungen neu geladen werden. Ohne Angabe: keine Mahn-Spalte. */
  onGeaendert?: () => void
  /** 'abrechnung': Auftragswert, Rest, Rechnung stellen, Nachträge. 'baustelle': Ergebnis und Link für den Auftraggeber. */
  ansicht?: 'abrechnung' | 'baustelle'
}

export default function Auftragsstand({ project, invoices, onRechnungStellen, onGeaendert, ansicht = 'abrechnung' }: Props) {
  const baustelleAnsicht = ansicht === 'baustelle'
  void onGeaendert
  const [kranSatz, setKranSatz] = useState(850)
  useEffect(() => {
    let aktiv = true
    fetch('/api/company').then(r => r.json()).then(j => { if (aktiv && j.success) setKranSatz(Number(j.company?.calc_crane_day) || 850) }).catch(() => { /* Standardwert */ })
    return () => { aktiv = false }
  }, [])

  // Link für den Auftraggeber (Live-Ansicht, nur lesen)
  interface StandLink { id: string; token: string; label: string | null; created_at: string; status: 'aktiv' | 'abgelaufen' | 'widerrufen' }
  const [links, setLinks] = useState<StandLink[]>([])
  const [tabelleFehlt, setTabelleFehlt] = useState(false)
  const [linkFehler, setLinkFehler] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkLabel, setLinkLabel] = useState('')
  const ladeLinks = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/auftrag-link?project_id=${project.id}`, { cache: 'no-store' })).json()
      if (!j.success) throw new Error(j.error)
      setLinks(j.links); setTabelleFehlt(!!j.tabelleFehlt); setLinkFehler('')
    } catch (e) { setLinkFehler(e instanceof Error ? e.message : 'Laden fehlgeschlagen') }
  }, [project.id])
  useEffect(() => { if (baustelleAnsicht) void ladeLinks() }, [ladeLinks, baustelleAnsicht])
  const linkLauf = async (f: () => Promise<void>) => { setLinkBusy(true); setLinkFehler(''); try { await f(); await ladeLinks() } catch (e) { setLinkFehler(e instanceof Error ? e.message : 'Fehlgeschlagen') } finally { setLinkBusy(false) } }
  const linkAnlegen = () => linkLauf(async () => {
    const j = await (await fetch('/api/auftrag-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: project.id, label: linkLabel }) })).json()
    if (!j.success) throw new Error(j.error); setLinkLabel('')
  })
  const linkWiderrufen = (id: string) => linkLauf(async () => {
    if (!confirm('Link widerrufen? Der Auftraggeber sieht dann nichts mehr über diesen Link.')) return
    const j = await (await fetch(`/api/auftrag-link?id=${id}`, { method: 'DELETE' })).json()
    if (!j.success) throw new Error(j.error)
  })

  const nachtraege = useMemo(() => normalisiereNachtraege(project.data?.nachtraege), [project.data])
  const angebotNetto = useMemo(() => angebotNettoAusProjekt(project.data, kranSatz), [project.data, kranSatz])

  const stand = useMemo(() => berechneAuftragsstand({ angebotNetto, nachtraege, rechnungen: invoices }), [angebotNetto, nachtraege, invoices])


  // Ergebnis der Baustelle: Erlös minus Personalkosten (nur in der internen Ansicht)
  const [personal, setPersonal] = useState<{ zeilen: PersonalZeile[]; ohneStunden: number } | null>(null)
  const [ergebnisFehler, setErgebnisFehler] = useState('')
  const [zuschlag, setZuschlag] = useState('0')
  useEffect(() => {
    if (!baustelleAnsicht) return
    let aktiv = true
    fetch(`/api/baustellen-ergebnis?project_id=${project.id}`, { cache: 'no-store' }).then(r => r.json()).then(j => {
      if (!aktiv) return
      if (!j.success) { setErgebnisFehler(j.error || 'Nicht verfügbar'); return }
      setPersonal({ zeilen: j.zeilen, ohneStunden: j.eintraegeOhneStunden || 0 }); setErgebnisFehler('')
    }).catch(() => { if (aktiv) setErgebnisFehler('Laden fehlgeschlagen') })
    return () => { aktiv = false }
  }, [project.id, baustelleAnsicht])

  const ergebnis = useMemo(() => personal ? berechneBaustellenErgebnis({
    erloesNetto: stand.abgerechnet, auftragswertNetto: stand.auftragswert, zeilen: personal.zeilen,
    zuschlagProzent: parseFloat(zuschlag.replace(',', '.')) || 0,
  }) : null, [personal, stand, zuschlag])

  const kachel = (titel: string, wert: string, hinweis?: string, rot = false) => (
    <div className="rounded border border-black/30 bg-white p-3">
      <div className="text-xs text-black/70">{titel}</div>
      <div className={`text-lg font-bold tabular-nums ${rot ? 'text-red-700' : 'text-black'}`}>{wert}</div>
      {hinweis && <div className="text-xs text-black/70 mt-0.5">{hinweis}</div>}
    </div>
  )

  return (
    <section className="space-y-3 text-black">
      {!baustelleAnsicht && <>
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
      </>}

      {baustelleAnsicht && (
        <div className="rounded border border-black/30 bg-white p-3 space-y-2">
          <h4 className="font-semibold text-sm">Ergebnis der Baustelle (Erlös minus Personalkosten)</h4>
          {ergebnisFehler && <p className="text-sm text-black/70">{ergebnisFehler}</p>}
          {ergebnis && (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {kachel('Erlös bisher (netto)', eur(ergebnis.erloes))}
                {kachel('Personalkosten', eur(ergebnis.personalkosten + ergebnis.spesen), `${ergebnis.stunden.toLocaleString('de-DE')} Std.${ergebnis.spesen > 0 ? ` · davon Spesen ${eur(ergebnis.spesen)}` : ''}`)}
                {kachel('Ergebnis bisher', eur(ergebnis.ergebnis), ergebnis.margeProzent === null ? 'Noch nichts abgerechnet' : `${ergebnis.margeProzent.toLocaleString('de-DE')} % vom Erlös`, ergebnis.ergebnis < 0)}
                {kachel('Bei voller Abrechnung', ergebnis.ergebnisBeiVollerAbrechnung === null ? '–' : eur(ergebnis.ergebnisBeiVollerAbrechnung), ergebnis.ergebnisBeiVollerAbrechnung === null ? 'Kein Auftragswert hinterlegt' : 'Auftragswert minus bisherige Kosten', (ergebnis.ergebnisBeiVollerAbrechnung ?? 0) < 0)}
              </div>
              {ergebnis.ohneSatz.length > 0 && <p className="text-sm text-red-700">Für {ergebnis.ohneSatz.join(', ')} ist kein Stundensatz hinterlegt ({ergebnis.stundenOhneSatz.toLocaleString('de-DE')} Std. sind nicht bewertet). Bitte in der Mitarbeiterverwaltung nachtragen.</p>}
              {personal && personal.ohneStunden > 0 && <p className="text-sm text-black/70">{personal.ohneStunden} Zeiteintrag/Zeiteinträge ohne Stunden (z. B. noch eingestempelt) sind nicht eingerechnet.</p>}
              {ergebnis.je.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold">Aufteilung nach Mitarbeitern</summary>
                  <table className="w-full border-collapse mt-1">
                    <thead><tr className="text-left bg-[#f0f0f0]">{['Mitarbeiter', 'Stunden', 'Satz', 'Kosten'].map((h, i) => <th key={h} className={`px-2 py-1 border border-black/20 ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                    <tbody>{ergebnis.je.map(m => (
                      <tr key={m.id}><td className="px-2 py-1 border border-black/20">{m.name}</td><td className="px-2 py-1 border border-black/20 text-right tabular-nums">{m.stunden.toLocaleString('de-DE')}</td><td className="px-2 py-1 border border-black/20 text-right tabular-nums">{m.satz === null ? '–' : eur(m.satz)}</td><td className="px-2 py-1 border border-black/20 text-right tabular-nums">{m.kosten === null ? 'nicht bewertet' : eur(m.kosten)}</td></tr>
                    ))}</tbody>
                  </table>
                </details>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="lnk-zuschlag">Zuschlag Lohnnebenkosten auf den Stundensatz (%)</label>
                <input id="lnk-zuschlag" value={zuschlag} onChange={e => setZuschlag(e.target.value)} inputMode="decimal" className="w-20 rounded border border-black/40 px-2 py-1 text-right" />
                <span className="text-black/70">nur für diese Ansicht, wird nicht gespeichert</span>
              </div>
              <p className="text-xs text-black/70">Grundlage: gebuchte Stunden mit Projektbezug × Stundensatz aus der Mitarbeiterverwaltung (Annahme: das ist der Kostensatz, nicht der Verrechnungssatz). Nicht enthalten: Material, Fahrzeuge, Kran, Fremdleistungen und Gemeinkosten. Das Ergebnis ist ein Deckungsbeitrag nach Personal, kein Gewinn.</p>
            </>
          )}
        </div>
      )}

      {!baustelleAnsicht && onRechnungStellen && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Rechnung stellen:</span>
          {[70, 30].map(p => <button key={p} type="button" onClick={() => onRechnungStellen('abschlag', p)} className="px-3 py-1.5 text-sm rounded border border-black/40 bg-white hover:bg-[#f0f0f0]">Teilrechnung {p} %</button>)}
          <button type="button" onClick={() => onRechnungStellen('abschlag')} className="px-3 py-1.5 text-sm rounded border border-black/40 bg-white hover:bg-[#f0f0f0]">Teilrechnung (Prozent oder Betrag frei)</button>
          <button type="button" onClick={() => onRechnungStellen('schluss')} className="px-3 py-1.5 text-sm rounded border border-black/40 bg-white hover:bg-[#f0f0f0]">Schlussrechnung</button>
          <span className="text-xs text-black/70 w-full">Die Prozente beziehen sich auf die Gesamtleistung im Dialog und lassen sich dort ändern. Es wird erst gespeichert, wenn Sie die Rechnung dort anlegen.</span>
        </div>
      )}

      {!baustelleAnsicht && nachtraege.length > 0 && (
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
    
      {baustelleAnsicht && <div className="space-y-2">
        <h4 className="font-semibold text-sm">Link für den Auftraggeber</h4>
        <p className="text-xs text-black/70">Der Auftraggeber sieht damit immer den aktuellen Stand dieser Baustelle (Auftragswert, Teilrechnungen, Schlussrechnung, Nachträge) und kann jede Rechnung öffnen. Nur lesen, ohne Login. Wer den Link hat, sieht den Stand. Bei Verlust den Link widerrufen und einen neuen erstellen.</p>
        {tabelleFehlt && <p className="text-sm rounded border border-amber-400 bg-amber-50 px-3 py-2">Die Link-Tabelle fehlt noch. Bitte die SQL „phase-auftrag-links.sql“ einmalig im Supabase SQL-Editor ausführen.</p>}
        {linkFehler && <p className="text-sm text-red-600">❌ {linkFehler}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <input className="border border-black/30 rounded px-2 py-1.5 bg-white text-black" placeholder="Bezeichnung, z. B. Bauherr Müller" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} maxLength={80} />
          <button className="rounded border border-black/30 px-3 py-1.5 bg-[#f0f0f0] hover:bg-[#e4e4e4] disabled:opacity-50" disabled={linkBusy || tabelleFehlt} onClick={linkAnlegen}>Link erstellen</button>
        </div>
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-black/20 px-3 py-2 text-sm">
              <span>{l.label || 'Link'} · {datum(l.created_at)} · {l.status === 'aktiv' ? 'aktiv' : l.status === 'abgelaufen' ? 'abgelaufen' : 'widerrufen'}</span>
              {l.status === 'aktiv' && (
                <span className="flex gap-2">
                  <button className="rounded border border-black/30 px-3 py-1 bg-[#f0f0f0] hover:bg-[#e4e4e4]" onClick={async () => { const u = auftragUrl(window.location.origin, l.token); try { await navigator.clipboard.writeText(u); alert('Link kopiert:\n' + u) } catch { prompt('Link bitte kopieren:', u) } }}>Link kopieren</button>
                  <a className="rounded border border-black/30 px-3 py-1 bg-[#f0f0f0] hover:bg-[#e4e4e4]" href={auftragUrl(window.location.origin, l.token)} target="_blank" rel="noreferrer">Ansehen</a>
                  <button className="rounded border border-black/30 px-3 py-1 bg-[#f0f0f0] text-red-700 hover:bg-[#e4e4e4]" disabled={linkBusy} onClick={() => linkWiderrufen(l.id)}>Widerrufen</button>
                </span>
              )}
            </li>
          ))}
          {links.length === 0 && !tabelleFehlt && <li className="text-sm text-black/70">Noch kein Link.</li>}
        </ul>
      </div>}
    </section>
  )
}
