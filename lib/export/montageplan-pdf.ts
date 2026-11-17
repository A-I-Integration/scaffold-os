// ============================================================
// SCAFFOLD OS – Montageplan als PDF: Ansicht mit Maßen + Materialliste (Vorschau, Anzahl, Geladen, Fehlt)
//
// Seite 1: Vorderansicht (Einzelbauteile, Maße je Feld und Lage) – dieselbe Zeichnung wie im Gerüstplan.
// Ab Seite 2: Materialliste nach Gruppen. „Geladen“ und „Fehlt“ bleiben leer (Ankreuzen beim Beladen).
// Vorschaubilder sind optional: ohne Bild bleibt das Feld leer (nichts wird erfunden).
// ============================================================

import { jsPDF } from 'jspdf'
import type { CADModel } from '@/lib/calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'
import { erzeugeMontageAnsichten } from '@/lib/geruest/montage-ansicht'
import { zeichneZeichnungAufSeite, type PlanPdfOptionen } from './plan-pdf'

export interface MontageplanOptionen extends PlanPdfOptionen {
  /** Systemname für die Kopfzeile der Materialliste, z. B. „Layher Allround“ */
  systemName: string
  /** Vorschaubilder je Artikelnummer als Data-URL (PNG oder JPEG) */
  bilder?: Record<string, string>
  /** Artikelnummern, deren Bild nur ein Symbolbild der Artikelgruppe ist */
  symbolbilder?: string[]
}

/** Gruppen der Materialliste in Ladereihenfolge; Kategorien der Stückliste → Gruppenname */
const GRUPPEN: [string, string[]][] = [
  ['Fundamente', ['Fundamente']],
  ['Rahmen', ['Rahmen']],
  ['Diagonalen', ['Diagonalen']],
  ['Belag', ['Belag']],
  ['Horizontal + Abschluss', ['Geländer', 'Bordbretter']],
  ['Treppen', ['Treppen']],
  ['Konsolen', ['Konsolen']],
  ['Kupplungen + Verankerung', ['Kupplungen', 'Anker']],
  ['Sicherheit', ['Sicherheit']],
]

export function gruppiereMaterial(materials: MaterialItem[]): [string, MaterialItem[]][] {
  const de = (a: MaterialItem, b: MaterialItem) => a.name.localeCompare(b.name, 'de')
  const bekannt = new Set(GRUPPEN.flatMap(([, k]) => k))
  const out: [string, MaterialItem[]][] = []
  for (const [name, kategorien] of GRUPPEN) {
    const z = materials.filter((m) => kategorien.includes(m.category) && m.quantity > 0).sort(de)
    if (z.length) out.push([name, z])
  }
  const rest = new Map<string, MaterialItem[]>()
  for (const m of materials) if (!bekannt.has(m.category) && m.quantity > 0) rest.set(m.category, [...(rest.get(m.category) ?? []), m])
  for (const k of [...rest.keys()].sort((a, b) => a.localeCompare(b, 'de'))) out.push([k, rest.get(k)!.sort(de)])
  return out
}

const P = { b: 210, h: 297 }
const R = 10
const SPALTEN = { vorschau: R, name: R + 24, anzahl: 150, geladen: 166, fehlt: 183, ende: P.b - R }
const ZEILE = 11
const KOPF = 7

export function erzeugeMontageplanPdf(model: CADModel, materials: MaterialItem[], opt: MontageplanOptionen): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `Montageplan – ${opt.projektName}` })
  const ansichten = erzeugeMontageAnsichten(model)
  ansichten.forEach((z, i) => {
    if (i > 0) doc.addPage('a4', 'landscape')
    zeichneZeichnungAufSeite(doc, z, opt, `Montageplan · Ansicht ${i + 1} von ${ansichten.length}`)
  })

  doc.addPage('a4', 'portrait')
  let y = R
  const tabellenkopf = () => {
    doc.setDrawColor(0); doc.setFillColor(235, 235, 235); doc.setLineWidth(0.2)
    doc.rect(R, y, SPALTEN.ende - R, KOPF, 'FD')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0)
    doc.text('Vorschau', SPALTEN.vorschau + 1.5, y + 4.8)
    doc.text('Bezeichnung', SPALTEN.name + 1.5, y + 4.8)
    doc.text('Anzahl', SPALTEN.geladen - 1.5, y + 4.8, { align: 'right' })
    doc.text('Geladen', SPALTEN.fehlt - 1.5, y + 4.8, { align: 'right' })
    doc.text('Fehlt', SPALTEN.ende - 1.5, y + 4.8, { align: 'right' })
    y += KOPF
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0)
  doc.rect(R, y, SPALTEN.ende - R, KOPF, 'S')
  doc.text(`${opt.systemName} · ${opt.projektName}`, R + 1.5, y + 4.8)
  y += KOPF
  tabellenkopf()

  for (const [gruppe, zeilen] of gruppiereMaterial(materials)) {
    if (y + KOPF + ZEILE > P.h - R - 8) { doc.addPage('a4', 'portrait'); y = R; tabellenkopf() }
    doc.setFillColor(222, 222, 222); doc.rect(R, y, SPALTEN.ende - R, KOPF - 1, 'FD')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(0)
    doc.text(gruppe, R + 1.5, y + 4.2)
    y += KOPF - 1
    for (const m of zeilen) {
      if (y + ZEILE > P.h - R - 8) { doc.addPage('a4', 'portrait'); y = R; tabellenkopf() }
      doc.setDrawColor(0); doc.setLineWidth(0.15)
      doc.rect(R, y, SPALTEN.ende - R, ZEILE, 'S')
      doc.line(SPALTEN.name, y, SPALTEN.name, y + ZEILE)
      doc.line(SPALTEN.geladen, y, SPALTEN.geladen, y + ZEILE)
      doc.line(SPALTEN.fehlt, y, SPALTEN.fehlt, y + ZEILE)
      const bild = opt.bilder?.[m.articleNumber]
      if (bild) {
        if (opt.symbolbilder?.includes(m.articleNumber)) { doc.setFontSize(5.5); doc.setTextColor(120); doc.text('Symbolbild', SPALTEN.vorschau + 1.5, y + ZEILE - 0.5) }
        try { doc.addImage(bild, bild.startsWith('data:image/png') ? 'PNG' : 'JPEG', SPALTEN.vorschau + 1.5, y + 0.8, 21, ZEILE - 3, undefined, 'FAST') } catch { /* Bild unlesbar: Feld bleibt leer */ }
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(0)
      const zeilenText = doc.splitTextToSize(m.name, SPALTEN.geladen - SPALTEN.name - 14) as string[]
      doc.text(zeilenText.slice(0, 2), SPALTEN.name + 1.5, y + (zeilenText.length > 1 ? 4.3 : 6.4))
      doc.setFontSize(6.5); doc.setTextColor(110)
      if (m.articleNumber) doc.text(m.articleNumber, SPALTEN.name + 1.5, y + ZEILE - 1.2)
      doc.setFontSize(9); doc.setTextColor(0)
      doc.text(String(m.quantity), SPALTEN.geladen - 1.5, y + 6.4, { align: 'right' })
      y += ZEILE
    }
  }

  const seiten = doc.getNumberOfPages()
  for (let i = ansichten.length + 1; i <= seiten; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(110)
    doc.text(`Stand ${opt.datum} · ${opt.firma} · SCAFFOLD OS`, R, P.h - R + 3)
    doc.text(`Seite ${i - ansichten.length} von ${seiten - ansichten.length}`, P.b - R, P.h - R + 3, { align: 'right' })
  }
  return new Uint8Array(doc.output('arraybuffer'))
}
