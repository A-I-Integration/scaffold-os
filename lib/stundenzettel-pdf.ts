import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { NAVY, GRAU_TEXT, DUNKEL, seitenFuss } from './aufmassblatt-pdf'
import type { Stundenzettel } from './stundenzettel'

// Stundenzettel als PDF (Hochformat): je Tag Von/Bis, Pause, Netto-Stunden, Baustelle, Fahrzeit, Spesen; Summenzeile und Unterschriftsfelder.
export interface StundenzettelPdfInput {
  mitarbeiter: string
  zettel: Stundenzettel
  projektName: (id: string | null) => string
  firma?: { name?: string; street?: string; zip?: string; city?: string } | null
  datum?: Date
}

const de = (iso: string) => iso.split('-').reverse().join('.')
const std = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
export const monatDe = (monat: string) => new Date(`${monat}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
export const stundenzettelPdfDateiname = (mitarbeiter: string, monat: string) => `Stundenzettel_${mitarbeiter.replace(/[^A-Za-z0-9ÄÖÜäöüß]+/g, '_')}_${monat}.pdf`

export function erzeugeStundenzettelPdf(input: StundenzettelPdfInput): jsPDF {
  const { zettel } = input
  const doc = new jsPDF()
  const w = doc.internal.pageSize.getWidth()
  const firmenname = String(input.firma?.name || '').trim()
  doc.setFillColor(...NAVY); doc.rect(0, 0, w, 30, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(firmenname ? 15 : 18)
  doc.text(firmenname || 'SCAFFOLD OS', 14, 14)
  doc.setFontSize(20); doc.text('STUNDENZETTEL', w - 14, 14, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text(`${monatDe(zettel.monat)} · erstellt ${(input.datum ?? new Date()).toLocaleDateString('de-DE')}`, w - 14, 21, { align: 'right' })
  doc.setTextColor(...DUNKEL); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text(`Mitarbeiter: ${input.mitarbeiter}`, 14, 40)

  const body = zettel.zeilen.map((z) => [
    de(z.datum), z.von || '–', z.bis || (z.offen ? 'läuft' : '–'), z.pauseMin ? `${z.pauseMin} min` : '–', std(z.stunden),
    input.projektName(z.projektId), z.fahrzeitMin ? hm(z.fahrzeitMin) : '–', z.spesen ? std(z.spesen) : '–',
  ])
  if (!body.length) body.push(['', 'Keine Buchungen in diesem Monat.', '', '', '', '', '', ''])
  autoTable(doc, {
    startY: 46,
    head: [['Datum', 'Von', 'Bis', 'Pause', 'Stunden (netto)', 'Baustelle', 'Fahrzeit', 'Spesen (€)']],
    body,
    foot: [[`${zettel.summe.tage} Tage`, '', '', `${zettel.summe.pauseMin} min`, std(zettel.summe.stunden), '', hm(zettel.summe.fahrzeitMin), std(zettel.summe.spesen)]],
    styles: { fontSize: 8.5, cellPadding: 1.8, textColor: DUNKEL },
    headStyles: { fillColor: NAVY, textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: DUNKEL, fontStyle: 'bold' },
    columnStyles: { 4: { halign: 'right' }, 7: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })
  const y = ((doc as any).lastAutoTable?.finalY ?? 60) + 22
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRAU_TEXT)
  doc.setDrawColor(148, 163, 184)
  doc.line(14, y, 84, y); doc.line(w - 84, y, w - 14, y)
  doc.text('Datum, Unterschrift Mitarbeiter', 14, y + 5); doc.text('Datum, Unterschrift Arbeitgeber / Vorarbeiter', w - 84, y + 5)
  seitenFuss(doc, input.firma ?? undefined)
  return doc
}
