// ============================================================
// SCAFFOLD OS – Präsentationsbogen (ein Blatt A3 quer)
//
// Ein Blatt für Kunde und Bauherr: 3D-Bild (Screenshot aus dem CAD, falls übergeben), vier Ansichten, Schnitt, Grundriss und eine
// Datentafel. ALLE Zahlen stammen aus dem Modell (Gebäudedaten, Gerüstdaten); nichts wird geschätzt oder ergänzt. Zeichnungen sind
// Vektoren aus denselben Projektionen wie im CAD und im Gerüstplan. Kein statischer Nachweis.
// ============================================================

import { jsPDF } from 'jspdf'
import { generateGrundriss, generateAnsicht, generateSchnitt, type CADModel, type Projection2D } from '@/lib/calculations/cad-engine'
import { pdfText } from './lastannahmen-pdf'
import { zeichneProjektion } from './geruestplan-pdf'

const NAVY: [number, number, number] = [51, 65, 85]
const ORANGE: [number, number, number] = [232, 89, 12]
const DUNKEL: [number, number, number] = [29, 29, 31]
const GRAU: [number, number, number] = [110, 110, 115]
const HELL: [number, number, number] = [245, 246, 248]

export interface BogenKopf { projektName: string; objektadresse?: string; firma?: string; datum?: string }
export interface DatenZeile { label: string; wert: string }
export interface DatenTafel { titel: string; zeilen: DatenZeile[] }

const m2 = (v: number): string => `${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`
const DACH: Record<string, string> = { flachdach: 'Flachdach', satteldach: 'Satteldach', walmdach: 'Walmdach', pultdach: 'Pultdach', mansardendach: 'Mansardendach', keins: 'Kein Dach' }

/** Datentafeln des Bogens: nur Werte, die im Modell stehen. Fehlendes (z. B. Traufe 0) wird weggelassen, nicht ersetzt. */
export function bogenTafeln(model: CADModel): DatenTafel[] {
  const b = model.building
  const gebaeude: DatenZeile[] = [
    { label: 'Länge', wert: m2(b.lengthM) },
    ...(b.widthM ? [{ label: 'Breite', wert: m2(b.widthM) }] : []),
    { label: 'Gebäudehöhe', wert: m2(b.heightM) },
    ...(b.eavesHeightM > 0 ? [{ label: 'Traufhöhe', wert: m2(b.eavesHeightM) }] : []),
    ...(b.roofForm ? [{ label: 'Dachform', wert: DACH[b.roofForm] ?? String(b.roofForm) }] : []),
    ...(b.umriss && b.umriss.length >= 3 ? [{ label: 'Umriss', wert: `${b.umriss.length} Ecken` }] : []),
  ]
  const sys = model.system
  const felder = [...new Set(model.fields.map((f) => f.lengthM))].sort((a, c) => a - c)
  const treppe = model.components3D.some((c) => c.type === 'stair')
  const geruest: DatenZeile[] = [
    ...(sys ? [{ label: 'Gerüstsystem', wert: `${sys.hersteller} ${sys.systemName}` }] : []),
    ...(felder.length ? [{ label: 'Feldlängen', wert: felder.map((l) => m2(l).replace(' m', '')).join(' / ') + ' m' }] : []),
    { label: 'Lagen', wert: String(model.levelCount) },
    { label: 'Gerüsthöhe', wert: m2(Math.max(0, ...model.levels.map((l) => l.topY))) },
    { label: 'Felder je Lage', wert: String(model.fieldCount) },
    { label: 'Gerüstfläche', wert: `${(model.gebauteFlaecheM2 ?? model.totalAreaM2).toLocaleString('de-DE', { maximumFractionDigits: 1 })} m²` },
    { label: 'Treppe', wert: treppe ? 'vorhanden' : 'keine' },
    { label: 'Anker', wert: String(model.anchors.length) },
  ]
  return [{ titel: 'Gebäudedaten', zeilen: gebaeude }, { titel: 'Gerüstplanung', zeilen: geruest }]
}

function kasten(doc: jsPDF, titel: string, x: number, y: number, w: number, h: number): void {
  doc.setFillColor(...HELL); doc.setDrawColor(210, 214, 220); doc.setLineWidth(0.2); doc.rect(x, y, w, h, 'FD')
  doc.setFillColor(...NAVY); doc.rect(x, y, w, 6.5, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.text(pdfText(titel), x + 3, y + 4.6)
}

/** Bogen als PDF. `bild3d`: Data-URL (PNG/JPEG) des 3D-Bildes; fehlt es, bleibt das Feld mit Hinweis leer. */
export function erzeugePraesentationsbogen(model: CADModel, kopf: BogenKopf, bild3d?: string): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' })
  doc.setProperties({ title: `Präsentationsbogen – ${kopf.projektName}` })
  const B = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const R = 8, kopfH = 16, fussH = 10
  // Kopfband
  doc.setFillColor(...NAVY); doc.rect(0, 0, B, kopfH, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(255, 255, 255); doc.text('SCAFFOLD OS', R, 8)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text('CAD-Gerüstplanung', R, 12.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(pdfText(kopf.projektName), 70, 8)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); if (kopf.objektadresse) doc.text(pdfText(kopf.objektadresse), 70, 12.5)

  const tafelB = 82
  const links = R, linksB = B - 2 * R - tafelB - 4
  const top = kopfH + 4
  const unten = H - fussH
  const heroH = (unten - top) * 0.46
  const reiheH = (unten - top - heroH - 8) / 2
  // 3D-Bild
  kasten(doc, 'Gebäude mit Gerüst (3D)', links, top, linksB, heroH)
  if (bild3d) {
    try {
      const t = bild3d.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG'
      const p = doc.getImageProperties(bild3d)
      const fb = linksB - 2, fh = heroH - 8.5
      const s = Math.min(fb / p.width, fh / p.height)
      doc.addImage(bild3d, t, links + 1 + (fb - p.width * s) / 2, top + 7.5 + (fh - p.height * s) / 2, p.width * s, p.height * s)
    } catch { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAU); doc.text('3D-Bild konnte nicht eingebunden werden.', links + 4, top + 16) }
  } else { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAU); doc.text('Kein 3D-Bild übergeben.', links + 4, top + 16) }

  const zeichnungen = (liste: { titel: string; p: Projection2D }[], y: number, h: number) => {
    const w = (linksB - (liste.length - 1) * 3) / liste.length
    liste.forEach((z, i) => {
      const x = links + i * (w + 3)
      kasten(doc, z.titel, x, y, w, h)
      const n = zeichneProjektion(doc, z.p, x + 2, y + 8, w - 4, h - 12)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAU); doc.text(`1:${n}`, x + w - 2, y + h - 1.5, { align: 'right' })
    })
  }
  const y2 = top + heroH + 4
  zeichnungen([
    { titel: 'Vorderansicht', p: generateAnsicht(model, 'front') }, { titel: 'Hinteransicht', p: generateAnsicht(model, 'back') },
    { titel: 'Linke Ansicht', p: generateAnsicht(model, 'left') }, { titel: 'Rechte Ansicht', p: generateAnsicht(model, 'right') },
  ], y2, reiheH)
  zeichnungen([{ titel: 'Schnitt A-A', p: generateSchnitt(model) }, { titel: 'Grundriss', p: generateGrundriss(model) }], y2 + reiheH + 4, reiheH)

  // Datentafeln rechts
  let ty = top
  const tx = B - R - tafelB
  for (const t of bogenTafeln(model)) {
    const h = 9 + t.zeilen.length * 6.4
    kasten(doc, t.titel, tx, ty, tafelB, h)
    t.zeilen.forEach((z, i) => {
      const yy = ty + 12 + i * 6.4
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRAU); doc.text(pdfText(z.label), tx + 3, yy)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...DUNKEL); doc.text(pdfText(z.wert), tx + tafelB - 3, yy, { align: 'right' })
    })
    ty += h + 4
  }
  // Hinweis
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAU)
  doc.text(doc.splitTextToSize(pdfText('Planungsgrundlage aus dem CAD-Modell. Kein statischer Nachweis, keine Abnahme. Maße und Höhen sind Modellwerte und vor Ausführung vor Ort zu prüfen.'), tafelB), tx, ty + 3)
  // Fuß
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAU)
  doc.text(pdfText([kopf.firma, kopf.datum].filter(Boolean).join('  ·  ')), R, H - 4)
  doc.text('Erstellt mit SCAFFOLD OS', B - R, H - 4, { align: 'right' })
  return new Uint8Array(doc.output('arraybuffer'))
}
