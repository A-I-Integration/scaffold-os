import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt, NAVY, GRAU_TEXT, DUNKEL, seitenFuss } from './aufmassblatt-pdf'
import { bisherAbgerechnetJePosition, zwischenaufmassNr, type Zwischenaufmass } from './zwischenaufmass'

// ============================================================
// SCAFFOLD OS – Aufmaß je Zwischenaufmaß als PDF (Schritt 3 des kumulierten Aufmaßes)
//
// Zwei Ansichten desselben Zwischenaufmaßes:
//  · Einzelaufmaß:      nur die Menge dieser Abrechnungsperiode (kumuliert − bisher abgerechnet)
//  · Kumuliertes Aufmaß: Vertrag, Gesamtleistung, bisher abgerechnet, aktuelle Differenz
// Beide sind prüfbar für den Auftraggeber (Unterschriftsfelder, Beträge netto) und zeigen keine internen Kosten.
// ============================================================

export type AufmassAnsicht = 'einzel' | 'kumuliert'

export interface BelegZeile {
  pos: number
  bezeichnung: string
  einheit: string
  /** vereinbarte Menge, falls erfasst */
  vertrag: number | null
  kumuliert: number
  bisher: number
  /** Menge dieser Periode (nie negativ) */
  neu: number
  /** mehr abgerechnet als aufgemessen (Rückbau/Korrektur), nicht automatisch korrigiert */
  zuViel: number
  mehrmenge: number
  einzelpreis: number
  /** Betrag der Periode (neu × Einzelpreis) */
  betrag: number
  /** Gesamtwert der kumulierten Leistung (kumuliert × Einzelpreis) */
  betragKumuliert: number
}

export interface BelegDaten {
  ansicht: AufmassAnsicht
  nr: string
  stichtag: string
  /** Aufmaß nur mit Gesamtfläche (ohne Positionen und Preise) */
  nurGesamtflaeche: boolean
  zeilen: BelegZeile[]
  summePeriodeNetto: number
  summeKumuliertNetto: number
  hinweise: string[]
}

const runde2 = (n: number) => Math.round(n * 100) / 100

/**
 * Die bis dahin abgerechnete Menge ist der Stand VOR diesem Zwischenaufmaß: bei einem schon abgerechneten Zwischenaufmaß nur die
 * früheren Abrechnungen (sonst würde ein später abgerechnetes Aufmaß die frühere Periode verfälschen), bei einem offenen alle.
 */
function vorgaenger(z: Zwischenaufmass, liste: Zwischenaufmass[]): Zwischenaufmass[] {
  return liste.filter((x) => x.rechnungId && x.id !== z.id && (!z.rechnungId || x.nr < z.nr))
}

export function baueAufmassBeleg(z: Zwischenaufmass, liste: Zwischenaufmass[], ansicht: AufmassAnsicht): BelegDaten {
  const frueher = vorgaenger(z, liste)
  const nr = zwischenaufmassNr(z)
  let zeilen: BelegZeile[]
  const nurGesamtflaeche = !z.positionen?.length
  if (nurGesamtflaeche) {
    const bisher = frueher.reduce((m, x) => Math.max(m, x.flaecheM2), 0)
    const diff = runde2(z.flaecheM2 - bisher)
    zeilen = [{ pos: 1, bezeichnung: 'Gerüstfläche gesamt', einheit: 'm²', vertrag: null, kumuliert: z.flaecheM2, bisher, neu: Math.max(0, diff), zuViel: Math.max(0, -diff), mehrmenge: 0, einzelpreis: 0, betrag: 0, betragKumuliert: 0 }]
  } else {
    const bisherJe = bisherAbgerechnetJePosition(frueher)
    zeilen = z.positionen!.map((p, i): BelegZeile => {
      const bisher = bisherJe.get(p.key) ?? 0
      const diff = runde2(p.menge - bisher)
      const neu = Math.max(0, diff)
      const vm = p.vertragsmenge ?? 0
      return {
        pos: i + 1, bezeichnung: p.bezeichnung, einheit: p.einheit, vertrag: vm > 0 ? vm : null, kumuliert: p.menge, bisher, neu, zuViel: Math.max(0, -diff),
        mehrmenge: vm > 0 ? Math.max(0, runde2(p.menge - vm)) : 0, einzelpreis: p.einzelpreis, betrag: runde2(neu * p.einzelpreis), betragKumuliert: runde2(p.menge * p.einzelpreis),
      }
    })
  }
  // Einzelaufmaß: nur Positionen mit Menge in dieser Periode
  if (ansicht === 'einzel') zeilen = zeilen.filter((r) => r.neu > 0).map((r, i) => ({ ...r, pos: i + 1 }))
  const hinweise: string[] = []
  for (const r of zeilen) {
    if (r.mehrmenge > 0) hinweise.push(`${r.bezeichnung}: Mehrmenge ${fmt(r.mehrmenge)} ${r.einheit} über der vereinbarten Menge von ${fmt(r.vertrag!)} ${r.einheit}.`)
    if (r.zuViel > 0) hinweise.push(`${r.bezeichnung}: ${fmt(r.zuViel)} ${r.einheit} mehr abgerechnet (${fmt(r.bisher)}) als aufgemessen (${fmt(r.kumuliert)}); Korrektur wird gesondert geprüft.`)
  }
  return {
    ansicht, nr, stichtag: z.stichtag, nurGesamtflaeche, zeilen, hinweise,
    summePeriodeNetto: runde2(zeilen.reduce((s, r) => s + r.betrag, 0)),
    summeKumuliertNetto: runde2(zeilen.reduce((s, r) => s + r.betragKumuliert, 0)),
  }
}

export interface ZwischenaufmassPdfInput {
  kunde: string
  adresse: string
  z: Zwischenaufmass
  liste: Zwischenaufmass[]
  ansicht: AufmassAnsicht
  datum?: Date
  firma?: { name?: string; street?: string; zip?: string; city?: string } | null
}

const datumDe = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE') }

export function zwischenaufmassPdfDateiname(nr: string, ansicht: AufmassAnsicht, stichtag: string): string {
  return `Aufmass-${nr}-${ansicht === 'einzel' ? 'Einzelaufmass' : 'kumuliert'}-${stichtag}.pdf`
}

export function erzeugeZwischenaufmassPdf(input: ZwischenaufmassPdfInput): jsPDF {
  const { z, liste, ansicht } = input
  const b = baueAufmassBeleg(z, liste, ansicht)
  const kumuliert = ansicht === 'kumuliert'
  const doc = new jsPDF({ orientation: kumuliert ? 'landscape' : 'portrait' })
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  const datum = (input.datum ?? new Date()).toLocaleDateString('de-DE')
  const firmenname = String(input.firma?.name || '').trim()

  doc.setFillColor(...NAVY)
  doc.rect(0, 0, w, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(firmenname ? 15 : 18)
  doc.text(firmenname || 'SCAFFOLD OS', 14, 14)
  if (input.firma) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text([input.firma.street, [input.firma.zip, input.firma.city].filter(Boolean).join(' ')].filter(Boolean).join(' · '), 14, 21)
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20)
  doc.text(kumuliert ? 'KUMULIERTES AUFMASS' : 'EINZELAUFMASS', w - 14, 14, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text(`${b.nr} · Stichtag ${datumDe(b.stichtag)} · erstellt ${datum}`, w - 14, 21, { align: 'right' })

  doc.setTextColor(...DUNKEL); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('Auftraggeber / Baustelle', 14, 40)
  doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize([input.kunde, input.adresse].filter(Boolean).join(' · ') || '–', w - 28), 14, 46)
  doc.setFontSize(8.5); doc.setTextColor(...GRAU_TEXT)
  doc.text(kumuliert
    ? 'Gesamtleistung bis zum Stichtag, bereits abgerechnete Mengen und die jetzt abrechenbare Differenz.'
    : 'Nur die Leistung dieser Abrechnungsperiode (Gesamtleistung abzüglich bereits abgerechneter Menge).', 14, 53)

  const preis = (n: number) => (b.nurGesamtflaeche ? '–' : fmt(n))
  const head = kumuliert
    ? [['Pos.', 'Beschreibung', 'Einheit', 'Vertrag', 'Gesamt kumuliert', 'bereits abgerechnet', 'jetzt abrechenbar', 'Einzelpreis (€)', 'Betrag jetzt (€)']]
    : [['Pos.', 'Beschreibung', 'Einheit', 'Menge', 'Einzelpreis (€)', 'Gesamtpreis (€)']]
  const body = b.zeilen.map((r) => kumuliert
    ? [String(r.pos), r.bezeichnung, r.einheit, r.vertrag ? fmt(r.vertrag) : '–', fmt(r.kumuliert), fmt(r.bisher), fmt(r.neu), preis(r.einzelpreis), preis(r.betrag)]
    : [String(r.pos), r.bezeichnung, r.einheit, fmt(r.neu), preis(r.einzelpreis), preis(r.betrag)])
  const summenZeile = kumuliert
    ? ['', 'Summe netto', '', '', '', '', '', '', b.nurGesamtflaeche ? '–' : fmt(b.summePeriodeNetto)]
    : ['', 'Summe netto', '', '', '', b.nurGesamtflaeche ? '–' : fmt(b.summePeriodeNetto)]
  if (!b.zeilen.length) body.push(['', 'Keine neue Menge in dieser Periode.', ...Array(head[0].length - 2).fill('')])
  const rechts = kumuliert ? [3, 4, 5, 6, 7, 8] : [3, 4, 5]
  autoTable(doc, {
    startY: 58,
    head,
    body: [...body, summenZeile],
    theme: 'plain',
    margin: { left: 14, right: 14, bottom: 20 },
    styles: { fontSize: kumuliert ? 9 : 10, cellPadding: 2.8, textColor: DUNKEL },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, ...Object.fromEntries(rechts.map((i) => [i, { halign: 'right' as const }])) },
    didParseCell: (d) => {
      if (d.section === 'head' && rechts.includes(d.column.index)) d.cell.styles.halign = 'right'
      if (d.section === 'body' && d.row.index === body.length) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [219, 234, 254] }
    },
  })
  let y = ((doc as any).lastAutoTable?.finalY ?? 58) + 7

  doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...GRAU_TEXT)
  const notizen = [
    ...b.hinweise,
    ...(b.nurGesamtflaeche ? ['Dieses Zwischenaufmaß wurde nur mit der Gesamtfläche erfasst (ohne Positionen und Preise).'] : []),
    ...(z.notiz ? [`Notiz: ${z.notiz}`] : []),
    'Alle Beträge netto, zuzüglich gesetzlicher Umsatzsteuer. Maßgeblich für die Abrechnung sind die vertraglichen Vereinbarungen.',
  ]
  const zeilenText = doc.splitTextToSize(notizen.join('\n'), w - 28) as string[]
  if (y + zeilenText.length * 4 > h - 70) { doc.addPage(); y = 24 }
  doc.text(zeilenText, 14, y)
  y += zeilenText.length * 4 + 8

  const boxH = 34, boxB = (w - 28 - 8) / 2
  if (y + boxH > h - 18) { doc.addPage(); y = 24 }
  const feld = (x: number, titel: string) => {
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3); doc.roundedRect(x, y, boxB, boxH, 2, 2, 'S')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...GRAU_TEXT); doc.text(titel.toUpperCase(), x + 4, y + 6)
    doc.setDrawColor(...DUNKEL); doc.setLineWidth(0.4); doc.line(x + 4, y + boxH - 9, x + boxB - 4, y + boxH - 9)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text('Ort, Datum, Unterschrift', x + 4, y + boxH - 4.5)
  }
  feld(14, 'Auftragnehmer'); feld(14 + boxB + 8, 'Auftraggeber')
  seitenFuss(doc, input.firma)
  return doc
}
