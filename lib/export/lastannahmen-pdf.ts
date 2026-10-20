// ============================================================
// SCAFFOLD OS – Lastannahmen-Blatt und Prüfprotokoll als PDF
//
// Seite 1 (und ggf. 2): Lastannahmen und Eingangsdaten für die Statik.
// Danach: Prüfprotokoll der Regelprüfung nach DIN EN 12811-1 (Ampel, Tabelle)
// und Unterschriftsfelder. Echtes PDF (jsPDF), kein Screenshot.
// ============================================================

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { CADModel } from '@/lib/calculations/cad-engine'
import type { StatikDaten } from '@/lib/statik-daten'
import { pruefeGeruest, anzahlText, type Pruefprotokoll, type PruefStatus } from '@/lib/geruest/regelpruefung'
import { baueLastannahmenDaten, NICHT_ANGEGEBEN, type LastannahmenOptionen } from './lastannahmen'

const ORANGE: [number, number, number] = [232, 89, 12]
const DUNKEL: [number, number, number] = [29, 29, 31]
const GRAU: [number, number, number] = [110, 110, 115]
const RAND = 14

const STATUS_TEXT: Record<PruefStatus, string> = { ok: 'OK', warnung: 'WARNUNG', fehler: 'FEHLER', verletzt: 'VERLETZT' }
const STATUS_FARBE: Record<PruefStatus, [number, number, number]> = { ok: [34, 139, 76], warnung: [217, 119, 6], fehler: [200, 40, 40], verletzt: [200, 40, 40] }
const AMPEL_TEXT: Record<PruefStatus, string> = {
  ok: 'Ampel grün: keine Auffälligkeit bei den automatisch prüfbaren Regeln.',
  warnung: 'Ampel gelb: mindestens eine Warnung bei den automatisch prüfbaren Regeln.',
  fehler: 'Ampel rot: mindestens ein Fehler bei den automatisch prüfbaren Regeln.',
  verletzt: 'Ampel rot: mindestens ein Richtwert aus den Zulassungs-Eckdaten des Katalogs verletzt (keine Sperre, die Entscheidung liegt beim Prüfer).',
}

/** Standardschrift (Helvetica/WinAnsi) kennt einige Zeichen nicht: ersetzen statt Kauderwelsch zu drucken. */
export function pdfText(s: string): string {
  return s
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/→/g, '->').replace(/≈/g, 'ca.').replace(/✓|✅/g, 'OK')
    .replace(/⛔|⚠️|⚠|ℹ️|ℹ/g, '').replace(/[←-⯿\u{1F000}-\u{1FFFF}]/gu, '')
}

export function erzeugeLastannahmenPdf(model: CADModel, statik: StatikDaten, opt: LastannahmenOptionen, protokoll?: Pruefprotokoll): Uint8Array {
  const daten = baueLastannahmenDaten(model, statik, opt)
  const pr = protokoll ?? pruefeGeruest(model, statik)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `Lastannahmen und Prüfprotokoll – ${opt.projektName}` })
  const B = doc.internal.pageSize.getWidth()
  const innen = B - 2 * RAND
  let y = RAND

  const tabEnde = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const neueSeiteWennNoetig = (platz: number) => { if (y + platz > 285) { doc.addPage(); y = RAND } }
  const ueberschrift = (t: string) => {
    neueSeiteWennNoetig(14)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...DUNKEL)
    doc.text(pdfText(t), RAND, y)
    doc.setDrawColor(...ORANGE); doc.setLineWidth(0.5); doc.line(RAND, y + 1.5, B - RAND, y + 1.5)
    y += 5
  }
  const box = (text: string, farbe: [number, number, number], fett = false) => {
    doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(8.5)
    const zeilen = doc.splitTextToSize(pdfText(text), innen - 6)
    const h = zeilen.length * 4 + 4
    neueSeiteWennNoetig(h + 2)
    doc.setFillColor(farbe[0], farbe[1], farbe[2], 0.1)
    doc.setFillColor(Math.round(255 - (255 - farbe[0]) * 0.12), Math.round(255 - (255 - farbe[1]) * 0.12), Math.round(255 - (255 - farbe[2]) * 0.12))
    doc.rect(RAND, y, innen, h, 'F')
    doc.setFillColor(...farbe); doc.rect(RAND, y, 1.2, h, 'F')
    doc.setTextColor(...DUNKEL); doc.text(zeilen, RAND + 4, y + 4.5)
    y += h + 3
  }

  // --- Seite 1: Lastannahmen ---
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...ORANGE)
  doc.text(pdfText(daten.titel), RAND, y + 4); y += 9
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAU)
  doc.text(pdfText(daten.kopf), RAND, y); y += 5
  box(daten.wichtig, [245, 158, 11])
  if (daten.fehlend.length > 0) box(`Noch nicht angegeben (${daten.fehlend.length}): ${daten.fehlend.join(', ')}`, [200, 40, 40], true)

  for (const s of daten.sektionen) {
    ueberschrift(s.titel)
    autoTable(doc, {
      startY: y, margin: { left: RAND, right: RAND }, theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1.2, textColor: DUNKEL, font: 'helvetica' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 62, textColor: [66, 66, 69] } },
      body: s.zeilen.map((z) => [pdfText(z.label), z.wert === null ? NICHT_ANGEGEBEN : pdfText(z.wert)]),
      didParseCell: (d) => { if (d.section === 'body' && d.column.index === 1 && d.cell.raw === NICHT_ANGEGEBEN) { d.cell.styles.textColor = [180, 35, 24]; d.cell.styles.fontStyle = 'bold' } },
      didDrawCell: (d) => { if (d.section === 'body') { doc.setDrawColor(229, 229, 234); doc.setLineWidth(0.15); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height) } },
    })
    y = tabEnde() + 1
    if (s.tabelle) {
      autoTable(doc, { startY: y, margin: { left: RAND, right: RAND }, head: [s.tabelle.kopf], body: s.tabelle.zeilen, styles: { fontSize: 8.5, cellPadding: 1.2 }, headStyles: { fillColor: [245, 245, 247], textColor: DUNKEL } })
      y = tabEnde() + 2
    }
    y += 2
  }

  if (daten.planungshinweise.length > 0) {
    ueberschrift(`${daten.sektionen.length + 1}. Hinweise aus der Planung`)
    autoTable(doc, { startY: y, margin: { left: RAND, right: RAND }, theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1 }, body: daten.planungshinweise.map((t) => ['•', pdfText(t)]), columnStyles: { 0: { cellWidth: 5 } } })
    y = tabEnde() + 4
  }
  if (daten.pruefpunkte.length > 0) {
    ueberschrift(`${daten.sektionen.length + (daten.planungshinweise.length > 0 ? 2 : 1)}. Prüfpunkte für den Statiker (Hinweise, keine Nachweise)`)
    autoTable(doc, { startY: y, margin: { left: RAND, right: RAND }, theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1 }, body: daten.pruefpunkte.map((p) => [pdfText(p.thema), pdfText(p.text)]), columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' } } })
    y = tabEnde() + 4
  }

  // --- Prüfprotokoll ---
  doc.addPage(); y = RAND
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...ORANGE)
  doc.text('Prüfprotokoll nach DIN EN 12811-1', RAND, y + 4); y += 9
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAU)
  doc.text(pdfText(daten.kopf), RAND, y); y += 5
  box(pr.hinweis, [245, 158, 11])
  box(`${AMPEL_TEXT[pr.ampel]}  Ergebnisse gesamt: ${anzahlText(pr.anzahl)}.`, STATUS_FARBE[pr.ampel], true)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAU)
  const legende = doc.splitTextToSize('Art "geprüft": eindeutig aus dem Modell prüfbar, zählt für die Ampel. Art "Hinweis": nicht eindeutig regelbar oder kein Grenzwert hinterlegt; der gemessene Wert steht im Text und ist gegen die Zulassung zu prüfen. Es gibt keine Sperre.', innen)
  doc.text(legende, RAND, y); y += legende.length * 3.6 + 2

  autoTable(doc, {
    startY: y, margin: { left: RAND, right: RAND }, styles: { fontSize: 7.8, cellPadding: 1.4, valign: 'top', textColor: DUNKEL },
    head: [['Status', 'Art', 'Regel', 'Abschnitt', 'Begründung', 'Quelle']], headStyles: { fillColor: [245, 245, 247], textColor: DUNKEL },
    columnStyles: { 0: { cellWidth: 21, fontStyle: 'bold' }, 1: { cellWidth: 14 }, 2: { cellWidth: 28 }, 3: { cellWidth: 24 }, 4: { cellWidth: 'auto' }, 5: { cellWidth: 26, textColor: GRAU } },
    body: pr.ergebnisse.map((r) => [STATUS_TEXT[r.status], r.art === 'geprueft' ? 'geprüft' : 'Hinweis', pdfText(r.regel), pdfText(r.abschnitt ?? 'gesamt'), pdfText(r.begruendung), pdfText(r.quelle)]),
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 0) {
        const status = (['ok', 'warnung', 'fehler', 'verletzt'] as PruefStatus[]).find((s) => STATUS_TEXT[s] === d.cell.raw)
        if (status) d.cell.styles.textColor = STATUS_FARBE[status]
      }
    },
  })
  y = tabEnde() + 10

  neueSeiteWennNoetig(30)
  const sp = (innen - 12) / 3
  ;['Ort, Datum', 'Unterschrift Gerüstbauer / Planer', 'Unterschrift Statiker'].forEach((t, i) => {
    const x = RAND + i * (sp + 6)
    doc.setDrawColor(...DUNKEL); doc.setLineWidth(0.25); doc.line(x, y + 14, x + sp, y + 14)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAU); doc.text(t, x, y + 18)
  })
  y += 26
  doc.setFontSize(7.5); doc.setTextColor(...GRAU)
  doc.text(doc.splitTextToSize(pdfText(daten.fusszeile), innen), RAND, y)

  // Seitenzahlen
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAU)
    doc.text(`Seite ${i} von ${n}`, B - RAND, 291, { align: 'right' })
  }
  return new Uint8Array(doc.output('arraybuffer'))
}
