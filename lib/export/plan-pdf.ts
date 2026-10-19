// ============================================================
// SCAFFOLD OS – Gerüstplan als PDF (Vektorzeichnung)
//
// Eine Seite A4 quer je Zeichnung (Vorderansicht, Grundriss). Linien und
// Text sind echte Vektoren, keine Screenshots. Maßstab: so groß wie möglich,
// die Maßstabszahl steht auf dem Blatt.
// ============================================================

import { jsPDF } from 'jspdf'
import type { Zeichnung, ZLayer } from '@/lib/geruest/plan-zeichnung'

export interface PlanPdfOptionen {
  projektName: string
  firma: string
  datum: string
}

const SEITE = { b: 297, h: 210 }
const RAND = 10
const FARBE: Record<ZLayer, [number, number, number]> = {
  GEBAEUDE: [90, 90, 90], GERUEST: [30, 90, 200], MASSE: [200, 40, 40], TEXTE: [20, 20, 20],
}

export function erzeugePlanPdf(zeichnungen: Zeichnung[], opt: PlanPdfOptionen): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `Gerüstplan – ${opt.projektName}` })

  zeichnungen.forEach((z, i) => {
    if (i > 0) doc.addPage('a4', 'landscape')
    const breite = z.grenzen.maxX - z.grenzen.minX
    const hoehe = z.grenzen.maxY - z.grenzen.minY
    const flaecheB = SEITE.b - 2 * RAND
    const flaecheH = SEITE.h - 2 * RAND - 14 // Platz für Kopf- und Fußzeile
    const massstab = Math.min(flaecheB / breite, flaecheH / hoehe) // mm je m
    const ox = RAND + (flaecheB - breite * massstab) / 2
    const oy = RAND + 8 + (flaecheH - hoehe * massstab) / 2
    const X = (x: number) => ox + (x - z.grenzen.minX) * massstab
    const Y = (y: number) => oy + (z.grenzen.maxY - y) * massstab

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9); doc.setTextColor(60)
    doc.text(`${opt.projektName} · ${opt.firma}`, RAND, RAND + 3)
    doc.text(`${z.titel} · Maßstab etwa 1:${Math.round(1000 / massstab)} (auf A4)`, SEITE.b - RAND, RAND + 3, { align: 'right' })

    doc.setLineWidth(0.18)
    for (const l of z.linien) {
      const [r, g, b] = FARBE[l.layer]
      doc.setDrawColor(r, g, b)
      if (l.gestrichelt) doc.setLineDashPattern([1.5, 1], 0); else doc.setLineDashPattern([], 0)
      doc.line(X(l.x1), Y(l.y1), X(l.x2), Y(l.y2))
    }
    doc.setLineDashPattern([], 0)

    for (const t of z.texte) {
      const [r, g, b] = FARBE[t.layer]
      doc.setTextColor(r, g, b)
      doc.setFontSize(Math.max(4, (t.hoehe * massstab) / 0.3528 * 0.8))
      if (t.drehungGrad === 90) {
        // jsPDF verschiebt gedrehten Text bei center/right entlang der ungedrehten Achse:
        // darum die Textlänge selbst messen und den Startpunkt auf der senkrechten Achse setzen.
        const w = doc.getTextWidth(t.text)
        const versatz = t.ausrichtung === 'mitte' ? w / 2 : t.ausrichtung === 'rechts' ? w : 0
        doc.text(t.text, X(t.x), Y(t.y) + versatz, { angle: 90 })
      } else {
        const align = t.ausrichtung === 'mitte' ? 'center' : t.ausrichtung === 'rechts' ? 'right' : 'left'
        doc.text(t.text, X(t.x), Y(t.y), { align, angle: t.drehungGrad ?? 0 })
      }
    }

    doc.setFontSize(7); doc.setTextColor(110)
    doc.text(`Stand ${opt.datum} · Schematische Darstellung aus SCAFFOLD OS · Kein Standsicherheitsnachweis, keine Abnahme`, RAND, SEITE.h - RAND + 3)
    doc.text(`Seite ${i + 1} von ${zeichnungen.length}`, SEITE.b - RAND, SEITE.h - RAND + 3, { align: 'right' })
  })

  return new Uint8Array(doc.output('arraybuffer'))
}
