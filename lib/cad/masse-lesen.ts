// ============================================================
// SCAFFOLD OS – Maßketten aus einem Vektor-PDF lesen und gegen die gezeichnete Länge prüfen.
//
// Grundgedanke: In einem CAD-Plan trägt die gezeichnete Maßlinie die wahre Länge (z. B. 1,025 m), das Maßtext ist
// gerundet (z. B. „1,02“). Zu jeder Maßzahl wird die waagerechte oder senkrechte Linie in der Nähe gesucht, deren
// Länge bei dem Maßstab zur Zahl passt. Passt sie, ist das Maß doppelt belegt (Text und Zeichnung) und der Maßstab bestätigt.
// Passt keine Linie, bleibt die Zahl „ohne Linie“ – sie wird nie stillschweigend als gemessen gewertet.
// Rein rechnerisch, ohne KI, ohne Browser.
// ============================================================

import type { VektorFlaeche } from './pdf-vektoren'
import type { PlanText } from './grundriss-finden'

export type MassStatus = 'bestaetigt' | 'abweichend' | 'ohne_linie'

export interface Massangabe {
  text: string
  /** Wert laut Text in Metern */
  textM: number
  /** Länge der gefundenen Linie in Metern (genauer als der gerundete Text); fehlt bei „ohne Linie“ */
  linieM?: number
  richtung?: 'waagerecht' | 'senkrecht'
  status: MassStatus
  /** Position des Textes in Seiten-Punkten */
  x: number
  y: number
}

export interface MasskettenErgebnis {
  angaben: Massangabe[]
  bestaetigt: number
  abweichend: number
  ohneLinie: number
  /** Maßstab-Nenner, bei dem die meisten Maßzahlen eine passende Linie haben (nur bei ≥ 5 Maßzahlen) */
  besterMassstab?: number
  /** Anteil bestätigter Maßzahlen beim besten Maßstab (0–1) */
  trefferAnteil?: number
}

const NENNER = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500]
const METER_JE_PUNKT_PAPIER = 0.0254 / 72

/** Maßzahl in Metern aus einem Text: „9,322“ (m), „1,02“, „9.137mm“ (= 9137 mm). Alles andere (ganze Zahlen, Koten mit Vorzeichen) bleibt unberücksichtigt. */
export function massZahl(s: string): number | null {
  const t = s.replace(/\s+/g, '')
  const mm = /^(\d{1,2})\.(\d{3})mm$/i.exec(t)
  if (mm) return parseInt(mm[1] + mm[2], 10) / 1000
  const m = /^(\d{1,3})[,.](\d{2,3})$/.exec(t)
  if (!m) return null
  const v = parseFloat(m[1] + '.' + m[2])
  return v > 0.05 && v < 200 ? v : null
}

interface Seg { l: number; cx: number; cy: number; waag: boolean }

function segmente(fl: VektorFlaeche[], mpp: number): Seg[] {
  const out: Seg[] = []
  for (const f of fl) {
    for (const ring of f.ringe) {
      const n = ring.length
      for (let i = 0; i < (f.linie ? n - 1 : n); i++) {
        const a = ring[i], b = ring[(i + 1) % n]
        const dx = b[0] - a[0], dy = b[1] - a[1]
        const l = Math.hypot(dx, dy) * mpp
        if (l < 0.2) continue
        const waag = Math.abs(dy) < Math.abs(dx) * 0.02, senk = Math.abs(dx) < Math.abs(dy) * 0.02
        if (waag || senk) out.push({ l, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, waag })
      }
    }
  }
  return out
}

function auswerten(texte: PlanText[], fl: VektorFlaeche[], nenner: number): MasskettenErgebnis {
  const mpp = nenner * METER_JE_PUNKT_PAPIER
  const segs = segmente(fl, mpp)
  const zelle = 4 / mpp
  const raster = new Map<string, Seg[]>()
  for (const s of segs) { const k = `${Math.floor(s.cx / zelle)}|${Math.floor(s.cy / zelle)}`; const l = raster.get(k); if (l) l.push(s); else raster.set(k, [s]) }
  const angaben: Massangabe[] = []
  for (const t of texte) {
    const v = massZahl(t.s)
    if (v === null) continue
    const cx = Math.floor(t.x / zelle), cy = Math.floor(t.y / zelle)
    const nah: Seg[] = []
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) nah.push(...(raster.get(`${cx + i}|${cy + j}`) ?? []))
    const imKreis = nah.filter((s) => Math.hypot(s.cx - t.x, s.cy - t.y) * mpp <= 3)
    const tol = Math.max(0.006, 0.008 * v)
    const treffer = imKreis.filter((s) => Math.abs(s.l - v) <= tol).sort((a, b) => Math.hypot(a.cx - t.x, a.cy - t.y) - Math.hypot(b.cx - t.x, b.cy - t.y))[0]
    if (treffer) { angaben.push({ text: t.s.trim(), textM: v, linieM: Math.round(treffer.l * 1000) / 1000, richtung: treffer.waag ? 'waagerecht' : 'senkrecht', status: 'bestaetigt', x: t.x, y: t.y }); continue }
    const grob = imKreis.filter((s) => Math.abs(s.l - v) <= 0.05 * v).sort((a, b) => Math.abs(a.l - v) - Math.abs(b.l - v))[0]
    if (grob) angaben.push({ text: t.s.trim(), textM: v, linieM: Math.round(grob.l * 1000) / 1000, richtung: grob.waag ? 'waagerecht' : 'senkrecht', status: 'abweichend', x: t.x, y: t.y })
    else angaben.push({ text: t.s.trim(), textM: v, status: 'ohne_linie', x: t.x, y: t.y })
  }
  const z = (s: MassStatus) => angaben.filter((a) => a.status === s).length
  return { angaben, bestaetigt: z('bestaetigt'), abweichend: z('abweichend'), ohneLinie: z('ohne_linie') }
}

/** Maßzahlen eines Plans lesen und gegen die Zeichnung prüfen; probiert zusätzlich übliche Maßstäbe, um einen falschen Maßstab zu erkennen. */
export function lesMassketten(flaechen: VektorFlaeche[], texte: PlanText[], massstab: number): MasskettenErgebnis {
  const e = auswerten(texte, flaechen, massstab)
  if (e.angaben.length < 5) return e
  let best = { n: massstab, a: e.bestaetigt / e.angaben.length }
  for (const n of NENNER) {
    if (n === massstab) continue
    const a = auswerten(texte, flaechen, n).bestaetigt / e.angaben.length
    if (a > best.a + 0.2) best = { n, a }
  }
  return { ...e, besterMassstab: best.n, trefferAnteil: Math.round(best.a * 100) / 100 }
}
