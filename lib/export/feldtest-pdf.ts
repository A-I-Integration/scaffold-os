// ============================================================
// SCAFFOLD OS – Feldtest-Protokoll als lesbares PDF (zum JSON-Protokoll, gleiche Daten)
// Echtes PDF (jsPDF). Standardschrift: Sonderzeichen über pdfText ersetzen.
// ============================================================

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { pdfText } from './lastannahmen-pdf'
import type { Ampel, FeldtestProtokoll } from '@/lib/cad/feldtest'

const ORANGE: [number, number, number] = [232, 89, 12]
const DUNKEL: [number, number, number] = [29, 29, 31]
const GRAU: [number, number, number] = [110, 110, 115]
const RAND = 14

export const AMPEL_TEXT: Record<Ampel, string> = { gruen: 'GRUEN', gelb: 'GELB', rot: 'ROT', fehlt: 'FEHLT' }
const AMPEL_FARBE: Record<Ampel, [number, number, number]> = { gruen: [34, 139, 76], gelb: [217, 119, 6], rot: [200, 40, 40], fehlt: [110, 110, 115] }

const zahl = (v: number | null, stellen = 2) => (v === null ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen }))
const prozent = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : ''}${v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`)

export function erzeugeFeldtestPdf(p: FeldtestProtokoll): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `Feldtest-Protokoll – ${p.datei.name}` })
  const B = doc.internal.pageSize.getWidth()
  const innen = B - 2 * RAND
  let y = RAND
  const tabEnde = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const ueberschrift = (t: string) => {
    if (y + 14 > 285) { doc.addPage(); y = RAND }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...DUNKEL)
    doc.text(pdfText(t), RAND, y)
    doc.setDrawColor(...ORANGE); doc.setLineWidth(0.5); doc.line(RAND, y + 1.5, B - RAND, y + 1.5)
    y += 5
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...ORANGE)
  doc.text('Feldtest-Protokoll: Ist gegen Soll', RAND, y + 4); y += 9
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAU)
  const zeit = new Date(p.erstelltAm).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'medium' })
  doc.text(pdfText(`Erstellt ${zeit} mit ${p.software.name} ${p.software.version} (Stand ${p.software.stand})`), RAND, y); y += 6

  // Gesamtergebnis
  const g = p.ergebnis
  const farbe = AMPEL_FARBE[g.gesamt]
  doc.setFillColor(...farbe); doc.rect(RAND, y, 1.6, 9, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...farbe)
  doc.text(`Gesamt: ${AMPEL_TEXT[g.gesamt]}`, RAND + 4, y + 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DUNKEL)
  doc.text(pdfText(`${g.anzahl.gruen} gruen, ${g.anzahl.gelb} gelb, ${g.anzahl.rot} rot, ${g.anzahl.fehlt} fehlt (Ist nicht erkannt). Schlechtester Wert bestimmt das Gesamtbild.`), RAND + 4, y + 8)
  y += 13

  ueberschrift('1. Datei und Messung')
  autoTable(doc, {
    startY: y, margin: { left: RAND, right: RAND }, theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1.1, textColor: DUNKEL },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42, textColor: [66, 66, 69] } },
    body: [
      ['Dateiname', pdfText(p.datei.name)],
      ['Größe', `${p.datei.groesseByte.toLocaleString('de-DE')} Byte`],
      ['SHA-256', p.datei.sha256],
      ['Eingangstyp', p.eingangstyp.toUpperCase()],
      ['Quelle der Sollwerte', pdfText(p.sollQuelleName)],
      ...(p.analyse.punkteOderDreiecke !== null ? [['Punkte / Dreiecke', p.analyse.punkteOderDreiecke.toLocaleString('de-DE')]] : []),
      ['Analysedauer', `${p.analyse.dauerMs.toLocaleString('de-DE')} ms`],
      ['Erkennung', p.analyse.erkannt ? 'hat Maße geliefert' : 'hat NICHTS geliefert'],
      ...Object.entries(p.einstellungen).map(([k, v]) => [`Einstellung ${k}`, String(v ?? '–')]),
      ...(p.notiz ? [['Notiz', pdfText(p.notiz)]] : []),
    ],
  })
  y = tabEnde() + 4

  ueberschrift('2. Erkannte Teile (Ist)')
  if (p.erkannteTeile.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRAU); doc.text('Keine Teile erkannt.', RAND, y + 1); y += 6
  } else {
    autoTable(doc, {
      startY: y, margin: { left: RAND, right: RAND }, styles: { fontSize: 8.5, cellPadding: 1.2, textColor: DUNKEL },
      head: [['Nr.', 'Bezeichnung', 'Länge (m)', 'Tiefe (m)', 'Höhe (m)']], headStyles: { fillColor: [245, 245, 247], textColor: DUNKEL },
      body: p.erkannteTeile.map((t) => [String(t.nr), pdfText(t.bezeichnung), zahl(t.laengeM), zahl(t.tiefeM), zahl(t.hoeheM)]),
    })
    y = tabEnde() + 4
  }

  ueberschrift('3. Soll und Ist je Wert')
  if (p.werte.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRAU); doc.text('Keine Sollwerte eingetragen.', RAND, y + 1); y += 6
  } else {
    autoTable(doc, {
      startY: y, margin: { left: RAND, right: RAND }, styles: { fontSize: 8.5, cellPadding: 1.3, textColor: DUNKEL },
      head: [['Wert', 'Soll', 'Ist', 'Abweichung', 'Ampel']], headStyles: { fillColor: [245, 245, 247], textColor: DUNKEL },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { fontStyle: 'bold', cellWidth: 22 } },
      body: p.werte.map((w) => [pdfText(w.bezeichnung), w.art === 'anzahl' ? String(w.soll) : `${zahl(w.soll)} m`, w.ist === null ? '–' : w.art === 'anzahl' ? String(w.ist) : `${zahl(w.ist)} m`, prozent(w.abweichungProzent), AMPEL_TEXT[w.ampel]]),
      didParseCell: (d) => { if (d.section === 'body' && d.column.index === 4) d.cell.styles.textColor = AMPEL_FARBE[p.werte[d.row.index].ampel] },
    })
    y = tabEnde() + 3
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAU)
  const legende = doc.splitTextToSize(pdfText(`Ampel für Maße: Abweichung vom Soll bis ${p.ampelGrenzen.gruenBisProzent} % grün, bis ${p.ampelGrenzen.gelbBisProzent} % gelb, darüber rot. Anzahl Ecken: gleich = grün, sonst rot. "fehlt": die Erkennung hat den Wert nicht geliefert.`), innen)
  doc.text(legende, RAND, y); y += legende.length * 3.6 + 4

  if (p.hinweise.length > 0) {
    ueberschrift('4. Hinweise der Erkennung')
    autoTable(doc, { startY: y, margin: { left: RAND, right: RAND }, theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1, textColor: DUNKEL }, body: p.hinweise.map((t) => ['•', pdfText(t)]), columnStyles: { 0: { cellWidth: 5 } } })
    y = tabEnde() + 4
  }

  const seiten = doc.getNumberOfPages()
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAU)
    doc.text(pdfText(`Messprotokoll der Erkennung, kein statischer Nachweis. ${p.datei.name} | SHA-256 ${p.datei.sha256.slice(0, 16)}...`), RAND, 291)
    doc.text(`Seite ${i} von ${seiten}`, B - RAND, 291, { align: 'right' })
  }
  return new Uint8Array(doc.output('arraybuffer'))
}
