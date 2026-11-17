// ============================================================
// SCAFFOLD OS – Projektblatt (A3 quer, eine Seite): Gebäudedaten, Gerüstplanung, Ansichten und Grundriss als Vektorzeichnung.
// Nur Angaben, die im Modell stehen; Zeilen ohne Wert entfallen (keine Platzhalter, keine geschätzten Werte).
// ============================================================

import { jsPDF } from 'jspdf'
import type { CADModel } from '@/lib/calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'
import type { Zeichnung, ZLayer } from '@/lib/geruest/plan-zeichnung'
import { erzeugeGrundriss } from '@/lib/geruest/plan-zeichnung'
import { erzeugeMontageAnsichten } from '@/lib/geruest/montage-ansicht'
import { gruppiereMaterial } from './montageplan-pdf'

export interface ProjektblattOptionen { projektName: string; firma: string; datum: string; systemName: string }
export interface BlattZeile { label: string; wert: string }
export interface BlattTabelle { titel: string; zeilen: BlattZeile[] }

const B = 420, H = 297, R = 8
const FARBE: Record<ZLayer, [number, number, number]> = { GEBAEUDE: [90, 90, 90], GERUEST: [30, 90, 200], MASSE: [200, 40, 40], TEXTE: [20, 20, 20] }
const DUNKEL: [number, number, number] = [43, 52, 69]

const de = (n: number, s = 2) => n.toLocaleString('de-DE', { minimumFractionDigits: s, maximumFractionDigits: s })
const dachName: Record<string, string> = { flachdach: 'Flachdach', satteldach: 'Satteldach', walmdach: 'Walmdach', pultdach: 'Pultdach', mansardendach: 'Mansardendach', kein: 'kein Dach' }

function haeufigster(werte: number[]): number | undefined {
  if (!werte.length) return undefined
  const z = new Map<number, number>()
  for (const w of werte) { const k = Math.round(w * 100) / 100; z.set(k, (z.get(k) ?? 0) + 1) }
  return [...z.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/** Tabellen für die rechte Spalte; nur Zeilen mit belegtem Wert. */
export function projektblattTabellen(model: CADModel, materials: MaterialItem[], systemName: string): BlattTabelle[] {
  const b = model.building
  const geb: BlattZeile[] = []
  if (b.lengthM > 0) geb.push({ label: 'Länge', wert: `${de(b.lengthM)} m` })
  if (b.widthM > 0) geb.push({ label: 'Breite', wert: `${de(b.widthM)} m` })
  if (b.heightM > 0) geb.push({ label: 'Gebäudehöhe', wert: `${de(b.heightM)} m` })
  if (b.eavesHeightM > 0) geb.push({ label: 'Traufhöhe', wert: `${de(b.eavesHeightM)} m` })
  if (b.roofForm && b.roofForm !== 'kein') geb.push({ label: 'Dachform', wert: dachName[b.roofForm] ?? b.roofForm })
  if (b.roofHeightM > 0) geb.push({ label: 'Dachhöhe', wert: `${de(b.roofHeightM)} m` })
  if (b.floors > 0) geb.push({ label: 'Geschosse', wert: String(b.floors) })
  const kote = (b.planGeschossHoehenVorschlaege ?? []).map((v) => ({ label: `${v.titel} (OK, Vorschlag aus Plan)`, wert: `${v.obenM >= 0 ? '+' : '−'}${de(Math.abs(v.obenM))} m` }))

  const treppen = gruppiereMaterial(materials).find(([g]) => g === 'Treppen')?.[1].reduce((s, m) => s + m.quantity, 0) ?? 0
  const feldL = haeufigster(model.fields.map((f) => f.lengthM))
  const breiteG = haeufigster(model.fields.map((f) => f.widthM))
  const ger: BlattZeile[] = []
  if (systemName) ger.push({ label: 'Gerüstsystem', wert: systemName })
  if (feldL) ger.push({ label: 'Feldlänge (häufigste)', wert: `${de(feldL)} m` })
  if (breiteG) ger.push({ label: 'Gerüstbreite', wert: `${de(breiteG)} m` })
  if (model.levelCount > 0) ger.push({ label: 'Gerüstlagen', wert: String(model.levelCount) })
  if (model.totalHeightM > 0) ger.push({ label: 'Gerüsthöhe', wert: `${de(model.totalHeightM)} m` })
  if (model.fieldCount > 0) ger.push({ label: 'Felder', wert: String(model.fieldCount) })
  if (model.totalAreaM2 > 0) ger.push({ label: 'Gerüstfläche', wert: `${de(model.totalAreaM2, 1)} m²` })
  if (treppen > 0) ger.push({ label: 'Treppen', wert: String(treppen) })
  if (model.anchors.length > 0) ger.push({ label: 'Wandanker', wert: String(model.anchors.length) })

  const t: BlattTabelle[] = []
  if (geb.length) t.push({ titel: 'Gebäudedaten (Eingabe bzw. Plan)', zeilen: geb })
  if (kote.length) t.push({ titel: 'Höhenkoten (Vorschläge, zu bestätigen)', zeilen: kote })
  if (ger.length) t.push({ titel: 'Gerüstplanung', zeilen: ger })
  return t
}

function zeichneInBox(doc: jsPDF, z: Zeichnung, x: number, y: number, w: number, h: number, titel: string) {
  doc.setDrawColor(190); doc.setLineWidth(0.2); doc.rect(x, y, w, h, 'S')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...DUNKEL)
  doc.text(titel, x + 2, y + 4.5)
  const rx = x + 2, ry = y + 8, rw = w - 4, rh = h - 10
  // Maßstab nur aus den Linien (die Überschriftstexte der Zeichnung liegen außerhalb und blähen sonst die Grenzen auf; das Blatt hat eigene Titel)
  const gr = z.linien.length
    ? { minX: Math.min(...z.linien.flatMap((l) => [l.x1, l.x2])), maxX: Math.max(...z.linien.flatMap((l) => [l.x1, l.x2])), minY: Math.min(...z.linien.flatMap((l) => [l.y1, l.y2])), maxY: Math.max(...z.linien.flatMap((l) => [l.y1, l.y2])) }
    : z.grenzen
  const rand = 0.4
  const bw = Math.max(0.01, gr.maxX - gr.minX + 2 * rand), bh = Math.max(0.01, gr.maxY - gr.minY + 2 * rand)
  const ms = Math.min(rw / bw, rh / bh)
  const ox = rx + (rw - bw * ms) / 2 + rand * ms, oy = ry + (rh - bh * ms) / 2 + rand * ms
  const X = (v: number) => ox + (v - gr.minX) * ms
  const Y = (v: number) => oy + (gr.maxY - v) * ms
  doc.setLineWidth(0.12)
  for (const l of z.linien) {
    const [r, g, b] = FARBE[l.layer]; doc.setDrawColor(r, g, b)
    if (l.gestrichelt) doc.setLineDashPattern([1, 0.8], 0); else doc.setLineDashPattern([], 0)
    doc.line(X(l.x1), Y(l.y1), X(l.x2), Y(l.y2))
  }
  doc.setLineDashPattern([], 0)
  doc.setFont('helvetica', 'normal')
  for (const t of z.texte) {
    if (t.x < gr.minX - rand || t.x > gr.maxX + rand || t.y < gr.minY - rand || t.y > gr.maxY + rand) continue // Titel-/Kopfzeilen der Zeichnung
    const [r, g, b] = FARBE[t.layer]; doc.setTextColor(r, g, b)
    doc.setFontSize(Math.max(3.5, (t.hoehe * ms) / 0.3528 * 0.8))
    if (t.drehungGrad === 90) {
      const tw = doc.getTextWidth(t.text)
      doc.text(t.text, X(t.x), Y(t.y) + (t.ausrichtung === 'mitte' ? tw / 2 : t.ausrichtung === 'rechts' ? tw : 0), { angle: 90 })
    } else doc.text(t.text, X(t.x), Y(t.y), { align: t.ausrichtung === 'mitte' ? 'center' : t.ausrichtung === 'rechts' ? 'right' : 'left', angle: t.drehungGrad ?? 0 })
  }
}

export function erzeugeProjektblattPdf(model: CADModel, materials: MaterialItem[], opt: ProjektblattOptionen): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  doc.setProperties({ title: `Projektblatt – ${opt.projektName}` })
  // Kopf
  doc.setFillColor(...DUNKEL); doc.rect(0, 0, B, 18, 'F')
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('SCAFFOLD OS', R, 9)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text('CAD-Gerüstplanung', R, 14)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(opt.projektName, 70, 9)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Projektblatt · ${opt.firma} · Stand ${opt.datum}`, 70, 14.5)

  // Links: Ansichten (bis 4), 2 × 2
  const ansichten = erzeugeMontageAnsichten(model).slice(0, 4)
  const gx = R, gy = 24, gw = 136, gh = 126
  ansichten.forEach((z, i) => zeichneInBox(doc, z, gx + (i % 2) * (gw + 3), gy + Math.floor(i / 2) * (gh + 3), gw, gh, z.titel))

  // Rechts: Tabellen, darunter Grundriss
  const rx = 290, rw = B - R - rx
  let y = 24
  for (const t of projektblattTabellen(model, materials, opt.systemName)) {
    doc.setFillColor(...DUNKEL); doc.rect(rx, y, rw, 7, 'F')
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(t.titel, rx + 2, y + 5)
    y += 7
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    for (const z of t.zeilen) {
      doc.setDrawColor(215); doc.setLineWidth(0.15); doc.line(rx, y + 6, rx + rw, y + 6)
      doc.setTextColor(40); doc.text(z.label, rx + 2, y + 4.4)
      doc.setFont('helvetica', 'bold'); doc.text(z.wert, rx + rw - 2, y + 4.4, { align: 'right' }); doc.setFont('helvetica', 'normal')
      y += 6
    }
    y += 4
  }
  const grundriss = erzeugeGrundriss(model)
  const gh2 = Math.max(60, H - R - 8 - y)
  zeichneInBox(doc, grundriss, rx, y, rw, gh2, grundriss.titel)

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(110)
  doc.text('Schematische Darstellung aus SCAFFOLD OS aus den Eingaben und Plandaten · Kein Standsicherheitsnachweis, keine Abnahme', R, H - 4)
  return new Uint8Array(doc.output('arraybuffer'))
}
