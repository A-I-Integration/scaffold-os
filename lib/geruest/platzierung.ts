// ============================================================
// SCAFFOLD OS – Bauteile des Gerüstplans (Komponentenmodus)
//
// Zerlegt das CAD-Modell in 2D-Bauteile für die Plan-Zeichnung: Ständer,
// Riegel, Diagonalen, Geländer, Belag, Fußplatten, Treppen.
//
// WICHTIG – keine zweite Platzierungs-Engine: Welche Felder, Lagen und
// Bauteile es gibt, entscheidet allein das CAD-Modell (generateCADModel,
// Feldlängen und Rahmenbreiten des gewählten Systems). Dieser Code liest
// nur das Ergebnis und projiziert es in die Zeichenebene. So zeigen Plan,
// Stückliste und CAD immer dieselben Zahlen.
//
// Regeln, die aus dem Modell übernommen werden (cad-engine.ts):
//   - Je Feld und Lage: zwei Ständer (Rahmen) und zwei Riegel (unten/oben).
//   - Belag auf Höhe der Lagenoberkante (entfällt im Treppenfeld).
//   - Geländer 0,5 m und 1,0 m über dem Belag.
//   - Diagonale nur in jeder zweiten Lage (Lage 0, 2, 4 ...), je Feld.
//   - Fußplatten nur in der untersten Lage.
//   - Restfelder: Feldlängen kommen aus den Standardlängen des Systems;
//     die Restlänge einer Seite füllt das Modell mit der passenden Länge.
// Maße in Metern. Ansicht: x entlang der Seite, y = Höhe. Grundriss:
// x = Modell-x, y = -Modell-z (Vorderseite unten).
// ============================================================

import { GEBAEUDE_SZENEN_VERSATZ_M, type CADModel, type ScaffoldField, type ScaffoldLevel } from '@/lib/calculations/cad-engine'

export type BauteilTyp = 'staender' | 'riegel' | 'diagonale' | 'gelaender' | 'belag' | 'fussplatte' | 'treppe'

export interface PlanBauteil {
  typ: BauteilTyp
  feldId: string
  /** Lage (0 = unterste) */
  lage: number
  x1: number
  y1: number
  x2: number
  y2: number
  /** false: nur für Zählung und Stückliste, wird nicht gezeichnet (liegt unter einem anderen Bauteil) */
  sichtbar?: boolean
}

/**
 * Das 3D-Modell stellt das Gebäude um 0,5 m nach hinten versetzt dar (Vorderkante z = -0,5,
 * siehe cad-engine.ts, Abschnitt Seiten-Geometrie). Der Plan zeichnet das Gebäude von z = 0
 * nach hinten; darum werden Modell-z-Werte für den Plan um diesen Betrag verschoben.
 */
export const SZENE_Z_VERSATZ_M = GEBAEUDE_SZENEN_VERSATZ_M

/** Ständerbreite (Rohr/Rahmenstiel) in m, wie im Modell (scale 0,073). */
export const STAENDER_M = 0.073
const BELAG_DICKE_M = 0.04
const GELAENDER_OBEN_M = 1.0
const GELAENDER_MITTE_M = 0.5
const FUSS_M = 0.15

type SeitenId = 'front' | 'back' | 'left' | 'right'

/** Welche Bauteil-Typen das Modell je Feld tatsächlich erzeugt hat. */
function typenJeFeld(model: CADModel): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  for (const c of model.components3D) {
    if (!c.fieldId) continue
    let s = m.get(c.fieldId)
    if (!s) { s = new Set(); m.set(c.fieldId, s) }
    s.add(c.type)
  }
  return m
}

function felderDerSeite(model: CADModel, seite: SeitenId): { f: ScaffoldField; l: ScaffoldLevel }[] {
  return model.levels.flatMap((l) => l.fields.filter((f) => f.side === seite).map((f) => ({ f, l })))
}

/** Bauteile der Ansicht einer Seite (Standard: Vorderseite). */
export function ansichtBauteile(model: CADModel, seite: SeitenId = 'front'): PlanBauteil[] {
  const typen = typenJeFeld(model)
  const aus: PlanBauteil[] = []
  for (const { f, l } of felderDerSeite(model, seite)) {
    const t = typen.get(f.id) ?? new Set<string>()
    const x0 = f.positionX - f.lengthM / 2
    const x1 = f.positionX + f.lengthM / 2
    const yu = l.bottomY
    const yo = l.topY
    const base = { feldId: f.id, lage: l.index }
    // Ständer links und rechts (Rechtecke)
    aus.push({ ...base, typ: 'staender', x1: x0, y1: yu, x2: x0 + STAENDER_M, y2: yo })
    aus.push({ ...base, typ: 'staender', x1: x1 - STAENDER_M, y1: yu, x2: x1, y2: yo })
    // Riegel unten und oben
    aus.push({ ...base, typ: 'riegel', x1: x0, y1: yu + 0.05, x2: x1, y2: yu + 0.05 })
    aus.push({ ...base, typ: 'riegel', x1: x0, y1: yo - 0.05, x2: x1, y2: yo - 0.05, sichtbar: !t.has('deck') })
    // Belag (nicht im Treppenfeld)
    if (t.has('deck')) aus.push({ ...base, typ: 'belag', x1: x0, y1: yo - BELAG_DICKE_M, x2: x1, y2: yo })
    // Geländer
    if (t.has('railing')) {
      aus.push({ ...base, typ: 'gelaender', x1: x0, y1: yo + GELAENDER_OBEN_M, x2: x1, y2: yo + GELAENDER_OBEN_M })
      aus.push({ ...base, typ: 'gelaender', x1: x0, y1: yo + GELAENDER_MITTE_M, x2: x1, y2: yo + GELAENDER_MITTE_M })
    }
    // Diagonale (steigt von links unten nach rechts oben, wie im Modell)
    if (t.has('diagonal')) aus.push({ ...base, typ: 'diagonale', x1: x0, y1: yu, x2: x1, y2: yo })
    // Treppe im Feld
    if (t.has('stair')) aus.push({ ...base, typ: 'treppe', x1: x0, y1: yu, x2: x1, y2: yo })
    // Fußplatten (unterste Lage)
    if (t.has('footplate')) {
      aus.push({ ...base, typ: 'fussplatte', x1: x0 + STAENDER_M / 2 - FUSS_M / 2, y1: yu - 0.04, x2: x0 + STAENDER_M / 2 + FUSS_M / 2, y2: yu })
      aus.push({ ...base, typ: 'fussplatte', x1: x1 - STAENDER_M / 2 - FUSS_M / 2, y1: yu - 0.04, x2: x1 - STAENDER_M / 2 + FUSS_M / 2, y2: yu })
    }
  }
  return aus
}

/**
 * Bauteile des Grundrisses: je Feld der untersten Lage ein Belagrechteck
 * (Feldlänge × Gerüstbreite), vier Ständer, ein Geländerstrich an der Außenkante.
 * Außen liegt vorne bei +z, hinten bei -z, links bei -x, rechts bei +x.
 */
export function grundrissBauteile(model: CADModel): PlanBauteil[] {
  const typen = typenJeFeld(model)
  const aus: PlanBauteil[] = []
  const unterste = model.levels.filter((l) => l.index === 0)
  for (const l of unterste) {
    for (const f of l.fields) {
      const t = typen.get(f.id) ?? new Set<string>()
      const w = f.widthM
      const base = { feldId: f.id, lage: 0 }
      // Rechteck des Feldes in Plan-Koordinaten
      let xa: number, xb: number, ya: number, yb: number // a = Innenkante, b = Außenkante je nach Seite
      let laengs: 'x' | 'y'
      let aussen: number
      const zf = f.positionZ + SZENE_Z_VERSATZ_M // Feldmitte bzw. Innenkante im Plan
      if (f.side === 'front' || f.side === 'back') {
        const z0 = zf
        const z1 = f.side === 'front' ? zf + w : zf - w
        xa = f.positionX - f.lengthM / 2; xb = f.positionX + f.lengthM / 2
        ya = -z0; yb = -z1
        laengs = 'x'; aussen = yb
      } else {
        const x0 = f.positionX
        const x1 = f.side === 'right' ? f.positionX + w : f.positionX - w
        // Feld liegt entlang z: Plan-y = -z
        ya = -(zf - f.lengthM / 2); yb = -(zf + f.lengthM / 2)
        xa = x0; xb = x1
        laengs = 'y'; aussen = xb
      }
      const xl = Math.min(xa, xb), xr = Math.max(xa, xb), yl = Math.min(ya, yb), yr = Math.max(ya, yb)
      aus.push({ ...base, typ: t.has('stair') ? 'treppe' : 'belag', x1: xl, y1: yl, x2: xr, y2: yr })
      // Ständer in den vier Ecken
      const s = STAENDER_M
      for (const [cx, cy] of [[xl, yl], [xr - s, yl], [xl, yr - s], [xr - s, yr - s]] as const) {
        aus.push({ ...base, typ: 'staender', x1: cx, y1: cy, x2: cx + s, y2: cy + s })
      }
      // Geländer an der Außenkante (leicht nach innen versetzt)
      if (t.has('railing')) {
        const v = 0.045
        if (laengs === 'x') {
          const y = aussen > (ya + yb) / 2 ? aussen - v : aussen + v
          aus.push({ ...base, typ: 'gelaender', x1: xl, y1: y, x2: xr, y2: y })
        } else {
          const x = aussen > (xa + xb) / 2 ? aussen - v : aussen + v
          aus.push({ ...base, typ: 'gelaender', x1: x, y1: yl, x2: x, y2: yr })
        }
      }
    }
  }
  return aus
}

export interface BauteilZahlen {
  felder: number
  lagen: number
  staender: number
  riegel: number
  diagonalen: number
  gelaender: number
  belaege: number
  fussplatten: number
}

/** Zählt die Bauteile einer Ansicht. Gelaender zählt je Feld und Lage einmal (zwei Holme). */
export function zaehleBauteile(bauteile: PlanBauteil[]): BauteilZahlen {
  const felder = new Set(bauteile.map((b) => b.feldId))
  const lagen = new Set(bauteile.map((b) => b.lage))
  const n = (typ: BauteilTyp) => bauteile.filter((b) => b.typ === typ).length
  return {
    felder: felder.size, lagen: lagen.size,
    staender: n('staender'), riegel: n('riegel'), diagonalen: n('diagonale'),
    gelaender: n('gelaender') / 2, belaege: n('belag'), fussplatten: n('fussplatte'),
  }
}
