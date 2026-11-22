// ============================================================
// SCAFFOLD OS – Aufbau Schritt für Schritt: ein Schritt je gebauter Lage
//
// Schritt k zeigt das Gerüst bis einschließlich k-ter Lage (von unten). Alle Angaben je Schritt stammen aus dem Modell
// (Bauteilzahlen der Lage, Belaghöhe, Fußpunkte im ersten Schritt). Nichts wird geschätzt oder hinzugefügt.
// Schematisch, kein Standsicherheitsnachweis.
// ============================================================

import type { CADModel, ScaffoldComponent3D } from '@/lib/calculations/cad-engine'

export interface AufbauSchritt {
  nr: number
  /** Anzahl Schritte insgesamt */
  von: number
  titel: string
  /** Index der obersten sichtbaren Lage (ScaffoldLevel.index) */
  bisLageIndex: number
  /** Lagen-Indizes, die in diesem Schritt noch ausgeblendet sind */
  versteckteLagen: number[]
  /** Belag-Oberkante dieser Lage in m über ±0,00 */
  belagHoeheM: number
  hinweise: string[]
}

const NAME: Partial<Record<ScaffoldComponent3D['type'], [string, string]>> = {
  frame: ['Rahmen', 'Rahmen'],
  diagonal: ['Diagonale', 'Diagonalen'],
  deck: ['Belag', 'Beläge'],
  railing: ['Geländer', 'Geländer'],
  board: ['Bordbrett', 'Bordbretter'],
  stair: ['Treppe', 'Treppen'],
  console: ['Konsole', 'Konsolen'],
  net: ['Netz', 'Netze'],
}
const REIHENFOLGE: ScaffoldComponent3D['type'][] = ['frame', 'diagonal', 'deck', 'railing', 'board', 'stair', 'console', 'net']

const m2 = (v: number) => `${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`

export function erzeugeAufbauSchritte(model: CADModel): AufbauSchritt[] {
  // Lagen gibt es je Seite; ein Aufbauschritt fasst alle Seiten gleichen Lagen-Index zusammen.
  const indizes = [...new Set(model.levels.filter((l) => l.fields.length > 0).map((l) => l.index))].sort((a, b) => a - b)
  const alle = [...new Set(model.levels.map((l) => l.index))]
  const out: AufbauSchritt[] = []
  indizes.forEach((idx, i) => {
    const gruppe = model.levels.filter((l) => l.index === idx)
    const ids = new Set(gruppe.map((l) => l.id))
    const bottomY = Math.min(...gruppe.map((l) => l.bottomY))
    const topY = Math.max(...gruppe.map((l) => l.topY))
    const l = { index: idx, bottomY, topY }
    const bauteile = model.components3D.filter((c) => !!c.levelId && ids.has(c.levelId))
    const zahl = (t: ScaffoldComponent3D['type']) => bauteile.filter((c) => c.type === t).length
    const hinweise: string[] = []
    if (i === 0) {
      const fuesse = bauteile.filter((c) => c.type === 'footplate' || (c.id ?? '').startsWith('ausgleich')).length
      const sohle = model.components3D.filter((c) => c.type === 'footplate')
      if (sohle.length) {
        const ys = sohle.map((c) => c.position[1])
        const tief = Math.min(...ys), hoch = Math.max(...ys)
        hinweise.push(`${sohle.length} Fußpunkte setzen und ausrichten`)
        if (hoch - tief > 0.05) hinweise.push(`Fußpunkte liegen zwischen ${m2(tief)} und ${m2(hoch)} (Gelände fällt/steigt) – Höhenausgleich je Fuß beachten`)
      } else if (fuesse > 0) hinweise.push(`${fuesse} Fußpunkte setzen`)
    }
    for (const t of REIHENFOLGE) {
      const n = zahl(t)
      if (n > 0) hinweise.push(`${n} ${NAME[t]![n === 1 ? 0 : 1]}`)
    }
    const anker = model.anchors.filter((a) => a.positionY >= l.bottomY - 1e-6 && a.positionY < l.topY + 1e-6).length
    if (anker > 0) hinweise.push(`${anker} Anker setzen`)
    hinweise.push(`Belag-Oberkante ${m2(l.topY)}`)
    out.push({
      nr: i + 1,
      von: indizes.length,
      titel: `Lage ${i + 1} von ${indizes.length}`,
      bisLageIndex: l.index,
      versteckteLagen: alle.filter((x) => x > l.index),
      belagHoeheM: l.topY,
      hinweise,
    })
  })
  return out
}
