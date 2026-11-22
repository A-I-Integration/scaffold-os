// ============================================================
// SCAFFOLD OS – Aufbauplan (A4 quer, eine Seite je Aufbauschritt)
//
// Je Schritt: 3D-Bild des Gerüsts bis zu dieser Lage (Screenshot aus dem CAD, falls vorhanden) und die Angaben der Lage aus dem
// Modell. Nichts wird geschätzt oder ergänzt. Schematisch, kein Standsicherheitsnachweis.
// ============================================================

import { jsPDF } from 'jspdf'
import { pdfText } from './lastannahmen-pdf'
import type { AufbauSchritt } from '@/lib/geruest/aufbau-schritte'

const NAVY: [number, number, number] = [51, 65, 85]
const ORANGE: [number, number, number] = [232, 89, 12]
const DUNKEL: [number, number, number] = [29, 29, 31]
const GRAU: [number, number, number] = [110, 110, 115]

export interface AufbauKopf { projektName: string; firma?: string; datum?: string }

export function erzeugeAufbauplanPdf(schritte: AufbauSchritt[], bilder: (string | undefined)[], kopf: AufbauKopf): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const B = 297, H = 210, R = 12
  schritte.forEach((s, i) => {
    if (i > 0) doc.addPage()
    doc.setFillColor(...NAVY); doc.rect(0, 0, B, 16, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text(pdfText(`Aufbau Schritt ${s.nr} von ${s.von}`), R, 10.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.text(pdfText(kopf.projektName), B - R, 10.5, { align: 'right' })
    doc.setFillColor(...ORANGE); doc.rect(0, 16, B, 1.2, 'F')
    const bw = 190, bh = H - 17.2 - 20 - 8
    doc.setDrawColor(210, 212, 216); doc.rect(R, 24, bw, bh)
    const bild = bilder[i]
    if (bild) {
      try { doc.addImage(bild, 'JPEG', R, 24, bw, bh, undefined, 'FAST') } catch { /* Bild fehlt, Seite bleibt lesbar */ }
    } else {
      doc.setTextColor(...GRAU); doc.setFontSize(9); doc.text('Kein 3D-Bild verfügbar', R + 4, 30)
    }
    let y = 28
    const x = R + bw + 8
    doc.setTextColor(...DUNKEL); doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(pdfText(s.titel), x, y); y += 7
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
    for (const h of s.hinweise) {
      const zeilen = doc.splitTextToSize(pdfText('• ' + h), B - R - x) as string[]
      doc.text(zeilen, x, y); y += zeilen.length * 5 + 1.5
    }
    doc.setFontSize(7.5); doc.setTextColor(...GRAU)
    doc.text(pdfText(`Schematisch, kein Standsicherheitsnachweis.${kopf.firma ? '  ' + kopf.firma : ''}${kopf.datum ? '  ' + kopf.datum : ''}`), R, H - 6)
    doc.text(`${s.nr} / ${s.von}`, B - R, H - 6, { align: 'right' })
  })
  return new Uint8Array(doc.output('arraybuffer'))
}
