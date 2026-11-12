// ============================================================
// SCAFFOLD OS – Gerüstplan-Mappe als PDF (Vektor, kein Screenshot)
//
// Je eine A4-Querformat-Seite für: Grundriss, Ansicht vorne/hinten/links/rechts, Schnitt A-A.
// Die Zeichnungen kommen aus denselben Projektionen wie die Anzeige im CAD (generateGrundriss/Ansicht/Schnitt).
// Der Maßstab ist der nächste Normmaßstab, in den die Zeichnung auf die Seite passt, und steht auf der Seite.
// ============================================================

import { jsPDF } from 'jspdf'
import { generateGrundriss, generateAnsicht, generateSchnitt, type CADModel, type Projection2D } from '@/lib/calculations/cad-engine'
import { pdfText } from './lastannahmen-pdf'

const ORANGE: [number, number, number] = [232, 89, 12]
const DUNKEL: [number, number, number] = [29, 29, 31]
const GRAU: [number, number, number] = [110, 110, 115]
const RAND = 12
const MASSSTAEBE = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000]

export interface GeruestplanKopf {
  projektName: string
  objektadresse?: string
  firma?: string
  /** Datum als Text (z. B. 12.11.2026); fehlt es, wird kein Datum gedruckt */
  datum?: string
}

function farbe(c: string | undefined): [number, number, number] | null {
  if (!c || c === 'none' || c.startsWith('url(')) return null
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim())
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)]
  const k = /^#([0-9a-f]{3})$/i.exec(c.trim())
  if (k) return [parseInt(k[1][0] + k[1][0], 16), parseInt(k[1][1] + k[1][1], 16), parseInt(k[1][2] + k[1][2], 16)]
  return null
}

/** Pfad mit M/L/Z (absolut, Zahlen mit Komma oder Leerzeichen) in Punktlisten zerlegen. Andere Befehle werden ausgelassen. */
export function pfadPunkte(d: string): { punkte: [number, number][]; geschlossen: boolean }[] {
  const ergebnis: { punkte: [number, number][]; geschlossen: boolean }[] = []
  let aktuell: [number, number][] = []
  const teile = d.replace(/([MLZmlz])/g, ' $1 ').replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  let i = 0
  let befehl = ''
  const abschliessen = (zu: boolean) => { if (aktuell.length > 1) ergebnis.push({ punkte: aktuell, geschlossen: zu }); aktuell = [] }
  while (i < teile.length) {
    const t = teile[i]
    if (/^[MLZmlz]$/.test(t)) {
      befehl = t.toUpperCase(); i++
      if (befehl === 'Z') { abschliessen(true); befehl = '' }
      if (befehl === 'M') abschliessen(false)
      continue
    }
    if (befehl === 'M' || befehl === 'L') {
      const x = parseFloat(t), y = parseFloat(teile[i + 1])
      if (Number.isFinite(x) && Number.isFinite(y)) aktuell.push([x, y])
      i += 2
    } else i++
  }
  abschliessen(false)
  return ergebnis
}

/** Kleinster Normmaßstab (1:n), bei dem eine Zeichnung von b × h Metern in eine Fläche von fb × fh mm passt. */
export function waehleMassstab(breiteM: number, hoeheM: number, flaecheBreiteMm: number, flaecheHoeheMm: number): number {
  for (const n of MASSSTAEBE) if (breiteM * 1000 / n <= flaecheBreiteMm && hoeheM * 1000 / n <= flaecheHoeheMm) return n
  return MASSSTAEBE[MASSSTAEBE.length - 1]
}

/** Umfang der Zeichnung ohne Teileliste (in m); Texte zählen mit einer geschätzten Breite. */
export function zeichnungsGrenzen(p: Projection2D): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  const punkt = (x: number, y: number) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  for (const el of p.elements) {
    if (el.id.startsWith('teile-')) continue
    if (el.type === 'rect') { punkt(el.x, el.y); punkt(el.x + (el.width ?? 0), el.y + (el.height ?? 0)) }
    else if (el.type === 'line') { punkt(el.x, el.y); punkt(el.x2 ?? el.x, el.y2 ?? el.y) }
    else if (el.type === 'circle') { punkt(el.x - (el.r ?? 0), el.y - (el.r ?? 0)); punkt(el.x + (el.r ?? 0), el.y + (el.r ?? 0)) }
    else if (el.type === 'path' && el.d) pfadPunkte(el.d).forEach((f) => f.punkte.forEach(([x, y]) => punkt(x, y)))
    else if (el.type === 'text') {
      const w = (el.text?.length ?? 0) * 0.22 // grobe Textbreite in m bei 1:100, reicht für die Seitenaufteilung
      punkt(el.anker === 'start' ? el.x : el.anker === 'end' ? el.x - w : el.x - w / 2, el.y - 0.3)
      punkt(el.anker === 'start' ? el.x + w : el.anker === 'end' ? el.x : el.x + w / 2, el.y + 0.2)
    }
  }
  for (const d of p.dimensions) { punkt(d.fromX + (d.offsetX ?? 0) - 0.5, d.fromY + (d.offsetY ?? 0)); punkt(d.toX + (d.offsetX ?? 0) + 0.5, d.toY + (d.offsetY ?? 0)) }
  if (!Number.isFinite(minX)) return { minX: p.viewBox.minX, maxX: p.viewBox.minX + p.viewBox.width, minY: p.viewBox.minY, maxY: p.viewBox.minY + p.viewBox.height }
  return { minX: minX - 0.5, maxX: maxX + 0.5, minY: minY - 0.5, maxY: maxY + 0.5 }
}

function zeichneProjektion(doc: jsPDF, p: Projection2D, x0: number, y0: number, bw: number, bh: number): number {
  const g = zeichnungsGrenzen(p)
  const vb = { minX: g.minX, minY: g.minY, width: g.maxX - g.minX, height: g.maxY - g.minY }
  const n = waehleMassstab(vb.width, vb.height, bw, bh)
  const mm = 1000 / n // mm je Meter auf dem Papier
  const ox = x0 + (bw - vb.width * mm) / 2 - vb.minX * mm
  const oy = y0 + (bh - vb.height * mm) / 2 - vb.minY * mm
  const px = (x: number) => ox + x * mm
  const py = (y: number) => oy + y * mm
  doc.setLineJoin('miter')

  for (const el of p.elements) {
    if (el.id.startsWith('teile-')) continue
    const strich = farbe(el.stroke), fuell = farbe(el.fill)
    const breite = Math.max(0.1, (el.strokeWidth ?? 1) * 0.18)
    if (el.type === 'rect') {
      const f = fuell && el.fill !== 'none'
      if (f) doc.setFillColor(...fuell!)
      if (strich) { doc.setDrawColor(...strich); doc.setLineWidth(breite) }
      const stil = f && strich ? 'FD' : f ? 'F' : strich ? 'S' : null
      if (stil) doc.rect(px(el.x), py(el.y), (el.width ?? 0) * mm, (el.height ?? 0) * mm, stil)
    } else if (el.type === 'line') {
      doc.setDrawColor(...(strich ?? [0, 0, 0])); doc.setLineWidth(breite)
      doc.line(px(el.x), py(el.y), px(el.x2 ?? el.x), py(el.y2 ?? el.y))
    } else if (el.type === 'circle') {
      if (fuell) doc.setFillColor(...fuell)
      if (strich) { doc.setDrawColor(...strich); doc.setLineWidth(breite) }
      const stil = fuell && strich ? 'FD' : fuell ? 'F' : 'S'
      doc.circle(px(el.x), py(el.y), (el.r ?? 0) * mm, stil)
    } else if (el.type === 'path' && el.d) {
      for (const f of pfadPunkte(el.d)) {
        const pts = f.punkte.map(([x, y]) => [px(x), py(y)] as [number, number])
        const fl = f.geschlossen && fuell
        if (fl) doc.setFillColor(...fuell!)
        if (strich) { doc.setDrawColor(...strich); doc.setLineWidth(breite) }
        const rel = pts.slice(1).map((q, i) => [q[0] - pts[i][0], q[1] - pts[i][1]])
        const stil = fl && strich ? 'FD' : fl ? 'F' : 'S'
        doc.lines(rel, pts[0][0], pts[0][1], [1, 1], stil, f.geschlossen)
      }
    } else if (el.type === 'text' && el.text) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...(farbe(el.fill) ?? DUNKEL))
      doc.text(pdfText(el.text), px(el.x), py(el.y), { align: el.anker === 'start' ? 'left' : el.anker === 'end' ? 'right' : 'center' })
    }
  }

  // Bemaßungen: Maßlinie mit Maßtext (ohne Pfeilspitzen-Marker, dafür kurze Endstriche)
  for (const d of p.dimensions) {
    const ax = px(d.fromX + (d.offsetX ?? 0)), ay = py(d.fromY + (d.offsetY ?? 0)), bx = px(d.toX + (d.offsetX ?? 0)), by = py(d.toY + (d.offsetY ?? 0))
    doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.1)
    doc.line(px(d.fromX), py(d.fromY), ax, ay); doc.line(px(d.toX), py(d.toY), bx, by)
    doc.setDrawColor(217, 119, 6); doc.setLineWidth(0.25)
    doc.line(ax, ay, bx, by)
    const t = 1.2
    doc.line(ax - t, ay + t, ax + t, ay - t); doc.line(bx - t, by + t, bx + t, by - t)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(180, 83, 9)
    doc.text(pdfText(d.value.replace(/(\d)\.(\d)/g, '$1,$2')), (ax + bx) / 2, (ay + by) / 2 - 1, { align: 'center' })
  }
  return n
}

export function erzeugeGeruestplanPdf(model: CADModel, kopf: GeruestplanKopf): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  doc.setProperties({ title: `Gerüstplan – ${kopf.projektName}` })
  const B = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const seiten: { titel: string; p: Projection2D }[] = [
    { titel: 'Grundriss', p: generateGrundriss(model) },
    { titel: 'Ansicht vorne', p: generateAnsicht(model, 'front') },
    { titel: 'Ansicht hinten', p: generateAnsicht(model, 'back') },
    { titel: 'Ansicht links', p: generateAnsicht(model, 'left') },
    { titel: 'Ansicht rechts', p: generateAnsicht(model, 'right') },
    { titel: 'Schnitt A-A', p: generateSchnitt(model) },
  ]
  seiten.forEach((s, i) => {
    if (i > 0) doc.addPage()
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...ORANGE)
    doc.text(pdfText(s.titel), RAND, RAND + 4)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DUNKEL)
    doc.text(pdfText(kopf.projektName), B - RAND, RAND + 2, { align: 'right' })
    if (kopf.objektadresse) { doc.setTextColor(...GRAU); doc.text(pdfText(kopf.objektadresse), B - RAND, RAND + 6.5, { align: 'right' }) }
    doc.setDrawColor(...ORANGE); doc.setLineWidth(0.5); doc.line(RAND, RAND + 8, B - RAND, RAND + 8)
    const oben = RAND + 11, unten = H - RAND - 8
    const teile = s.p.elements.filter((el) => el.id.startsWith('teile-') && el.text)
    const listeBreite = teile.length ? 78 : 0
    const n = zeichneProjektion(doc, s.p, RAND, oben, B - 2 * RAND - listeBreite, unten - oben)
    // Teileliste der Ansicht rechts neben der Zeichnung (feste Schrift, unabhängig vom Maßstab)
    teile.forEach((el, k) => {
      const fett = el.id === 'teile-titel'
      doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(7.5); doc.setTextColor(...DUNKEL)
      doc.text(pdfText(el.text as string), B - RAND - listeBreite + 4, oben + 4 + k * 4.2)
    })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAU)
    const fuss = [`Maßstab 1:${n} (auf A4 quer)`, kopf.firma, kopf.datum].filter(Boolean).join('  ·  ')
    doc.text(pdfText(fuss), RAND, H - RAND)
    doc.text(`Seite ${i + 1} von ${seiten.length}`, B - RAND, H - RAND, { align: 'right' })
  })
  return new Uint8Array(doc.output('arraybuffer'))
}
