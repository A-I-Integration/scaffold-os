// ============================================================
// lib/calculations/cad-engine.ts
// SCAFFOLD OS – CAD Geometrie-Engine v3
// Mehrseitige Gerüste, Eckverbindungen, echte Treppen
// ============================================================

import { GeruestSystem, findeSystem } from './geruest-systeme'
import { MaterialItem } from '@/types/scaffold'

export interface BuildingSection {
  bezeichnung?: string
  laengeM: number
  hoeheM: number
  winkelGrad?: number // Abwinklung ggü. der Richtung des vorherigen Abschnitts (0 = geradeaus, 90 = rechtwinklige Ecke)
  // NEU: eigene Dachform je Abschnitt (z.B. Kirchenschiff Satteldach,
  // angebauter Turm eigene Form) – fehlt sie, gilt die globale Dachform
  // des Gebäudes (Rückwärtskompatibilität).
  roofForm?: 'flachdach' | 'satteldach' | 'walmdach' | 'pultdach' | 'mansardendach' | 'kein'
  roofHoeheM?: number
}

export interface BuildingParams {
  lengthM: number
  widthM: number
  heightM: number
  eavesHeightM: number
  roofHeightM: number
  roofForm: 'flachdach' | 'satteldach' | 'walmdach' | 'pultdach' | 'mansardendach' | 'kein'
  floors: number
  floorHeightsM: number[]
  windowCount: number
  doorCount: number
  balconyCount: number
  overhangM: number
  setbackM: number
  // Optional: Dachrand-Absturzschutz (nur Flachdach, nicht bei gestuften Gebäuden):
  // zusätzliches Geländer 1,0 m über der Dachkante auf der obersten Lage.
  dachrandSchutz?: boolean
  sides: ('front' | 'back' | 'left' | 'right')[]
  // NEU: mehrteiliges Gebäude (unterschiedliche Höhen/Ecken) – wenn gesetzt
  // (2+ Einträge), wird die Gebäudeform aus diesen Abschnitten aufgebaut,
  // statt der einzelnen lengthM/heightM oben. Dieselbe Grundidee wie die
  // "Abschnitte" im Aufmaß, hier zusätzlich mit optionalem Eckwinkel.
  sections?: BuildingSection[]
  // NEU: Lastklasse nach DIN EN 12811-1 (1-6) – bisher nirgends erfasst,
  // aber nötig, um die Regelausführungs-Grenzen einer Zulassung zu prüfen.
  lastklasse?: number
}

export interface GebaeudeSegment {
  bezeichnung?: string
  laengeM: number
  hoeheM: number
  startX: number
  startZ: number
  endX: number
  endZ: number
  mitteX: number
  mitteZ: number
  rotationYRad: number
  // NEU: eigene Dachform/-höhe je Abschnitt, durchgereicht aus BuildingSection
  roofForm?: BuildingSection['roofForm']
  roofHoeheM?: number
}

/**
 * Berechnet die Position/Ausrichtung jedes Gebäudeabschnitts nach dem
 * Schildkröten-Prinzip: jeder Abschnitt startet dort, wo der vorherige
 * endet, in der Richtung, die sich aus dem kumulierten Winkel ergibt.
 * Reine Geometrie-Berechnung, unabhängig von Three.js – deshalb auch ohne
 * laufenden Browser testbar.
 */
export function berechneGebaeudeSegmente(sections: BuildingSection[]): GebaeudeSegment[] {
  const segmente: GebaeudeSegment[] = []
  let x = 0, z = 0, winkelRad = 0
  for (const s of sections) {
    winkelRad += ((s.winkelGrad || 0) * Math.PI) / 180
    const dx = Math.cos(winkelRad) * s.laengeM
    const dz = Math.sin(winkelRad) * s.laengeM
    const mitteX = x + dx / 2
    const mitteZ = z + dz / 2
    segmente.push({
      bezeichnung: s.bezeichnung, laengeM: s.laengeM, hoeheM: s.hoeheM,
      startX: x, startZ: z, endX: x + dx, endZ: z + dz,
      mitteX, mitteZ, rotationYRad: -winkelRad,
      roofForm: s.roofForm, roofHoeheM: s.roofHoeheM,
    })
    x += dx
    z += dz
  }
  return segmente
}

/**
 * Gerade mehrteiliges Gebäude: 2+ Abschnitte, alle ohne Eckwinkel
 * (z. B. Höhenstufen). Nur dafür folgt das Gerüst den Abschnitten;
 * bei Ecken (Winkel ≠ 0) wird es weiter aus Länge/Höhe erzeugt.
 */
export function hatGeradeAbschnitte(b: BuildingParams): boolean {
  return !!b.sections && b.sections.length >= 2 &&
    b.sections.every((s) => !s.winkelGrad && s.laengeM > 0 && s.hoeheM > 0)
}

export interface ScaffoldField {
  id: string
  index: number
  lengthM: number
  widthM: number
  positionX: number
  positionY: number
  positionZ: number
  side: 'front' | 'back' | 'left' | 'right'
  levelIndex: number
  isCorner?: boolean
}

export interface ScaffoldLevel {
  id: string
  index: number
  heightM: number
  bottomY: number
  topY: number
  fields: ScaffoldField[]
}

export interface ScaffoldAnchor {
  id: string
  positionX: number
  positionY: number
  positionZ: number
  side: 'front' | 'back' | 'left' | 'right'
  type: string
}

export interface ScaffoldComponent3D {
  id: string
  type: 'frame' | 'deck' | 'railing' | 'diagonal' | 'footplate' | 'coupling' | 'anchor' | 'console' | 'stair' | 'net' | 'board' | 'protection_roof' | 'safety_net' | 'load_plate' | 'corner_brace' | 'ladder'
  articleNumber: string
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
  fieldId?: string
  levelId?: string
  // Nur Treppenturm im Feld (Scaffmax-Stil): Anzahl Läufe (je Lage einer,
  // im Zickzack) und Richtung des ersten Laufs (1 = links→rechts, -1 = umgekehrt).
  flights?: number
  flightStartDir?: 1 | -1
}

export interface CADModel {
  building: BuildingParams
  system: GeruestSystem | null
  fields: ScaffoldField[]
  levels: ScaffoldLevel[]
  anchors: ScaffoldAnchor[]
  components3D: ScaffoldComponent3D[]
  totalLengthM: number
  totalHeightM: number
  totalAreaM2: number
  fieldCount: number
  levelCount: number
  warnings: CADWarning[]
}

export interface CADWarning {
  type: 'error' | 'warning' | 'info'
  code: string
  message: string
  fieldId?: string
  levelId?: string
}

export function calculateFieldDivision(
  buildingLengthM: number,
  system: GeruestSystem,
  preferredFieldLength?: number
): { fields: number; fieldLengthM: number; remainderM: number; distribution: number[] } {
  const available = system.feldlangenM
  const target = preferredFieldLength || system.standardFeldlangeM
  const bestLength = available.reduce((best, curr) => {
    const bestFields = Math.ceil(buildingLengthM / best)
    const currFields = Math.ceil(buildingLengthM / curr)
    const bestRemainder = Math.abs(buildingLengthM - bestFields * best)
    const currRemainder = Math.abs(buildingLengthM - currFields * curr)
    if (currFields < bestFields) return curr
    if (currFields > bestFields) return best
    return currRemainder < bestRemainder ? curr : best
  }, target)
  const fields = Math.max(1, Math.ceil(buildingLengthM / bestLength))
  const actualLength = fields * bestLength
  const remainder = actualLength - buildingLengthM
  const distribution: number[] = []
  for (let i = 0; i < fields; i++) distribution.push(bestLength)
  if (remainder > 0.1 && fields > 1) distribution[fields - 1] = parseFloat((bestLength - remainder).toFixed(2))
  return { fields, fieldLengthM: bestLength, remainderM: remainder, distribution }
}

export function calculateLevels(
  buildingHeightM: number,
  system: GeruestSystem,
  groundOffsetM: number = 0
): { levels: number; levelHeightM: number; levelsData: { index: number; bottomY: number; topY: number }[] } {
  const rasterH = system.rasterHoeheM
  const levels = Math.max(1, Math.ceil(buildingHeightM / rasterH))
  const levelsData: { index: number; bottomY: number; topY: number }[] = []
  for (let i = 0; i < levels; i++) {
    const bottomY = groundOffsetM + i * rasterH
    const topY = bottomY + rasterH
    levelsData.push({ index: i, bottomY: parseFloat(bottomY.toFixed(2)), topY: parseFloat(topY.toFixed(2)) })
  }
  return { levels, levelHeightM: rasterH, levelsData }
}

// ============================================================
// SEITEN-GEOMETRIE (Umfassungsgerüst)
// Alle Bauteile eines Feldes werden in einem lokalen "Vorne"-Koordinatensystem
// erzeugt (Länge entlang x, nach außen +z). Für Hinten/Links/Rechts wird das
// Ergebnis um das Gebäude gedreht (Hinten 180°, Links -90°, Rechts +90°),
// damit Geländer außen, Beläge richtig herum und alle Seiten am Haus liegen.
// Das Gebäude ist in der Szene um 0,5 m nach hinten versetzt gezeichnet
// (Vorderkante z = -0,5) – darum rechnen wir mit Lv = L + 1 und Wv = W + 1.
// ============================================================
type SeitenId = 'front' | 'back' | 'left' | 'right'
interface SeitenRahmen {
  yaw: number
  toLocal: (x: number, z: number) => [number, number]
  toWorld: (lx: number, lz: number) => [number, number]
}
export function seitenRahmen(side: SeitenId, building: { lengthM: number; widthM?: number }): SeitenRahmen {
  const Lv = (building.lengthM || 0) + 1
  const Wv = (building.widthM || 0) + 1
  switch (side) {
    case 'back':
      return { yaw: Math.PI, toLocal: (x, z) => [-x, -z - Wv], toWorld: (lx, lz) => [-lx, -lz - Wv] }
    case 'left':
      return { yaw: -Math.PI / 2, toLocal: (x, z) => [z + Wv / 2, -x - Lv / 2], toWorld: (lx, lz) => [-(lz + Lv / 2), lx - Wv / 2] }
    case 'right':
      return { yaw: Math.PI / 2, toLocal: (x, z) => [-(z + Wv / 2), x - Lv / 2], toWorld: (lx, lz) => [lz + Lv / 2, -lx - Wv / 2] }
    default:
      return { yaw: 0, toLocal: (x, z) => [x, z], toWorld: (lx, lz) => [lx, lz] }
  }
}

/** Dreht eine Euler-Rotation (XYZ) zusätzlich um die Hochachse (yaw). */
function eulerMitYaw(rot: [number, number, number], yaw: number): [number, number, number] {
  if (!yaw) return rot
  const c1 = Math.cos(rot[0] / 2), s1 = Math.sin(rot[0] / 2)
  const c2 = Math.cos(rot[1] / 2), s2 = Math.sin(rot[1] / 2)
  const c3 = Math.cos(rot[2] / 2), s3 = Math.sin(rot[2] / 2)
  const b = {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  }
  const a = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }
  const q = {
    x: a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
    y: a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
    z: a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  }
  const m11 = 1 - 2 * (q.y * q.y + q.z * q.z)
  const m12 = 2 * (q.x * q.y - q.z * q.w)
  const m13 = 2 * (q.x * q.z + q.y * q.w)
  const m22 = 1 - 2 * (q.x * q.x + q.z * q.z)
  const m23 = 2 * (q.y * q.z - q.x * q.w)
  const m32 = 2 * (q.y * q.z + q.x * q.w)
  const m33 = 1 - 2 * (q.x * q.x + q.y * q.y)
  const ey = Math.asin(Math.max(-1, Math.min(1, m13)))
  if (Math.abs(m13) < 0.9999999) return [Math.atan2(-m23, m33), ey, Math.atan2(-m12, m11)]
  return [Math.atan2(m32, m22), ey, 0]
}

/** Lokales Bauteil (Vorne-System) ins Szenen-System der Seite übertragen. */
function bauteilInWelt(c: ScaffoldComponent3D, rahmen: SeitenRahmen): void {
  if (!rahmen.yaw) return
  const [wx, wz] = rahmen.toWorld(c.position[0], c.position[2])
  c.position = [wx, c.position[1], wz]
  c.rotation = eulerMitYaw(c.rotation, rahmen.yaw)
}

export function generateScaffoldComponents(model: CADModel): ScaffoldComponent3D[] {
  const components: ScaffoldComponent3D[] = []
  const { system, fields, levels, building } = model
  if (!system) return components

  const colorFrame = '#3b82f6'
  const colorDeck = '#f59e0b'
  const colorRailing = '#ef4444'
  const colorDiagonal = '#8b5cf6'
  const colorFoot = '#6b7280'
  const colorAnchor = '#10b981'
  const colorBoard = '#d97706'
  const colorNet = '#06b6d4'
  const colorStair = '#84cc16'
  const colorConsole = '#f43f5e'
  const colorRoof = '#f97316'
  const colorLoadPlate = '#78716c'
  const colorCorner = '#6366f1'

  // Gruppiere Felder nach Seite und Lage
  const fieldsBySide = new Map<string, ScaffoldField[]>()
  fields.forEach(f => {
    const key = `${f.side}-${f.levelIndex}`
    if (!fieldsBySide.has(key)) fieldsBySide.set(key, [])
    fieldsBySide.get(key)!.push(f)
  })

  // === TREPPEN-PLAN ===
  // Ein Treppenturm sitzt IM Feld (Zickzack-Läufe, ein Lauf je Lage) und deckt
  // bis zu 3 Lagen ab, aber nur so viele, wie an seiner Stelle Felder
  // existieren. Bei Höhenstufen folgt je Stufe der nächste Turm.
  const stairInterval = 3
  const stairBase = fields.find((f) => f.side === 'front' && f.levelIndex === 0)
  const stairPlans: { i: number; covered: number; field: ScaffoldField; level: ScaffoldLevel }[] = []
  const stairDeckDir = new Map<string, 1 | -1>() // Feld-ID → Ende, an dem der Lauf ankommt (Belag nur dort)
  {
    let stairLevel = 0
    for (let guard = 0; guard < levels.length + 2 && stairLevel < levels.length; guard++) {
      const i = stairLevel
      const level = levels.find((l) => l.index === i)
      const stairField = fields.find((f) => f.side === 'front' && f.levelIndex === i)
      if (!stairField || !level) break
      const aufTurm = !stairBase || Math.abs(stairField.positionX - stairBase.positionX) < 0.01
      const getragen = i === 0 || aufTurm || fields.some((g) => g.side === 'front' && g.levelIndex === i - 1 && Math.abs(g.positionX - stairField.positionX) <= g.lengthM / 2)
      if (!getragen) break
      let covered = 0
      while (covered < stairInterval && fields.some((g) => g.side === 'front' && g.levelIndex === i + covered && Math.abs(g.positionX - stairField.positionX) < 0.01)) covered++
      covered = Math.max(1, covered)
      stairPlans.push({ i, covered, field: stairField, level })
      for (let j = i; j < i + covered; j++) {
        const f = fields.find((g) => g.side === 'front' && g.levelIndex === j && Math.abs(g.positionX - stairField.positionX) < 0.01)
        if (f) stairDeckDir.set(f.id, j % 2 === 0 ? 1 : -1)
      }
      stairLevel += covered
    }
  }

  // Dachrand-Schutz nur bei Flachdach und einheitlicher Gebäudehöhe (keine Stufen)
  const dachrandSchutz = !!building.dachrandSchutz && building.roofForm === 'flachdach' && !hatGeradeAbschnitte(building)

  // === BASIS-BAUTEILE (pro Feld) ===
  fields.forEach((field) => {
    const { lengthM, widthM, levelIndex, side } = field
    const level = levels.find((l) => l.index === levelIndex)
    if (!level) return
    // Lokale Position im Vorne-System; am Ende der Schleife wird gedreht.
    const rahmen = seitenRahmen(side, building)
    const [positionX, positionZ] = rahmen.toLocal(field.positionX, field.positionZ)
    const ersterIdx = components.length
    const yBottom = level.bottomY
    const yTop = level.topY
    const levelH = level.heightM

    // Rahmen links + rechts
    components.push({ id: `frame-${field.id}-left`, type: 'frame', articleNumber: getFrameArticle(lengthM), name: `Rahmen ${lengthM}m`, position: [positionX - lengthM / 2 + 0.02, yBottom + levelH / 2, positionZ], rotation: [0, 0, 0], scale: [0.073, levelH, 0.04], color: colorFrame, fieldId: field.id, levelId: level.id })
    components.push({ id: `frame-${field.id}-right`, type: 'frame', articleNumber: getFrameArticle(lengthM), name: `Rahmen ${lengthM}m`, position: [positionX + lengthM / 2 - 0.02, yBottom + levelH / 2, positionZ], rotation: [0, 0, 0], scale: [0.073, levelH, 0.04], color: colorFrame, fieldId: field.id, levelId: level.id })

    // Querriegel
    components.push({ id: `rail-${field.id}-bottom`, type: 'frame', articleNumber: 'QR-001', name: 'Querriegel', position: [positionX, yBottom + 0.05, positionZ], rotation: [0, 0, 0], scale: [lengthM, 0.04, 0.04], color: colorFrame, fieldId: field.id, levelId: level.id })
    components.push({ id: `rail-${field.id}-top`, type: 'frame', articleNumber: 'QR-001', name: 'Querriegel', position: [positionX, yTop - 0.05, positionZ], rotation: [0, 0, 0], scale: [lengthM, 0.04, 0.04], color: colorFrame, fieldId: field.id, levelId: level.id })

    // Arbeitsbühne – im Treppenfeld nur die Hälfte, an der der Lauf ankommt
    // (die andere Hälfte bleibt für den nächsten Lauf offen).
    const treppenEnde = stairDeckDir.get(field.id)
    const deckL = treppenEnde ? (lengthM - 0.05) / 2 : lengthM - 0.05
    const deckX = treppenEnde ? positionX + treppenEnde * (lengthM - 0.05) / 4 : positionX
    components.push({ id: `deck-${field.id}`, type: 'deck', articleNumber: getDeckArticle(lengthM), name: `Arbeitsbühne ${lengthM}m`, position: [deckX, yTop, positionZ + widthM / 2 - 0.02], rotation: [-Math.PI / 2, 0, 0], scale: [deckL, widthM - 0.05, 0.02], color: colorDeck, fieldId: field.id, levelId: level.id })

    // Geländer
    components.push({ id: `railing-${field.id}-top`, type: 'railing', articleNumber: getRailingArticle(lengthM), name: `Geländer ${lengthM}m`, position: [positionX, yTop, positionZ + widthM / 2 + 0.02], rotation: [0, 0, 0], scale: [lengthM, 1.0, 0.04], color: colorRailing, fieldId: field.id, levelId: level.id })

    // Diagonalen (alternierend)
    if (levelIndex % 2 === 0) {
      const diagLen = Math.sqrt(lengthM * lengthM + levelH * levelH)
      components.push({ id: `diagonal-${field.id}`, type: 'diagonal', articleNumber: getDiagonalArticle(lengthM), name: `Diagonale ${lengthM}m`, position: [positionX, yBottom + levelH / 2, positionZ], rotation: [0, 0, Math.atan2(levelH, lengthM)], scale: [0.03, diagLen, 0.03], color: colorDiagonal, fieldId: field.id, levelId: level.id })
    }

    // Fußplatten (nur unterste Lage)
    if (levelIndex === 0) {
      components.push({ id: `foot-${field.id}-left`, type: 'footplate', articleNumber: 'FP-001', name: 'Fußplatte', position: [positionX - lengthM / 2 + 0.02, yBottom - 0.02, positionZ], rotation: [0, 0, 0], scale: [0.15, 0.04, 0.15], color: colorFoot, fieldId: field.id, levelId: level.id })
      components.push({ id: `foot-${field.id}-right`, type: 'footplate', articleNumber: 'FP-001', name: 'Fußplatte', position: [positionX + lengthM / 2 - 0.02, yBottom - 0.02, positionZ], rotation: [0, 0, 0], scale: [0.15, 0.04, 0.15], color: colorFoot, fieldId: field.id, levelId: level.id })
    }

    // Kupplungen
    components.push({ id: `coupling-${field.id}-1`, type: 'coupling', articleNumber: 'KU-001', name: 'Kupplung', position: [positionX - lengthM / 2 + 0.02, yTop, positionZ], rotation: [0, 0, 0], scale: [0.05, 0.05, 0.05], color: colorFrame, fieldId: field.id, levelId: level.id })
    components.push({ id: `coupling-${field.id}-2`, type: 'coupling', articleNumber: 'KU-001', name: 'Kupplung', position: [positionX + lengthM / 2 - 0.02, yTop, positionZ], rotation: [0, 0, 0], scale: [0.05, 0.05, 0.05], color: colorFrame, fieldId: field.id, levelId: level.id })

    // Bordbretter
    components.push({ id: `board-${field.id}`, type: 'board', articleNumber: 'BB-001', name: `Bordbrett ${lengthM}m`, position: [positionX, yTop + 0.3, positionZ - widthM / 2 - 0.02], rotation: [0, 0, 0], scale: [lengthM, 0.19, 0.02], color: colorBoard, fieldId: field.id, levelId: level.id })

    // Dachrand-Absturzschutz (optional, nur Flachdach, nicht bei gestuften Gebäuden):
    // auf der obersten Lage ein zusätzliches Geländer, dessen Handlauf 1,0 m über der
    // Dachkante bzw. dem Belag (je nachdem, was höher liegt) endet, mit Pfosten an den
    // Feldenden. ANNAHME: Maß 1,0 m – Anforderungen der Norm/BG bitte prüfen.
    if (dachrandSchutz && !fields.some((g) => g.side === side && g.levelIndex === levelIndex + 1 && Math.abs(g.positionX - field.positionX) < 0.01 && Math.abs(g.positionZ - field.positionZ) < 0.01)) {
      const basisY = Math.max(yTop, building.heightM)
      const zAussen = positionZ + widthM / 2 + 0.02
      components.push({ id: `dachrand-${field.id}`, type: 'railing', articleNumber: getRailingArticle(lengthM), name: `Dachrand-Geländer ${lengthM}m`, position: [positionX, basisY + 0.5, zAussen], rotation: [0, 0, 0], scale: [lengthM, 1.0, 0.04], color: colorRailing, fieldId: field.id, levelId: level.id })
      const pfostenH = basisY + 1.0 - yTop
      for (const [tag, sx] of [['l', -1], ['r', 1]] as const) {
        components.push({ id: `dachrand-${field.id}-pfosten-${tag}`, type: 'railing', articleNumber: 'SG-001', name: 'Dachrand-Pfosten', position: [positionX + sx * (lengthM / 2 - 0.02), yTop + pfostenH / 2, zAussen], rotation: [0, 0, 0], scale: [0.04, pfostenH, 0.04], color: colorRailing, fieldId: field.id, levelId: level.id })
      }
    }

    for (let ci = ersterIdx; ci < components.length; ci++) bauteilInWelt(components[ci], rahmen)
  })

  // === ECKFELDER (geschlossener Umlauf) ===
  // Wo zwei benachbarte Seiten (vorne/hinten + links/rechts) beide gerüstet sind,
  // bleibt zwischen den Seiten eine Lücke. Pro Lage wird sie mit einem Eckbelag,
  // einem Eckpfosten außen und zwei Geländern an den Außenkanten geschlossen.
  {
    const aktiveSeiten = new Set(fields.map((f) => f.side))
    const sw = fields[0]?.widthM ?? 0.73
    for (const fb of ['front', 'back'] as const) {
      for (const lr of ['left', 'right'] as const) {
        if (!aktiveSeiten.has(fb) || !aktiveSeiten.has(lr)) continue
        const lageIdxs = [...new Set(fields.filter((f) => f.side === fb).map((f) => f.levelIndex))]
        for (const idx of lageIdxs) {
          const level = levels.find((l) => l.index === idx)
          const fbF = fields.filter((f) => f.side === fb && f.levelIndex === idx)
          const lrF = fields.filter((f) => f.side === lr && f.levelIndex === idx)
          if (!level || fbF.length === 0 || lrF.length === 0) continue
          // Außenkante der Querseite (links: -x, rechts: +x) und Ende der Längsseite
          const xEnde = lr === 'left' ? Math.min(...fbF.map((f) => f.positionX - f.lengthM / 2)) : Math.max(...fbF.map((f) => f.positionX + f.lengthM / 2))
          const xAussen = lr === 'left' ? lrF[0].positionX - sw : lrF[0].positionX + sw
          const zEnde = fb === 'front' ? Math.max(...lrF.map((f) => f.positionZ + f.lengthM / 2)) : Math.min(...lrF.map((f) => f.positionZ - f.lengthM / 2))
          const zAussen = fb === 'front' ? fbF[0].positionZ + sw : fbF[0].positionZ - sw
          const dx = Math.abs(xAussen - xEnde)
          const dz = Math.abs(zAussen - zEnde)
          if (dx < 0.05 || dz < 0.05 || dx > 3 || dz > 3) continue
          const cx = (xEnde + xAussen) / 2
          const cz = (zEnde + zAussen) / 2
          const yTop = level.topY
          const idBase = `corner-${fb}-${lr}-${idx}`
          components.push({ id: `${idBase}-deck`, type: 'deck', articleNumber: 'AB-001', name: 'Eckbelag', position: [cx, yTop, cz], rotation: [-Math.PI / 2, 0, 0], scale: [dx - 0.04, dz - 0.04, 0.02], color: colorDeck, levelId: level.id })
          components.push({ id: `${idBase}-post`, type: 'frame', articleNumber: 'RA-001', name: 'Eckpfosten', position: [xAussen + (lr === 'left' ? 0.04 : -0.04), level.bottomY + level.heightM / 2, zAussen + (fb === 'front' ? -0.04 : 0.04)], rotation: [0, 0, 0], scale: [0.073, level.heightM, 0.04], color: colorFrame, levelId: level.id })
          // Geländer an den zwei Außenkanten
          components.push({ id: `${idBase}-rail-x`, type: 'railing', articleNumber: 'GE-001', name: 'Eckgeländer', position: [cx, yTop, zAussen + (fb === 'front' ? 0.02 : -0.02)], rotation: [0, 0, 0], scale: [dx, 1.0, 0.04], color: colorRailing, levelId: level.id })
          components.push({ id: `${idBase}-rail-z`, type: 'railing', articleNumber: 'GE-001', name: 'Eckgeländer', position: [xAussen + (lr === 'left' ? -0.02 : 0.02), yTop, cz], rotation: [0, Math.PI / 2, 0], scale: [dz, 1.0, 0.04], color: colorRailing, levelId: level.id })
          if (idx === 0) {
            components.push({ id: `${idBase}-foot`, type: 'footplate', articleNumber: 'FP-001', name: 'Fußplatte', position: [xAussen + (lr === 'left' ? 0.04 : -0.04), level.bottomY - 0.02, zAussen + (fb === 'front' ? -0.04 : 0.04)], rotation: [0, 0, 0], scale: [0.15, 0.04, 0.15], color: colorFoot, levelId: level.id })
          }
        }
      }
    }
  }

  // === ECKVERBINDUNGEN ===
  // Finde Eck-Felder (erstes/letztes Feld jeder Seite)
  const sideGroups = new Map<string, ScaffoldField[]>()
  fields.forEach(f => {
    if (!sideGroups.has(f.side)) sideGroups.set(f.side, [])
    sideGroups.get(f.side)!.push(f)
  })

  sideGroups.forEach((sideFields, side) => {
    const uniqueLevels = [...new Set(sideFields.map(f => f.levelIndex))]
    uniqueLevels.forEach(levelIdx => {
      const levelFields = sideFields.filter(f => f.levelIndex === levelIdx)
      if (levelFields.length === 0) return
      const level = levels.find(l => l.index === levelIdx)
      if (!level) return

      // Erstes und letztes Feld jeder Seite bekommen Eckdiagonale
      const firstField = levelFields[0]
      const lastField = levelFields[levelFields.length - 1]

      if (firstField && lastField && firstField.id !== lastField.id) {
        // Eck-Diagonale zwischen den Seiten
        const cornerX = side === 'front' || side === 'back' ? firstField.positionX - firstField.lengthM / 2 : firstField.positionX
        const cornerZ = side === 'left' || side === 'right' ? firstField.positionZ - firstField.widthM / 2 : firstField.positionZ

        components.push({
          id: `corner-${side}-${levelIdx}`,
          type: 'corner_brace',
          articleNumber: 'EW-001',
          name: 'Eckverbindung',
          position: [cornerX, level.bottomY + level.heightM / 2, cornerZ],
          rotation: [0, side === 'front' || side === 'back' ? Math.PI / 4 : -Math.PI / 4, 0],
          scale: [0.03, level.heightM, 0.03],
          color: colorCorner,
          levelId: level.id
        })
      }
    })
  })

  // === VERANKERUNGEN ===
  model.anchors.forEach((anchor) => {
    components.push({ id: `anchor-${anchor.id}`, type: 'anchor', articleNumber: 'AN-001', name: 'Fassadenanker', position: [anchor.positionX, anchor.positionY, anchor.positionZ], rotation: [0, 0, 0], scale: [0.08, 0.08, 0.3], color: colorAnchor })
  })

  // === KONSOLEN ===
  if (building.overhangM > 0.3) {
    const topLevel = levels[levels.length - 1]
    if (topLevel) {
      const consoleCount = Math.ceil(model.fieldCount * (building.overhangM / 0.73))
      for (let i = 0; i < consoleCount; i++) {
        const field = fields[i % fields.length]
        if (!fields.some((g) => g.side === field.side && g.levelIndex === topLevel.index && Math.abs(g.positionX - field.positionX) < 0.01 && Math.abs(g.positionZ - field.positionZ) < 0.01)) continue
        const rf = seitenRahmen(field.side, building)
        const [lx, lz] = rf.toLocal(field.positionX, field.positionZ)
        const [wx, wz] = rf.toWorld(lx, lz + field.widthM / 2 + 0.3)
        components.push({ id: `console-${i}`, type: 'console', articleNumber: 'KO-001', name: 'Konsole 0,73m', position: [wx, topLevel.topY, wz], rotation: eulerMitYaw([0, 0, 0], rf.yaw), scale: [0.73, 0.04, 0.3], color: colorConsole, levelId: topLevel.id })
      }
    }
  }

  // === TREPPEN (Scaffmax-Stil: Zickzack-Läufe im Feld) ===
  for (const plan of stairPlans) {
    const { i, covered, field: sf, level } = plan
    const totalStairHeight = level.heightM * covered
    const stairL = Math.max(1.0, sf.lengthM - 0.25)
    const stairW = Math.max(0.4, sf.widthM * 0.8)
    const stairX = sf.positionX
    const stairZ = sf.positionZ + sf.widthM / 2 - 0.02 // gleiche Lage wie der Belag
    const startDir: 1 | -1 = i % 2 === 0 ? 1 : -1

    // Treppen-Rahmen (Holme der Läufe, siehe Variante in Scaffold3D)
    components.push({ id: `stair-frame-${i}`, type: 'stair', articleNumber: 'SP-001', name: 'Spindeltreppe', position: [stairX, level.bottomY + totalStairHeight / 2, stairZ], rotation: [0, 0, 0], scale: [stairL, totalStairHeight, stairW], color: colorStair, levelId: level.id, flights: covered, flightStartDir: startDir })

    // Stufen: je Lage ein Lauf, Richtung wechselt je Lage (Zickzack)
    const perFlight = Math.max(1, Math.round(level.heightM / 0.25))
    const tread = (stairL - 0.2) / perFlight
    let stepNo = 0
    for (let fl = 0; fl < covered; fl++) {
      const dir = (i + fl) % 2 === 0 ? 1 : -1
      const x0 = dir > 0 ? stairX - stairL / 2 + 0.1 : stairX + stairL / 2 - 0.1
      for (let k = 0; k < perFlight; k++) {
        const stepY = level.bottomY + fl * level.heightM + (k + 1) * (level.heightM / perFlight) - 0.04
        components.push({ id: `stair-step-${i}-${stepNo++}`, type: 'deck', articleNumber: 'ST-001', name: 'Treppenstufe', position: [x0 + dir * (k + 0.5) * tread, stepY, stairZ], rotation: [0, 0, 0], scale: [tread * 0.92, 0.04, stairW - 0.08], color: '#a0a0a0', levelId: level.id })
      }
    }

    // Endpfosten des Treppenturms
    components.push({ id: `stair-rail-${i}`, type: 'railing', articleNumber: 'SG-001', name: 'Treppengeländer', position: [stairX - stairL / 2, level.bottomY + totalStairHeight / 2, stairZ], rotation: [0, 0, 0], scale: [0.04, totalStairHeight, 0.04], color: colorRailing, levelId: level.id })
    components.push({ id: `stair-rail-${i}-2`, type: 'railing', articleNumber: 'SG-001', name: 'Treppengeländer', position: [stairX + stairL / 2, level.bottomY + totalStairHeight / 2, stairZ], rotation: [0, 0, 0], scale: [0.04, totalStairHeight, 0.04], color: colorRailing, levelId: level.id })
  }

  // === FANGNETZE ===
  if (building.heightM > 12) {
    const netArea = building.lengthM * building.heightM * 0.3
    const netCount = Math.ceil(netArea / 25)
    for (let i = 0; i < Math.min(netCount, 5); i++) {
      const level = levels[Math.min(i + 2, levels.length - 1)]
      const field = fields[i % fields.length]
      if (level && field && fields.some((g) => g.side === field.side && g.levelIndex === level.index && Math.abs(g.positionX - field.positionX) < 0.01)) {
        const rf = seitenRahmen(field.side, building)
        const [lx, lz] = rf.toLocal(field.positionX, field.positionZ)
        const [wx, wz] = rf.toWorld(lx, lz + field.widthM / 2 + 0.05)
        components.push({ id: `net-${i}`, type: 'net', articleNumber: 'FN-001', name: 'Fangnetz', position: [wx, level.topY - 0.5, wz], rotation: eulerMitYaw([0, 0, 0], rf.yaw), scale: [field.lengthM, 1.5, 0.01], color: colorNet, levelId: level.id })
      }
    }
  }

  // === SCHUTZDÄCHER ===
  // Höhe des Gebäudes an der Stelle x (bei Höhenstufen die des jeweiligen Abschnitts)
  const hoeheBeiX = (x: number): number => {
    if (!hatGeradeAbschnitte(building)) return building.heightM
    let cur = -building.lengthM / 2
    for (const sec of building.sections!) {
      if (x < cur + sec.laengeM) return sec.hoeheM
      cur += sec.laengeM
    }
    return building.sections![building.sections!.length - 1].hoeheM
  }
  if (building.heightM > 15 || building.overhangM > 0.5) {
    const roofCount = Math.max(1, Math.ceil(building.lengthM / 6))
    for (let i = 0; i < roofCount; i++) {
      const xPos = (i * 6) - building.lengthM / 2 + 3
      components.push({ id: `roof-${i}`, type: 'protection_roof', articleNumber: 'SD-001', name: 'Schutzdach', position: [xPos, hoeheBeiX(xPos) + 0.5, 0.5], rotation: [0.3, 0, 0], scale: [6, 0.1, 2], color: colorRoof })
    }
  }

  // === LASTVERTEILPLATTEN ===
  const loadPlateCount = Math.ceil(fields.filter(f => f.levelIndex === 0).length * 2 * 0.5)
  for (let i = 0; i < loadPlateCount; i++) {
    const field = fields[i % fields.length]
    if (field.levelIndex === 0) {
      const rf = seitenRahmen(field.side, building)
      const [lx, lz] = rf.toLocal(field.positionX, field.positionZ)
      const [wx, wz] = rf.toWorld(lx - field.lengthM / 2 + 0.02, lz)
      components.push({ id: `loadplate-${i}`, type: 'load_plate', articleNumber: 'LV-001', name: 'Lastverteilplatte', position: [wx, -0.04, wz], rotation: [0, 0, 0], scale: [0.3, 0.04, 0.3], color: colorLoadPlate, fieldId: field.id })
    }
  }

  return components
}

function getFrameArticle(fieldLengthM: number): string {
  if (fieldLengthM >= 3.0) return 'RA-003'
  if (fieldLengthM >= 2.5) return 'RA-002'
  return 'RA-001'
}

function getDeckArticle(fieldLengthM: number): string {
  if (fieldLengthM >= 3.0) return 'AB-003'
  if (fieldLengthM >= 2.5) return 'AB-002'
  return 'AB-001'
}

function getRailingArticle(fieldLengthM: number): string {
  if (fieldLengthM >= 3.0) return 'GE-003'
  if (fieldLengthM >= 2.5) return 'GE-002'
  return 'GE-001'
}

function getDiagonalArticle(fieldLengthM: number): string {
  if (fieldLengthM >= 3.0) return 'DI-003'
  if (fieldLengthM >= 2.5) return 'DI-002'
  return 'DI-001'
}

export function generateCADModel(
  building: BuildingParams,
  systemId: string,
  scaffoldWidthM: number = 0.73,
  distanceToBuildingM: number = 0.3
): CADModel {
  const system = findeSystem(systemId)
  const warnings: CADWarning[] = []

  if (building.lengthM <= 0) warnings.push({ type: 'error', code: 'BUILDING_LENGTH_ZERO', message: 'Gebäudelänge muss größer als 0 sein.' })
  // Mehrteiliges Gebäude: bei geraden Abschnitten (Höhenstufen) folgt das
  // Gerüst den Abschnitten. Länge/Höhe des Modells werden dann aus den
  // Abschnitten abgeleitet (Summe / höchster Abschnitt).
  const abschnitte: BuildingSection[] | null = hatGeradeAbschnitte(building) ? building.sections! : null
  if (abschnitte) {
    building = {
      ...building,
      lengthM: Math.round(abschnitte.reduce((sum, a) => sum + a.laengeM, 0) * 100) / 100,
      heightM: Math.max(...abschnitte.map((a) => a.hoeheM)),
    }
    warnings.push({ type: 'info', code: 'SECTIONS_SCAFFOLD_STEPPED', message: 'Das Gerüst folgt den Höhenstufen der Abschnitte (je Abschnitt eigene Lagenzahl). Die senkrechten Stirnseiten der Stufen und die Seitenflächen sind nicht gesondert eingerüstet.' })
  } else if (building.sections && building.sections.length >= 2) {
    warnings.push({ type: 'info', code: 'SECTIONS_SCAFFOLD_NOT_YET', message: 'Die Gebäudeform zeigt alle Abschnitte. Das Gerüst folgt aber nur geraden Abschnitten (Höhensprünge ohne Winkel). Bei Ecken (Winkel ≠ 0) wird das Gerüst noch anhand der einzelnen Länge/Höhe-Felder erzeugt.' })
  }
  if (building.heightM <= 0) warnings.push({ type: 'error', code: 'BUILDING_HEIGHT_ZERO', message: 'Gebäudehöhe muss größer als 0 sein.' })
  if (building.heightM > 40) warnings.push({ type: 'warning', code: 'HEIGHT_VERY_HIGH', message: 'Gebäudehöhe > 40m – Statik prüfen lassen!' })

  const fieldDiv = system ? calculateFieldDivision(building.lengthM, system) : { fields: 1, fieldLengthM: 2.07, remainderM: 0, distribution: [2.07] }
  const fieldDivWidth = system ? calculateFieldDivision(building.widthM, system) : { fields: 1, fieldLengthM: 2.07, remainderM: 0, distribution: [2.07] }
  const levelCalc = system ? calculateLevels(building.heightM, system) : { levels: 1, levelHeightM: 2.0, levelsData: [{ index: 0, bottomY: 0, topY: 2.0 }] }

  const fields: ScaffoldField[] = []
  const levels: ScaffoldLevel[] = []

  // Bestimme zu bebauende Seiten
  const activeSides: ('front' | 'back' | 'left' | 'right')[] = building.sides && building.sides.length > 0 ? building.sides : ['front']

  const abschnittsAnker: ScaffoldAnchor[] = []
  const abschnittDivs = abschnitte
    ? abschnitte.map((sec) => system ? calculateFieldDivision(sec.laengeM, system) : { fields: 1, fieldLengthM: 2.07, remainderM: 0, distribution: [2.07] })
    : null

  for (const side of activeSides) {
    if (abschnitte && abschnittDivs) {
      // --- Gestuftes Gebäude: je Abschnitt eigene Felder/Lagen ---
      const w = building.widthM || 0
      const runs: { div: typeof fieldDiv; hoeheM: number; along: number }[] = []
      if (side === 'front' || side === 'back') {
        let cursor = -building.lengthM / 2
        abschnitte.forEach((sec, si) => { runs.push({ div: abschnittDivs[si], hoeheM: sec.hoeheM, along: cursor }); cursor += sec.laengeM })
      } else {
        const sec = side === 'left' ? abschnitte[0] : abschnitte[abschnitte.length - 1]
        runs.push({ div: fieldDivWidth, hoeheM: sec.hoeheM, along: -w - 0.5 })
      }
      // Lage der inneren Gerüstlinie je Seite (Gebäude ist 0,5 m nach hinten versetzt)
      const fixed = side === 'front' ? distanceToBuildingM
        : side === 'back' ? -distanceToBuildingM - w - 1
        : side === 'left' ? -building.lengthM / 2 - 0.5 - distanceToBuildingM
        : building.lengthM / 2 + 0.5 + distanceToBuildingM
      const proLage = new Map<number, ScaffoldField[]>()
      runs.forEach((run, ri) => {
        const rl = system ? calculateLevels(run.hoeheM, system) : levelCalc
        rl.levelsData.forEach((levelData) => {
          let cum = 0
          run.div.distribution.forEach((fieldLength, fi) => {
            const list = proLage.get(levelData.index) || []
            const along = run.along + cum + fieldLength / 2
            cum += fieldLength
            const isFB = side === 'front' || side === 'back'
            const field: ScaffoldField = {
              id: `field-${side}-${levelData.index}-${list.length}`,
              index: list.length,
              lengthM: fieldLength,
              widthM: scaffoldWidthM,
              positionX: parseFloat((isFB ? along : fixed).toFixed(3)),
              positionY: levelData.bottomY,
              positionZ: parseFloat((isFB ? fixed : along).toFixed(3)),
              side: side as 'front' | 'back' | 'left' | 'right',
              levelIndex: levelData.index,
              isCorner: (ri === 0 && fi === 0) || (ri === runs.length - 1 && fi === run.div.distribution.length - 1),
            }
            list.push(field)
            proLage.set(levelData.index, list)
            fields.push(field)
          })
        })
        // Verankerungen je Abschnitt
        if (run.hoeheM > 6) {
          const anchorLevels = Math.floor(rl.levels / 2)
          for (let al = 0; al < anchorLevels; al++) {
            const yAnchor = (al * 2 + 2) * levelCalc.levelHeightM
            for (let f = 0; f < run.div.fields; f += 2) {
              const along = run.along + f * run.div.fieldLengthM + run.div.fieldLengthM / 2
              let xPos = 0, zPos = 0
              if (side === 'front') { xPos = along; zPos = distanceToBuildingM + scaffoldWidthM / 2 }
              else if (side === 'back') { xPos = along; zPos = -distanceToBuildingM - scaffoldWidthM / 2 - w - 1 }
              else { xPos = side === 'left' ? fixed - scaffoldWidthM / 2 : fixed + scaffoldWidthM / 2; zPos = along }
              abschnittsAnker.push({ id: `anchor-${side}-${ri}-${al}-${f}`, positionX: xPos, positionY: yAnchor, positionZ: zPos, side: side as 'front' | 'back' | 'left' | 'right', type: 'fassadenanker' })
            }
          }
        }
      })
      levelCalc.levelsData.forEach((levelData) => {
        levels.push({ id: `level-${side}-${levelData.index}`, index: levelData.index, heightM: levelCalc.levelHeightM, bottomY: levelData.bottomY, topY: levelData.topY, fields: proLage.get(levelData.index) || [] })
      })
      continue
    }
    // Positionierung je Seite
    let zOffset = 0
    let xOffset = 0
    let useLengthDiv = fieldDiv
    let rotation = 0

    switch (side) {
      case 'front':
        zOffset = distanceToBuildingM
        useLengthDiv = fieldDiv
        break
      case 'back':
        zOffset = -distanceToBuildingM - (building.widthM || 0) - 1
        useLengthDiv = fieldDiv
        break
      case 'left':
        xOffset = -building.lengthM / 2 - 0.5 - distanceToBuildingM
        useLengthDiv = fieldDivWidth
        rotation = Math.PI / 2
        break
      case 'right':
        xOffset = building.lengthM / 2 + 0.5 + distanceToBuildingM
        useLengthDiv = fieldDivWidth
        rotation = Math.PI / 2
        break
    }

    levelCalc.levelsData.forEach((levelData) => {
      const levelId = `level-${side}-${levelData.index}`
      const levelFields: ScaffoldField[] = []

      useLengthDiv.distribution.forEach((fieldLength, fieldIndex) => {
        const fieldId = `field-${side}-${levelData.index}-${fieldIndex}`
        const totalLength = useLengthDiv.distribution.reduce((a, b) => a + b, 0)

        let xPos = 0
        let zPos = 0

        if (side === 'front' || side === 'back') {
          xPos = fieldIndex * fieldLength - totalLength / 2 + fieldLength / 2
          zPos = zOffset
        } else {
          xPos = xOffset
          zPos = fieldIndex * fieldLength - totalLength / 2 + fieldLength / 2 - (building.widthM || 0) / 2 - 0.5
        }

        const isCorner = fieldIndex === 0 || fieldIndex === useLengthDiv.distribution.length - 1

        const field: ScaffoldField = {
          id: fieldId,
          index: fieldIndex,
          lengthM: fieldLength,
          widthM: scaffoldWidthM,
          positionX: parseFloat(xPos.toFixed(3)),
          positionY: levelData.bottomY,
          positionZ: parseFloat(zPos.toFixed(3)),
          side: side as 'front' | 'back' | 'left' | 'right',
          levelIndex: levelData.index,
          isCorner
        }
        fields.push(field)
        levelFields.push(field)
      })

      levels.push({ id: levelId, index: levelData.index, heightM: levelCalc.levelHeightM, bottomY: levelData.bottomY, topY: levelData.topY, fields: levelFields })
    })
  }

  // Verankerungen (alle Seiten)
  const anchors: ScaffoldAnchor[] = []
  if (abschnitte) anchors.push(...abschnittsAnker)
  else if (building.heightM > 6) {
    const anchorLevels = Math.floor(levelCalc.levelsData.length / 2)
    for (const side of activeSides) {
      for (let al = 0; al < anchorLevels; al++) {
        const yAnchor = (al * 2 + 2) * levelCalc.levelHeightM
        const div = side === 'front' || side === 'back' ? fieldDiv : fieldDivWidth
        for (let f = 0; f < div.fields; f += 2) {
          const totalLength = div.distribution.reduce((a, b) => a + b, 0)
          const pos = f * div.fieldLengthM - totalLength / 2 + div.fieldLengthM / 2

          let xPos = 0
          let zPos = 0
          if (side === 'front') { xPos = pos; zPos = distanceToBuildingM + scaffoldWidthM / 2 }
          else if (side === 'back') { xPos = pos; zPos = -distanceToBuildingM - scaffoldWidthM / 2 - (building.widthM || 0) - 1 }
          else if (side === 'left') { xPos = -building.lengthM / 2 - 0.5 - distanceToBuildingM - scaffoldWidthM / 2; zPos = pos - (building.widthM || 0) / 2 - 0.5 }
          else if (side === 'right') { xPos = building.lengthM / 2 + 0.5 + distanceToBuildingM + scaffoldWidthM / 2; zPos = pos - (building.widthM || 0) / 2 - 0.5 }

          anchors.push({ id: `anchor-${side}-${al}-${f}`, positionX: xPos, positionY: yAnchor, positionZ: zPos, side: side as 'front' | 'back' | 'left' | 'right', type: 'fassadenanker' })
        }
      }
    }
  }

  const preliminaryModel: CADModel = {
    building,
    system,
    fields,
    levels,
    anchors,
    components3D: [],
    totalLengthM: abschnitte ? building.lengthM : fieldDiv.fields * fieldDiv.fieldLengthM,
    totalHeightM: building.heightM,
    totalAreaM2: abschnitte ? abschnitte.reduce((sum, a) => sum + a.laengeM * a.hoeheM, 0) : building.lengthM * building.heightM,
    fieldCount: abschnittDivs ? abschnittDivs.reduce((sum, d) => sum + d.fields, 0) : fieldDiv.fields,
    levelCount: levelCalc.levels,
    warnings
  }

  const components3D = generateScaffoldComponents(preliminaryModel)
  return { ...preliminaryModel, components3D }
}

/** Feste Artikelnummer der Leiter im Lager (jede Firma pflegt Name, Preis und Gewicht selbst). */
export const LEITER_ARTIKELNUMMER = 'LE-001'

export function generateBillOfMaterials(model: CADModel): MaterialItem[] {
  const counts: Record<string, { name: string; category: string; quantity: number; unit: string; unitPrice: number; weightKg: number; articleNumber: string }> = {}
  model.components3D.forEach((comp) => {
    const key = comp.articleNumber
    if (!counts[key]) {
      counts[key] = { name: comp.name, category: getCategoryFromType(comp.type), quantity: 0, unit: getUnit(comp.type), unitPrice: getUnitPrice(key), weightKg: getWeightKg(key), articleNumber: key }
    }
    counts[key].quantity += 1
  })
  return Object.values(counts).map((item) => ({ ...item, totalPrice: Math.round(item.quantity * item.unitPrice * 100) / 100, riskLevel: 'low', aiRecommendation: getRecommendation(item.articleNumber) }))
}

function getCategoryFromType(type: ScaffoldComponent3D['type']): string {
  const map: Record<string, string> = { frame: 'Rahmen', deck: 'Belag', railing: 'Geländer', diagonal: 'Diagonalen', footplate: 'Fundamente', coupling: 'Kupplungen', anchor: 'Anker', console: 'Konsolen', stair: 'Treppen', net: 'Sicherheit', board: 'Bordbretter', protection_roof: 'Sicherheit', safety_net: 'Sicherheit', load_plate: 'Fundamente', corner_brace: 'Eckverbindungen', ladder: 'Leitern' }
  return map[type] || 'Sonstiges'
}

function getUnit(type: ScaffoldComponent3D['type']): string {
  if (type === 'net' || type === 'safety_net') return 'm²'
  return 'Stk'
}

function getUnitPrice(articleNumber: string): number {
  const prices: Record<string, number> = { 'RA-001': 45, 'RA-002': 52, 'RA-003': 58, 'AB-001': 85, 'AB-002': 98, 'AB-003': 112, 'DI-001': 28, 'DI-002': 32, 'DI-003': 36, 'GE-001': 35, 'GE-002': 40, 'GE-003': 45, 'FP-001': 18, 'KU-001': 4.5, 'AN-001': 15, 'QR-001': 12, 'KO-001': 32, 'SP-001': 450, 'FN-001': 4.2, 'SD-001': 850, 'BB-001': 22, 'LV-001': 45, 'EW-001': 25, 'ST-001': 15, 'SG-001': 28 }
  // Leiter: bewusst KEIN Fantasiepreis – Preis kommt aus dem Lager der Firma (Artikel LE-001).
  if (articleNumber === LEITER_ARTIKELNUMMER) return 0
  return prices[articleNumber] || 10
}

function getWeightKg(articleNumber: string): number {
  const weights: Record<string, number> = { 'RA-001': 12.5, 'RA-002': 15.2, 'RA-003': 18.0, 'AB-001': 22, 'AB-002': 26, 'AB-003': 31, 'DI-001': 8.5, 'DI-002': 9.8, 'DI-003': 11.2, 'GE-001': 7.2, 'GE-002': 8.5, 'GE-003': 9.8, 'FP-001': 5.5, 'KU-001': 0.8, 'AN-001': 2.5, 'QR-001': 3.5, 'KO-001': 9.0, 'SP-001': 85.0, 'FN-001': 0.5, 'SD-001': 120.0, 'BB-001': 6.5, 'LV-001': 18.0, 'EW-001': 4.2, 'ST-001': 2.8, 'SG-001': 5.5 }
  if (articleNumber === LEITER_ARTIKELNUMMER) return 0
  return weights[articleNumber] || 5
}

function getRecommendation(articleNumber: string): string {
  const recs: Record<string, string> = { 'RA-001': 'Standard-Rahmen für Feldlänge 2,07 m', 'RA-002': 'Für breitere Felder', 'RA-003': 'Für große Feldlängen', 'AB-001': 'Standard-Arbeitsbühne', 'AB-002': 'Für 2,50 m Feldlänge', 'AB-003': 'Für 3,00 m Feldlänge', 'DI-001': 'Stabilisierung je Feld', 'DI-002': 'Stabilisierung 2,50 m', 'DI-003': 'Stabilisierung 3,00 m', 'GE-001': 'Brüstungsgeländer', 'GE-002': 'Geländer 2,50 m', 'GE-003': 'Geländer 3,00 m', 'FP-001': 'Grundplatte je Standfuß', 'KU-001': 'Verbindung Rahmen/Diagonale', 'AN-001': 'Standard-Fassadenanker', 'QR-001': 'Querriegel', 'KO-001': 'Für Überstände und Dacharbeiten', 'SP-001': 'Zugang je 3–4 Ebenen', 'FN-001': 'Fangnetz bei Höhe > 12m', 'SD-001': 'Schutzdach öffentlicher Raum', 'BB-001': 'Seitenschutz/Absturzsicherung', 'LV-001': 'Bei weichem Untergrund', 'EW-001': 'Eckverstrebung', 'ST-001': 'Treppenstufe', 'SG-001': 'Treppengeländer', 'LE-001': 'Schematische Leiter – Preis, Gewicht und Name im Lager pflegen' }
  return recs[articleNumber] || 'Standard-Bauteil'
}

export function checkCollisions(model: CADModel): CADWarning[] {
  const warnings: CADWarning[] = []
  if (model.system && model.building.widthM > 0) {
    const scaffoldDepth = model.system.rahmenBreitenM[0] || 0.73
    const minDistance = 0.3
    if (scaffoldDepth + minDistance > model.building.widthM / 2) {
      warnings.push({ type: 'warning', code: 'SCAFFOLD_TOO_DEEP', message: 'Gerüsttiefe überschreitet Gebäudebreite.' })
    }
  }
  if (model.fieldCount > 0 && model.building.lengthM > 0) {
    const actualLength = model.fields.reduce((sum, f) => sum + f.lengthM, 0) / model.levelCount
    const diff = Math.abs(actualLength - model.building.lengthM)
    if (diff > (model.fields[0]?.lengthM || 0)) {
      warnings.push({ type: 'warning', code: 'FIELD_MISMATCH', message: 'Feldaufteilung weicht von Gebäudelänge ab.' })
    }
  }
  return warnings
}

export interface Projection2D {
  type: 'grundriss' | 'ansicht' | 'schnitt'
  viewBox: { minX: number; minY: number; width: number; height: number }
  elements: SVGElement2D[]
  dimensions: Dimension2D[]
}

export interface SVGElement2D {
  id: string
  type: 'rect' | 'line' | 'circle' | 'text' | 'path'
  x: number
  y: number
  width?: number
  height?: number
  x2?: number
  y2?: number
  r?: number
  d?: string
  text?: string
  stroke?: string
  fill?: string
  strokeWidth?: number
}

export interface Dimension2D {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  value: string
  label: string
  offsetX?: number
  offsetY?: number
}

export function generateGrundriss(model: CADModel): Projection2D {
  const { building, fields } = model
  const margin = 2
  const width = building.lengthM + margin * 2
  const depth = building.widthM + margin * 2 || 10
  const elements: SVGElement2D[] = []
  const dimensions: Dimension2D[] = []

  elements.push({ id: 'building', type: 'rect', x: 0, y: 0, width: building.lengthM, height: building.widthM || 6, fill: '#e2e8f0', stroke: '#475569', strokeWidth: 2 })

  const scaffoldWidth = model.system?.rahmenBreitenM[0] || 0.73
  fields.filter((f) => f.levelIndex === 0).forEach((field) => {
    elements.push({ id: `field-${field.id}`, type: 'rect', x: field.positionX - field.lengthM / 2, y: field.positionZ, width: field.lengthM, height: scaffoldWidth, fill: 'none', stroke: '#3b82f6', strokeWidth: 1.5 })
  })

  dimensions.push({ id: 'dim-length', fromX: 0, fromY: (building.widthM || 6) + 0.5, toX: building.lengthM, toY: (building.widthM || 6) + 0.5, value: `${building.lengthM.toFixed(2)} m`, label: 'Gebäudelänge', offsetY: 0.5 })
  dimensions.push({ id: 'dim-width', fromX: building.lengthM + 0.5, fromY: 0, toX: building.lengthM + 0.5, toY: building.widthM || 6, value: `${(building.widthM || 6).toFixed(2)} m`, label: 'Gebäudebreite', offsetX: 0.5 })

  return { type: 'grundriss', viewBox: { minX: -margin, minY: -margin, width, height: depth }, elements, dimensions }
}

export function generateAnsicht(model: CADModel): Projection2D {
  const { building, fields, levels } = model
  const margin = 2
  const width = building.lengthM + margin * 2
  const height = building.heightM + margin * 2
  const elements: SVGElement2D[] = []
  const dimensions: Dimension2D[] = []

  elements.push({ id: 'building-face', type: 'rect', x: 0, y: 0, width: building.lengthM, height: building.heightM, fill: '#f1f5f9', stroke: '#64748b', strokeWidth: 1 })

  if (building.roofForm !== 'kein') {
    elements.push({ id: 'roof', type: 'path', x: 0, y: 0, d: `M 0,${building.heightM} L ${building.lengthM / 2},${building.heightM + 1.5} L ${building.lengthM},${building.heightM} Z`, fill: '#94a3b8', stroke: '#475569', strokeWidth: 1 })
  }

  levels.forEach((level) => {
    level.fields.forEach((field) => {
      elements.push({ id: `scaffold-${field.id}`, type: 'rect', x: field.positionX - field.lengthM / 2, y: level.bottomY, width: field.lengthM, height: level.heightM, fill: 'none', stroke: '#3b82f6', strokeWidth: 1.5 })
    })
  })

  dimensions.push({ id: 'dim-total-height', fromX: -0.5, fromY: 0, toX: -0.5, toY: building.heightM, value: `${building.heightM.toFixed(2)} m`, label: 'Gebäudehöhe', offsetX: -0.8 })
  dimensions.push({ id: 'dim-scaffold-height', fromX: building.lengthM + 0.5, fromY: 0, toX: building.lengthM + 0.5, toY: levels[levels.length - 1]?.topY || building.heightM, value: `${(levels[levels.length - 1]?.topY || building.heightM).toFixed(2)} m`, label: 'Gerüsthöhe', offsetX: 0.8 })

  return { type: 'ansicht', viewBox: { minX: -margin, minY: -margin, width, height }, elements, dimensions }
}

// ============================================================
// PHASE 2 ERWEITERUNGEN
// ============================================================

// --- MANUELLE PLATZIERUNG ---
export interface ManualPlacement {
  id: string
  type: 'anchor' | 'console' | 'stair' | 'net' | 'board' | 'protection_roof' | 'load_plate' | 'ladder'
  positionX: number
  positionY: number
  positionZ: number
  side: 'front' | 'back' | 'left' | 'right'
  levelIndex: number
  fieldId?: string
  notes?: string
  // Optional: Drehung um die Hochachse (Bogenmaß), z. B. beim Ersetzen eines
  // Bauteils an einer Seitenfläche. Ohne Angabe: 0 (wie bisher).
  rotationY?: number
}

export function addManualPlacement(
  model: CADModel,
  placement: Omit<ManualPlacement, 'id'> & { id?: string }
): CADModel {
  // Eine mitgegebene ID bleibt erhalten, damit das Bauteil im 3D-Modell
  // dieselbe ID hat wie die Platzierung (nötig zum Auswählen/Entfernen).
  const newPlacement: ManualPlacement = {
    ...placement,
    id: placement.id ?? `manual-${placement.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  }

  // Füge entsprechendes 3D-Bauteil hinzu
  const component = placementToComponent(newPlacement, model)
  // Treppe in ein Feld gesetzt: richtiger Zickzack-Lauf statt Einzelteil
  const feld = placement.type === 'stair' && placement.fieldId ? model.fields.find((f) => f.id === placement.fieldId) : undefined
  const feldLage = feld ? model.levels.find((l) => l.index === feld.levelIndex) : undefined
  if (feld && feldLage) {
    model.components3D.push(...treppenlaufInFeld(model, feld, feldLage, newPlacement.id))
    // Treppenöffnung: der Belag des Feldes direkt darüber (gleiche Seite und Lage,
    // nächste Ebene) entfällt, damit der Lauf oben ankommt. Beim Entfernen der
    // Treppe wird das Modell neu aufgebaut, der Belag ist dann wieder da.
    // Eckfelder haben eigene Belag-IDs und bleiben unverändert.
    const darueber = model.fields.find(
      (f) => f.side === feld.side && f.levelIndex === feld.levelIndex + 1 &&
        Math.abs(f.positionX - feld.positionX) < 1e-6 && Math.abs(f.positionZ - feld.positionZ) < 1e-6
    )
    if (darueber) {
      const deckId = `deck-${darueber.id}`
      model.components3D = model.components3D.filter((c) => c.id !== deckId)
    }
  } else if (component) {
    model.components3D.push(component)
  }

  if (placement.type === 'anchor') {
    model.anchors.push({
      id: newPlacement.id,
      positionX: placement.positionX,
      positionY: placement.positionY,
      positionZ: placement.positionZ,
      side: placement.side,
      type: 'fassadenanker',
    })
  }

  return model
}

/**
 * Ein Treppenlauf (Zickzack, eine Lage) im angegebenen Feld – gleiche Bauweise
 * wie die automatisch erzeugten Treppentürme, aber an beliebiger Seite.
 * Die Teile werden im Vorne-System erzeugt und auf die Seite des Feldes gedreht.
 * IDs: `${id}` (Holme), `${id}-step-N`, `${id}-rail-aussen-*` / `${id}-rail-wand-*` (Pfosten, Handlauf, Knieleiste).
 */
export function treppenlaufInFeld(model: CADModel, field: ScaffoldField, level: ScaffoldLevel, id: string): ScaffoldComponent3D[] {
  const rahmen = seitenRahmen(field.side, model.building)
  const [px, pz] = rahmen.toLocal(field.positionX, field.positionZ)
  const stairL = Math.max(1.0, field.lengthM - 0.25)
  const stairW = Math.max(0.4, field.widthM * 0.8)
  const stairZ = pz + field.widthM / 2 - 0.02
  const startDir: 1 | -1 = field.levelIndex % 2 === 0 ? 1 : -1
  const h = level.heightM
  const out: ScaffoldComponent3D[] = []
  out.push({ id, type: 'stair', articleNumber: 'SP-001', name: 'Treppenlauf (manuell)', position: [px, level.bottomY + h / 2, stairZ], rotation: [0, 0, 0], scale: [stairL, h, stairW], color: '#84cc16', levelId: level.id, flights: 1, flightStartDir: startDir })
  const perFlight = Math.max(1, Math.round(h / 0.25))
  const tread = (stairL - 0.2) / perFlight
  const x0 = startDir > 0 ? px - stairL / 2 + 0.1 : px + stairL / 2 - 0.1
  for (let k = 0; k < perFlight; k++) {
    const stepY = level.bottomY + (k + 1) * (h / perFlight) - 0.04
    out.push({ id: `${id}-step-${k}`, type: 'deck', articleNumber: 'ST-001', name: 'Treppenstufe', position: [x0 + startDir * (k + 0.5) * tread, stepY, stairZ], rotation: [0, 0, 0], scale: [tread * 0.92, 0.04, stairW - 0.08], color: '#a0a0a0', levelId: level.id })
  }
  // Geländer (ANNAHMEN, rein konstruktiv: Handlauf 1,0 m und Knieleiste 0,5 m
  // über der Stufenoberkante; Außenseite mit Handlauf + Knieleiste, Wandseite nur
  // Handlauf). Die Pfosten stehen am unteren und oberen Laufende, der obere
  // reicht 1,0 m über den Belag der nächsten Lage (Absturzsicherung Öffnung).
  const rs = h / perFlight
  const xLow = x0 + startDir * 0.5 * tread
  const xHigh = x0 + startDir * (perFlight - 0.5) * tread
  const yLow = level.bottomY + rs - 0.02
  const yHigh = level.bottomY + h - 0.02
  const rohr = (suffix: string, ax: number, ay: number, bx: number, by: number, z: number) => {
    const dx = bx - ax, dy = by - ay
    const len = Math.hypot(dx, dy)
    out.push({ id: `${id}-${suffix}`, type: 'railing', articleNumber: 'SG-001', name: 'Treppengeländer', position: [(ax + bx) / 2, (ay + by) / 2, z], rotation: [0, 0, Math.atan2(-dx, dy)], scale: [0.04, len, 0.04], color: '#ef4444', levelId: level.id })
  }
  const zAussen = stairZ + stairW / 2 - 0.03
  const zWand = stairZ - stairW / 2 + 0.03
  for (const [tag, z] of [['aussen', zAussen], ['wand', zWand]] as const) {
    rohr(`rail-${tag}-pfosten-unten`, xLow, level.bottomY, xLow, yLow + 1.0, z)
    rohr(`rail-${tag}-pfosten-oben`, xHigh, level.bottomY, xHigh, yHigh + 1.0, z)
    rohr(`rail-${tag}-handlauf`, xLow, yLow + 1.0, xHigh, yHigh + 1.0, z)
  }
  rohr('rail-aussen-knie', xLow, yLow + 0.5, xHigh, yHigh + 0.5, zAussen)
  out.forEach((c) => bauteilInWelt(c, rahmen))
  return out
}

export function removeManualPlacement(model: CADModel, id: string): CADModel {
  model.components3D = model.components3D.filter(c => c.id !== id && !c.id.startsWith(`manual-${id}`))
  model.anchors = model.anchors.filter(a => a.id !== id)
  return model
}

function placementToComponent(placement: ManualPlacement, model: CADModel): ScaffoldComponent3D | null {
  const comp = placementToComponentBase(placement, model)
  if (comp && placement.rotationY) {
    comp.rotation = [comp.rotation[0], comp.rotation[1] + placement.rotationY, comp.rotation[2]]
  }
  return comp
}

function placementToComponentBase(placement: ManualPlacement, model: CADModel): ScaffoldComponent3D | null {
  const { type, positionX, positionY, positionZ, side } = placement

  switch (type) {
    case 'anchor':
      return {
        id: placement.id,
        type: 'anchor',
        articleNumber: 'AN-001',
        name: 'Fassadenanker (manuell)',
        position: [positionX, positionY, positionZ],
        rotation: [0, 0, 0],
        scale: [0.08, 0.08, 0.3],
        color: '#10b981',
      }
    case 'console':
      return {
        id: placement.id,
        type: 'console',
        articleNumber: 'KO-001',
        name: 'Konsole 0,73m (manuell)',
        position: [positionX, positionY, positionZ],
        rotation: [0, 0, 0],
        scale: [0.73, 0.04, 0.3],
        color: '#f43f5e',
      }
    case 'stair':
      return {
        id: placement.id,
        type: 'stair',
        articleNumber: 'SP-001',
        name: 'Spindeltreppe (manuell)',
        position: [positionX, positionY, positionZ],
        rotation: [0, 0, 0],
        scale: [0.8, 2.0, 0.8],
        color: '#84cc16',
      }
    case 'net':
      return {
        id: placement.id,
        type: 'net',
        articleNumber: 'FN-001',
        name: 'Fangnetz (manuell)',
        position: [positionX, positionY, positionZ],
        rotation: [0, 0, 0],
        scale: [2.07, 1.5, 0.01],
        color: '#06b6d4',
      }
    case 'board':
      return {
        id: placement.id,
        type: 'board',
        articleNumber: 'BB-001',
        name: 'Bordbrett (manuell)',
        position: [positionX, positionY, positionZ],
        rotation: [0, 0, 0],
        scale: [2.07, 0.19, 0.02],
        color: '#d97706',
      }
    case 'protection_roof':
      return {
        id: placement.id,
        type: 'protection_roof',
        articleNumber: 'SD-001',
        name: 'Schutzdach (manuell)',
        position: [positionX, positionY, positionZ],
        rotation: [0.3, 0, 0],
        scale: [6, 0.1, 2],
        color: '#f97316',
      }
    case 'ladder': {
      // Schematische Anlegeleiter (ANNAHME: keine Herstellermaße): 0,40 m breit,
      // 0,08 m tief, Höhe = Höhe der gewählten Lage (sonst 2,0 m), steht außen an der Seite.
      const lage = model.levels.find((l) => l.index === placement.levelIndex)
      const h = lage && lage.heightM > 0 ? lage.heightM : 2.0
      return {
        id: placement.id,
        type: 'ladder',
        articleNumber: LEITER_ARTIKELNUMMER,
        name: 'Leiter (schematisch)',
        position: [positionX, positionY, positionZ],
        rotation: [0, side === 'left' || side === 'right' ? Math.PI / 2 : 0, 0],
        scale: [0.4, h, 0.08],
        color: '#b9c0c7',
      }
    }
    case 'load_plate':
      return {
        id: placement.id,
        type: 'load_plate',
        articleNumber: 'LV-001',
        name: 'Lastverteilplatte (manuell)',
        position: [positionX, positionY, positionZ],
        rotation: [0, 0, 0],
        scale: [0.3, 0.04, 0.3],
        color: '#78716c',
      }
    default:
      return null
  }
}

// --- KOLLISIONSERKENNUNG (ERWEITERT) ---
export interface CollisionResult {
  hasCollision: boolean
  collisions: {
    componentA: string
    componentB: string
    type: 'component-component' | 'component-building' | 'component-ground'
    distance: number
  }[]
}

export function detectCollisions(model: CADModel): CollisionResult {
  const collisions: CollisionResult['collisions'] = []
  const comps = model.components3D

  // Bauteil-Bauteil Kollisionen
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      const a = comps[i]
      const b = comps[j]
      const dist = Math.sqrt(
        Math.pow(a.position[0] - b.position[0], 2) +
        Math.pow(a.position[1] - b.position[1], 2) +
        Math.pow(a.position[2] - b.position[2], 2)
      )
      const minDist = 0.1 // 10cm Mindestabstand
      if (dist < minDist && a.id !== b.id) {
        collisions.push({
          componentA: a.id,
          componentB: b.id,
          type: 'component-component',
          distance: dist,
        })
      }
    }
  }

  // Bauteil-Gebäude Kollisionen
  // FIX (Marktvergleich-Lücke 2): Bei mehrteiligen Gebäuden (unterschiedliche
  // Höhen/Ecken, siehe berechneGebaeudeSegmente) hätte die alte Prüfung mit
  // EINEM globalen Rechteck (building.lengthM/heightM/widthM) bei Ecken
  // falsche Ergebnisse geliefert – ein Bauteil im Anbau-Abschnitt läge
  // rechnerisch oft außerhalb des globalen Rechtecks (unentdeckte Kollision)
  // oder umgekehrt fälschlich "im Gebäude" (falscher Alarm). Jetzt wird
  // pro Bauteil der tatsächlich zuständige Abschnitt herangezogen.
  const building = model.building
  const segmente = building.sections && building.sections.length >= 2
    ? berechneGebaeudeSegmente(building.sections)
    : null

  comps.forEach((comp) => {
    const bx = comp.position[0]
    const by = comp.position[1]
    const bz = comp.position[2]
    let istInnerhalb = false

    if (segmente) {
      // Bauteil in das lokale Koordinatensystem JEDES Abschnitts drehen und
      // dort mit dessen eigener Länge/Höhe prüfen (der Gerüst-Tiefen-Puffer
      // von 0.5 m bleibt gleich wie bei der einteiligen Prüfung).
      for (const seg of segmente) {
        // Empirisch mit bekannten Punkten geprüft (Mittelpunkt → 0,0;
        // Segment-Ende → Länge/2,0): lokalX/Z korrekt mit rotationYRad direkt,
        // keine weitere Vorzeichenumkehr nötig.
        const relX = bx - seg.mitteX
        const relZ = bz - seg.mitteZ
        const w = seg.rotationYRad
        const lokalX = relX * Math.cos(w) - relZ * Math.sin(w)
        const lokalZ = relX * Math.sin(w) + relZ * Math.cos(w)
        const insideX = lokalX >= -seg.laengeM / 2 && lokalX <= seg.laengeM / 2
        const insideY = by >= 0 && by <= seg.hoeheM
        const insideZ = lokalZ >= -(building.widthM || 6) / 2 - 0.5 && lokalZ <= (building.widthM || 6) / 2 + 0.5
        if (insideX && insideY && insideZ) { istInnerhalb = true; break }
      }
    } else {
      const insideX = bx >= -building.lengthM / 2 && bx <= building.lengthM / 2
      const insideY = by >= 0 && by <= building.heightM
      const insideZ = bz >= -building.widthM / 2 - 0.5 && bz <= building.widthM / 2 + 0.5
      istInnerhalb = insideX && insideY && insideZ
    }

    if (istInnerhalb && comp.type !== 'anchor') {
      collisions.push({
        componentA: comp.id,
        componentB: 'building',
        type: 'component-building',
        distance: 0,
      })
    }
  })

  return {
    hasCollision: collisions.length > 0,
    collisions,
  }
}

// --- STATISCHE PRÜFUNG (vereinfacht) ---
export interface StaticCheckResult {
  passed: boolean
  checks: {
    name: string
    passed: boolean
    message: string
    severity: 'error' | 'warning'
  }[]
}

export function performStaticChecks(model: CADModel): StaticCheckResult {
  const checks: StaticCheckResult['checks'] = []

  // 1. Standfestigkeit: Fußplatten pro Feld
  const footplates = model.components3D.filter(c => c.type === 'footplate').length
  const fields = model.fieldCount
  const levels = model.levelCount
  const expectedFeet = fields * 2 * levels
  checks.push({
    name: 'Standfestigkeit',
    passed: footplates >= fields * 2,
    message: footplates >= fields * 2
      ? `✅ ${footplates} Fußplatten für ${fields} Felder ausreichend`
      : `⚠️ Zu wenig Fußplatten: ${footplates} von mindestens ${fields * 2} erforderlich`,
    severity: footplates >= fields * 2 ? 'warning' : 'error',
  })

  // 2. Verankerung bei Höhe > 6m
  const anchors = model.anchors.length
  const needsAnchors = model.building.heightM > 6
  checks.push({
    name: 'Verankerung',
    passed: !needsAnchors || anchors > 0,
    message: !needsAnchors
      ? `✅ Keine Verankerung nötig bei ${model.building.heightM}m`
      : anchors > 0
        ? `✅ ${anchors} Verankerungen bei ${model.building.heightM}m Höhe`
        : `❌ Verankerung erforderlich ab 6m Höhe (Gebäude: ${model.building.heightM}m)`,
    severity: !needsAnchors || anchors > 0 ? 'warning' : 'error',
  })

  // 3. Diagonalen-Anteil
  const diagonals = model.components3D.filter(c => c.type === 'diagonal').length
  const frames = model.components3D.filter(c => c.type === 'frame').length / 2
  const diagonalRatio = frames > 0 ? diagonals / frames : 0
  checks.push({
    name: 'Aussteifung',
    passed: diagonalRatio >= 0.3,
    message: diagonalRatio >= 0.3
      ? `✅ Ausreichend Diagonalen (${(diagonalRatio * 100).toFixed(0)}%)`
      : `⚠️ Zu wenig Diagonalen (${(diagonalRatio * 100).toFixed(0)}%), mindestens 30% empfohlen`,
    severity: 'warning',
  })

  // 4. Geländer-Vollständigkeit
  const decks = model.components3D.filter(c => c.type === 'deck').length
  const railings = model.components3D.filter(c => c.type === 'railing').length
  checks.push({
    name: 'Absturzsicherung',
    passed: railings >= decks,
    message: railings >= decks
      ? `✅ Geländer vollständig (${railings}/${decks})`
      : `❌ Fehlende Geländer: ${railings}/${decks} Arbeitsbühnen abgedeckt`,
    severity: railings >= decks ? 'warning' : 'error',
  })

  // 5. Feldüberschreitung
  const maxFieldLen = Math.max(...model.fields.map(f => f.lengthM))
  checks.push({
    name: 'Feldlänge',
    passed: maxFieldLen <= 3.07,
    message: maxFieldLen <= 3.07
      ? `✅ Maximale Feldlänge ${maxFieldLen.toFixed(2)}m im zulässigen Bereich`
      : `❌ Feldlänge ${maxFieldLen.toFixed(2)}m überschreitet 3.07m`,
    severity: 'error',
  })

  return {
    passed: checks.every(c => c.passed || c.severity === 'warning'),
    checks,
  }
}

// ============================================================
// CAD v4 – Gebäudemerkmale (Fenster/Türen/Balkone), Hindernis-
// Kollisionen und Logistik (Phase 29)
// ============================================================
//
// Bisher existierten windowCount/doorCount/balconyCount nur als
// Eingabefelder ohne jede Wirkung im Modell. Jetzt werden daraus
// tatsächlich platzierte Gebäudemerkmale je Fassadenseite.

export type BuildingFeatureType = 'window' | 'door' | 'balcony'

export interface BuildingFeature3D {
  id: string
  type: BuildingFeatureType
  side: 'front' | 'back' | 'left' | 'right'
  // Position relativ zur Fassadenmitte (x entlang der Fassade, y = Höhe)
  offsetAlongM: number
  bottomY: number
  widthM: number
  heightM: number
  depthM: number   // Balkon-Auskragung, sonst 0
  floorIndex: number
}

// Verteilt Fenster/Türen/Balkone gleichmäßig auf Geschosse und Fassaden.
// Türen nur im Erdgeschoss, Balkone nur in Obergeschossen.
export function generateBuildingFeatures(building: BuildingParams): BuildingFeature3D[] {
  const features: BuildingFeature3D[] = []
  const sides: BuildingFeature3D['side'][] = building.sides?.length ? building.sides : ['front']
  const floors = Math.max(1, building.floors || 1)
  const floorHeights = building.floorHeightsM?.length === floors
    ? building.floorHeightsM
    : Array(floors).fill(building.heightM / floors)

  const floorBottom = (i: number) => floorHeights.slice(0, i).reduce((s, h) => s + h, 0)
  const facadeLength = (side: string) => (side === 'front' || side === 'back') ? building.lengthM : building.widthM

  // Fenster: gleichmäßig über alle Seiten und Geschosse verteilt
  const windowsPerSideFloor = Math.max(0, Math.round((building.windowCount || 0) / (sides.length * floors)))
  sides.forEach((side) => {
    const len = facadeLength(side)
    for (let f = 0; f < floors; f++) {
      const count = windowsPerSideFloor
      if (count === 0) continue
      const spacing = len / (count + 1)
      for (let w = 0; w < count; w++) {
        features.push({
          id: `win-${side}-${f}-${w}`, type: 'window', side,
          offsetAlongM: -len / 2 + spacing * (w + 1),
          bottomY: floorBottom(f) + 0.9, widthM: Math.min(1.2, spacing * 0.6), heightM: Math.min(1.4, floorHeights[f] * 0.5),
          depthM: 0, floorIndex: f,
        })
      }
    }
  })

  // Türen: nur Erdgeschoss, vorne bevorzugt
  const doorSides = sides.includes('front') ? ['front', ...sides.filter(s => s !== 'front')] : sides
  for (let d = 0; d < (building.doorCount || 0); d++) {
    const side = doorSides[d % doorSides.length] as BuildingFeature3D['side']
    const len = facadeLength(side)
    const perSide = Math.ceil((building.doorCount || 0) / doorSides.length)
    const idx = Math.floor(d / doorSides.length)
    const spacing = len / (perSide + 1)
    features.push({
      id: `door-${d}`, type: 'door', side,
      offsetAlongM: -len / 2 + spacing * (idx + 1) + (spacing / 4), // leicht versetzt zu Fenstern
      bottomY: 0, widthM: 1.0, heightM: 2.1, depthM: 0, floorIndex: 0,
    })
  }

  // Balkone: Obergeschosse, auskragend (relevant für Gerüst-Kollision!)
  for (let b = 0; b < (building.balconyCount || 0); b++) {
    const side = sides[b % sides.length] as BuildingFeature3D['side']
    const f = floors > 1 ? 1 + (b % (floors - 1)) : 0
    const len = facadeLength(side)
    features.push({
      id: `balcony-${b}`, type: 'balcony', side,
      offsetAlongM: -len / 2 + len * ((b % 3) + 1) / 4,
      bottomY: floorBottom(f), widthM: Math.min(3.0, len * 0.35), heightM: 1.1, depthM: 1.2, floorIndex: f,
    })
  }

  return features
}

// Hindernis-Kollisionen: Balkone/Erker ragen in den Gerüstbereich →
// regelkonforme Vorschläge (Konsolen, Überbrückungsträger).
export function detectFeatureCollisions(model: CADModel, features: BuildingFeature3D[]): CADWarning[] {
  const warnings: CADWarning[] = []
  const scaffoldDepth = model.system?.rahmenBreitenM?.[0] || 0.73
  features.filter(f => f.type === 'balcony').forEach((b) => {
    if (b.depthM >= scaffoldDepth * 0.5) {
      warnings.push({
        type: 'warning', code: 'BALKON_KOLLISION',
        message: `Balkon (${b.side}, ${b.floorIndex + 1}. OG) ragt ${b.depthM.toFixed(1)} m in den Gerüstbereich – Vorschlag: Konsolen/Auskragung oder Überbrückungsträger im betroffenen Feld einplanen.`,
      })
    }
  })
  if (model.building.overhangM > 0.3) {
    warnings.push({ type: 'info', code: 'DACHUEBERSTAND', message: `Dachüberstand ${model.building.overhangM} m – Konsolen an der obersten Lage erforderlich.` })
  }
  return warnings
}

// Logistik: Gewicht, Transportvolumen, LKW-Bedarf, Auf-/Abbauzeit.
// Annahmen sind bewusst konservativ und hier zentral änderbar – KEINE
// herstellerspezifischen Angaben, sondern Richtwerte für die Angebotsphase.
export interface LogistikDaten {
  gesamtgewichtKg: number
  transportvolumenM3: number
  lkwFahrten: number            // bei 7,5-t-LKW (Nutzlast ~3,5 t)
  aufbauStunden: number
  abbauStunden: number
  annahmen: string[]
}

export function calculateLogistics(
  model: CADModel,
  materials: MaterialItem[],
  hoursPerSqm: number = 2.0,
): LogistikDaten {
  const gesamtgewichtKg = materials.reduce((s, m) => s + m.weightKg * m.quantity, 0)
  // Richtwert: Gerüstmaterial gebündelt ~ 250 kg/m³ (Stahl-Rahmengerüst, gemischt gestapelt)
  const transportvolumenM3 = gesamtgewichtKg / 250
  const nutzlastKg = 3500
  const lkwFahrten = Math.max(1, Math.ceil(gesamtgewichtKg / nutzlastKg))
  const aufbauStunden = Math.ceil(model.totalAreaM2 * hoursPerSqm)
  // Abbau typischerweise ~60 % der Aufbauzeit
  const abbauStunden = Math.ceil(aufbauStunden * 0.6)
  return {
    gesamtgewichtKg: Math.round(gesamtgewichtKg),
    transportvolumenM3: Math.round(transportvolumenM3 * 10) / 10,
    lkwFahrten,
    aufbauStunden,
    abbauStunden,
    annahmen: [
      'Transportvolumen: ~250 kg/m³ gestapeltes Stahl-Rahmengerüst',
      'LKW-Fahrten: 7,5-t-LKW mit ~3,5 t Nutzlast',
      `Aufbau: ${hoursPerSqm} h/m² (aus Kalkulations-Grundlagen), Abbau ~60 % davon`,
    ],
  }
}

// ============================================================
// Statik-Export-Schnittstelle (Marktvergleich-Lücke 4)
//
// Gibt der Statiker/dem Statikbüro reine Geometriedaten zur eigenen
// Weiterverarbeitung mit – NACH DEM VORBILD von Layhers "LayPLAN TO
// RSTAB" (Geometrie/Positionen), aber bewusst OHNE deren
// zulassungsgebundene Querschnitts-/Werkstoffdaten, die wir nicht
// besitzen und nicht erfinden dürfen. Enthält NIEMALS eine eigene
// Standsicherheitsaussage – das bleibt immer Aufgabe des Statikers.
// ============================================================

export interface StatikExport {
  hinweis: string
  erzeugtAm: string
  system: { hersteller: string; systemName: string; verwendeteRahmenbreiteM: number } | null
  gebaeude: {
    laengeM: number; breiteM: number; hoeheM: number
    abschnitte?: { bezeichnung?: string; laengeM: number; hoeheM: number; startM: [number, number]; endeM: [number, number] }[]
  }
  gesamtmasse: { laengeM: number; hoeheM: number; flaecheM2: number; feldanzahl: number; lagenanzahl: number }
  bauteile: { id: string; typ: string; positionM: [number, number, number] }[]
  anker: { id: string; positionM: [number, number, number] }[]
}

export function generateStatikExport(model: CADModel): StatikExport {
  const segmente = model.building.sections && model.building.sections.length >= 2
    ? berechneGebaeudeSegmente(model.building.sections)
    : null

  return {
    hinweis:
      'WICHTIG: Diese Datei enthält AUSSCHLIESSLICH Geometriedaten (Positionen, Abmessungen) ' +
      'der geplanten Gerüstkonstruktion. Sie enthält KEINE Trag-/Querschnittsdaten, keine ' +
      'Werkstoffkennwerte und KEINE Standsicherheitsaussage. Für den projektbezogenen ' +
      'statischen Einzelnachweis müssen die amtlichen Zulassungsdaten des angegebenen ' +
      'Gerüstsystems (Hersteller/Bezeichnung siehe unten) durch den Statiker ergänzt werden.',
    erzeugtAm: new Date().toISOString(),
    system: model.system
      ? { hersteller: model.system.hersteller, systemName: model.system.systemName, verwendeteRahmenbreiteM: model.system.rahmenBreitenM[0] }
      : null,
    gebaeude: {
      laengeM: model.building.lengthM, breiteM: model.building.widthM, hoeheM: model.building.heightM,
      abschnitte: segmente?.map((s) => ({
        bezeichnung: s.bezeichnung, laengeM: s.laengeM, hoeheM: s.hoeheM,
        startM: [Math.round(s.startX * 100) / 100, Math.round(s.startZ * 100) / 100],
        endeM: [Math.round(s.endX * 100) / 100, Math.round(s.endZ * 100) / 100],
      })),
    },
    gesamtmasse: {
      laengeM: model.totalLengthM, hoeheM: model.totalHeightM, flaecheM2: model.totalAreaM2,
      feldanzahl: model.fieldCount, lagenanzahl: model.levelCount,
    },
    bauteile: model.components3D.map((c) => ({
      id: c.id, typ: c.type,
      positionM: [Math.round(c.position[0] * 1000) / 1000, Math.round(c.position[1] * 1000) / 1000, Math.round(c.position[2] * 1000) / 1000],
    })),
    anker: model.anchors.map((a) => ({
      id: a.id,
      positionM: [Math.round(a.positionX * 1000) / 1000, Math.round(a.positionY * 1000) / 1000, Math.round(a.positionZ * 1000) / 1000],
    })),
  }
}
