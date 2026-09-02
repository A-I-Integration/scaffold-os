// ============================================================
// lib/calculations/cad-engine.ts
// SCAFFOLD OS – CAD Geometrie-Engine v3
// Mehrseitige Gerüste, Eckverbindungen, echte Treppen
// ============================================================

import { GeruestSystem, findeSystem } from './geruest-systeme'
import { MaterialItem } from '@/types/scaffold'

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
  sides: ('front' | 'back' | 'left' | 'right')[]
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
  type: 'frame' | 'deck' | 'railing' | 'diagonal' | 'footplate' | 'coupling' | 'anchor' | 'console' | 'stair' | 'net' | 'board' | 'protection_roof' | 'safety_net' | 'load_plate' | 'corner_brace'
  articleNumber: string
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
  fieldId?: string
  levelId?: string
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

  // === BASIS-BAUTEILE (pro Feld) ===
  fields.forEach((field) => {
    const { positionX, positionY, positionZ, lengthM, widthM, levelIndex, side } = field
    const level = levels.find((l) => l.index === levelIndex)
    if (!level) return
    const yBottom = level.bottomY
    const yTop = level.topY
    const levelH = level.heightM

    // Rahmen links + rechts
    components.push({ id: `frame-${field.id}-left`, type: 'frame', articleNumber: getFrameArticle(lengthM), name: `Rahmen ${lengthM}m`, position: [positionX - lengthM / 2 + 0.02, yBottom + levelH / 2, positionZ], rotation: [0, 0, 0], scale: [0.073, levelH, 0.04], color: colorFrame, fieldId: field.id, levelId: level.id })
    components.push({ id: `frame-${field.id}-right`, type: 'frame', articleNumber: getFrameArticle(lengthM), name: `Rahmen ${lengthM}m`, position: [positionX + lengthM / 2 - 0.02, yBottom + levelH / 2, positionZ], rotation: [0, 0, 0], scale: [0.073, levelH, 0.04], color: colorFrame, fieldId: field.id, levelId: level.id })

    // Querriegel
    components.push({ id: `rail-${field.id}-bottom`, type: 'frame', articleNumber: 'QR-001', name: 'Querriegel', position: [positionX, yBottom + 0.05, positionZ], rotation: [0, 0, 0], scale: [lengthM, 0.04, 0.04], color: colorFrame, fieldId: field.id, levelId: level.id })
    components.push({ id: `rail-${field.id}-top`, type: 'frame', articleNumber: 'QR-001', name: 'Querriegel', position: [positionX, yTop - 0.05, positionZ], rotation: [0, 0, 0], scale: [lengthM, 0.04, 0.04], color: colorFrame, fieldId: field.id, levelId: level.id })

    // Arbeitsbühne
    components.push({ id: `deck-${field.id}`, type: 'deck', articleNumber: getDeckArticle(lengthM), name: `Arbeitsbühne ${lengthM}m`, position: [positionX, yTop, positionZ + widthM / 2 - 0.02], rotation: [-Math.PI / 2, 0, 0], scale: [lengthM - 0.05, widthM - 0.05, 0.02], color: colorDeck, fieldId: field.id, levelId: level.id })

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
  })

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
        components.push({ id: `console-${i}`, type: 'console', articleNumber: 'KO-001', name: 'Konsole 0,73m', position: [field.positionX, topLevel.topY, field.positionZ + field.widthM / 2 + 0.3], rotation: [0, 0, 0], scale: [0.73, 0.04, 0.3], color: colorConsole, levelId: topLevel.id })
      }
    }
  }

  // === TREPPEN (echte Spindeltreppen) ===
  const stairInterval = 3
  for (let i = 0; i < levels.length; i += stairInterval) {
    const level = levels[i]
    // Finde ein Feld an der Vorderseite für die Treppe
    const stairField = fields.find(f => f.side === 'front' && f.levelIndex === i)
    if (stairField && level) {
      const stairX = stairField.positionX - stairField.lengthM / 2 - 0.9
      const stairZ = stairField.positionZ
      const totalStairHeight = level.heightM * Math.min(stairInterval, levels.length - i)

      // Treppen-Rahmen
      components.push({ id: `stair-frame-${i}`, type: 'stair', articleNumber: 'SP-001', name: 'Spindeltreppe', position: [stairX, level.bottomY + totalStairHeight / 2, stairZ], rotation: [0, 0, 0], scale: [0.8, totalStairHeight, 0.8], color: colorStair, levelId: level.id })

      // Stufen (alle 25cm)
      const stepCount = Math.ceil(totalStairHeight / 0.25)
      for (let s = 0; s < stepCount; s++) {
        const stepY = level.bottomY + (s * 0.25)
        components.push({ id: `stair-step-${i}-${s}`, type: 'deck', articleNumber: 'ST-001', name: 'Treppenstufe', position: [stairX, stepY, stairZ + 0.2], rotation: [0, 0, 0], scale: [0.7, 0.04, 0.25], color: '#a0a0a0', levelId: level.id })
      }

      // Treppen-Geländer
      components.push({ id: `stair-rail-${i}`, type: 'railing', articleNumber: 'SG-001', name: 'Treppengeländer', position: [stairX - 0.4, level.bottomY + totalStairHeight / 2, stairZ], rotation: [0, 0, 0], scale: [0.04, totalStairHeight, 0.04], color: colorRailing, levelId: level.id })
      components.push({ id: `stair-rail-${i}-2`, type: 'railing', articleNumber: 'SG-001', name: 'Treppengeländer', position: [stairX + 0.4, level.bottomY + totalStairHeight / 2, stairZ], rotation: [0, 0, 0], scale: [0.04, totalStairHeight, 0.04], color: colorRailing, levelId: level.id })
    }
  }

  // === FANGNETZE ===
  if (building.heightM > 12) {
    const netArea = building.lengthM * building.heightM * 0.3
    const netCount = Math.ceil(netArea / 25)
    for (let i = 0; i < Math.min(netCount, 5); i++) {
      const level = levels[Math.min(i + 2, levels.length - 1)]
      const field = fields[i % fields.length]
      if (level && field) {
        components.push({ id: `net-${i}`, type: 'net', articleNumber: 'FN-001', name: 'Fangnetz', position: [field.positionX, level.topY - 0.5, field.positionZ + field.widthM / 2 + 0.05], rotation: [0, 0, 0], scale: [field.lengthM, 1.5, 0.01], color: colorNet, levelId: level.id })
      }
    }
  }

  // === SCHUTZDÄCHER ===
  if (building.heightM > 15 || building.overhangM > 0.5) {
    const roofCount = Math.max(1, Math.ceil(building.lengthM / 6))
    for (let i = 0; i < roofCount; i++) {
      const xPos = (i * 6) - building.lengthM / 2 + 3
      components.push({ id: `roof-${i}`, type: 'protection_roof', articleNumber: 'SD-001', name: 'Schutzdach', position: [xPos, building.heightM + 0.5, 0.5], rotation: [0.3, 0, 0], scale: [6, 0.1, 2], color: colorRoof })
    }
  }

  // === LASTVERTEILPLATTEN ===
  const loadPlateCount = Math.ceil(fields.filter(f => f.levelIndex === 0).length * 2 * 0.5)
  for (let i = 0; i < loadPlateCount; i++) {
    const field = fields[i % fields.length]
    if (field.levelIndex === 0) {
      components.push({ id: `loadplate-${i}`, type: 'load_plate', articleNumber: 'LV-001', name: 'Lastverteilplatte', position: [field.positionX - field.lengthM / 2 + 0.02, -0.04, field.positionZ], rotation: [0, 0, 0], scale: [0.3, 0.04, 0.3], color: colorLoadPlate, fieldId: field.id })
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
  if (building.heightM <= 0) warnings.push({ type: 'error', code: 'BUILDING_HEIGHT_ZERO', message: 'Gebäudehöhe muss größer als 0 sein.' })
  if (building.heightM > 40) warnings.push({ type: 'warning', code: 'HEIGHT_VERY_HIGH', message: 'Gebäudehöhe > 40m – Statik prüfen lassen!' })

  const fieldDiv = system ? calculateFieldDivision(building.lengthM, system) : { fields: 1, fieldLengthM: 2.07, remainderM: 0, distribution: [2.07] }
  const fieldDivWidth = system ? calculateFieldDivision(building.widthM, system) : { fields: 1, fieldLengthM: 2.07, remainderM: 0, distribution: [2.07] }
  const levelCalc = system ? calculateLevels(building.heightM, system) : { levels: 1, levelHeightM: 2.0, levelsData: [{ index: 0, bottomY: 0, topY: 2.0 }] }

  const fields: ScaffoldField[] = []
  const levels: ScaffoldLevel[] = []

  // Bestimme zu bebauende Seiten
  const activeSides: ('front' | 'back' | 'left' | 'right')[] = building.sides && building.sides.length > 0 ? building.sides : ['front']

  for (const side of activeSides) {
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
        zOffset = -distanceToBuildingM - scaffoldWidthM - (building.widthM || 0)
        useLengthDiv = fieldDiv
        break
      case 'left':
        xOffset = -distanceToBuildingM - scaffoldWidthM
        useLengthDiv = fieldDivWidth
        rotation = Math.PI / 2
        break
      case 'right':
        xOffset = distanceToBuildingM + building.lengthM
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
          zPos = fieldIndex * fieldLength - totalLength / 2 + fieldLength / 2 - (building.widthM || 0) / 2
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
  if (building.heightM > 6) {
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
          else if (side === 'back') { xPos = pos; zPos = -distanceToBuildingM - scaffoldWidthM / 2 - (building.widthM || 0) }
          else if (side === 'left') { xPos = -distanceToBuildingM - scaffoldWidthM / 2; zPos = pos - (building.widthM || 0) / 2 }
          else if (side === 'right') { xPos = distanceToBuildingM + building.lengthM + scaffoldWidthM / 2; zPos = pos - (building.widthM || 0) / 2 }

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
    totalLengthM: fieldDiv.fields * fieldDiv.fieldLengthM,
    totalHeightM: building.heightM,
    totalAreaM2: building.lengthM * building.heightM,
    fieldCount: fieldDiv.fields,
    levelCount: levelCalc.levels,
    warnings
  }

  const components3D = generateScaffoldComponents(preliminaryModel)
  return { ...preliminaryModel, components3D }
}

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
  const map: Record<string, string> = { frame: 'Rahmen', deck: 'Belag', railing: 'Geländer', diagonal: 'Diagonalen', footplate: 'Fundamente', coupling: 'Kupplungen', anchor: 'Anker', console: 'Konsolen', stair: 'Treppen', net: 'Sicherheit', board: 'Bordbretter', protection_roof: 'Sicherheit', safety_net: 'Sicherheit', load_plate: 'Fundamente', corner_brace: 'Eckverbindungen' }
  return map[type] || 'Sonstiges'
}

function getUnit(type: ScaffoldComponent3D['type']): string {
  if (type === 'net' || type === 'safety_net') return 'm²'
  return 'Stk'
}

function getUnitPrice(articleNumber: string): number {
  const prices: Record<string, number> = { 'RA-001': 45, 'RA-002': 52, 'RA-003': 58, 'AB-001': 85, 'AB-002': 98, 'AB-003': 112, 'DI-001': 28, 'DI-002': 32, 'DI-003': 36, 'GE-001': 35, 'GE-002': 40, 'GE-003': 45, 'FP-001': 18, 'KU-001': 4.5, 'AN-001': 15, 'QR-001': 12, 'KO-001': 32, 'SP-001': 450, 'FN-001': 4.2, 'SD-001': 850, 'BB-001': 22, 'LV-001': 45, 'EW-001': 25, 'ST-001': 15, 'SG-001': 28 }
  return prices[articleNumber] || 10
}

function getWeightKg(articleNumber: string): number {
  const weights: Record<string, number> = { 'RA-001': 12.5, 'RA-002': 15.2, 'RA-003': 18.0, 'AB-001': 22, 'AB-002': 26, 'AB-003': 31, 'DI-001': 8.5, 'DI-002': 9.8, 'DI-003': 11.2, 'GE-001': 7.2, 'GE-002': 8.5, 'GE-003': 9.8, 'FP-001': 5.5, 'KU-001': 0.8, 'AN-001': 2.5, 'QR-001': 3.5, 'KO-001': 9.0, 'SP-001': 85.0, 'FN-001': 0.5, 'SD-001': 120.0, 'BB-001': 6.5, 'LV-001': 18.0, 'EW-001': 4.2, 'ST-001': 2.8, 'SG-001': 5.5 }
  return weights[articleNumber] || 5
}

function getRecommendation(articleNumber: string): string {
  const recs: Record<string, string> = { 'RA-001': 'Standard-Rahmen für Feldlänge 2,07 m', 'RA-002': 'Für breitere Felder', 'RA-003': 'Für große Feldlängen', 'AB-001': 'Standard-Arbeitsbühne', 'AB-002': 'Für 2,50 m Feldlänge', 'AB-003': 'Für 3,00 m Feldlänge', 'DI-001': 'Stabilisierung je Feld', 'DI-002': 'Stabilisierung 2,50 m', 'DI-003': 'Stabilisierung 3,00 m', 'GE-001': 'Brüstungsgeländer', 'GE-002': 'Geländer 2,50 m', 'GE-003': 'Geländer 3,00 m', 'FP-001': 'Grundplatte je Standfuß', 'KU-001': 'Verbindung Rahmen/Diagonale', 'AN-001': 'Standard-Fassadenanker', 'QR-001': 'Querriegel', 'KO-001': 'Für Überstände und Dacharbeiten', 'SP-001': 'Zugang je 3–4 Ebenen', 'FN-001': 'Fangnetz bei Höhe > 12m', 'SD-001': 'Schutzdach öffentlicher Raum', 'BB-001': 'Seitenschutz/Absturzsicherung', 'LV-001': 'Bei weichem Untergrund', 'EW-001': 'Eckverstrebung', 'ST-001': 'Treppenstufe', 'SG-001': 'Treppengeländer' }
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
  type: 'anchor' | 'console' | 'stair' | 'net' | 'board' | 'protection_roof' | 'load_plate'
  positionX: number
  positionY: number
  positionZ: number
  side: 'front' | 'back' | 'left' | 'right'
  levelIndex: number
  fieldId?: string
  notes?: string
}

export function addManualPlacement(
  model: CADModel,
  placement: Omit<ManualPlacement, 'id'>
): CADModel {
  const newPlacement: ManualPlacement = {
    ...placement,
    id: `manual-${placement.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  }

  // Füge entsprechendes 3D-Bauteil hinzu
  const component = placementToComponent(newPlacement, model)
  if (component) {
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

export function removeManualPlacement(model: CADModel, id: string): CADModel {
  model.components3D = model.components3D.filter(c => c.id !== id && !c.id.startsWith(`manual-${id}`))
  model.anchors = model.anchors.filter(a => a.id !== id)
  return model
}

function placementToComponent(placement: ManualPlacement, model: CADModel): ScaffoldComponent3D | null {
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
  const building = model.building
  comps.forEach((comp) => {
    // Prüfe ob Bauteil INSIDE Gebäude ist (falsche Position)
    const bx = comp.position[0]
    const by = comp.position[1]
    const bz = comp.position[2]

    const insideX = bx >= -building.lengthM / 2 && bx <= building.lengthM / 2
    const insideY = by >= 0 && by <= building.heightM
    const insideZ = bz >= -building.widthM / 2 - 0.5 && bz <= building.widthM / 2 + 0.5

    if (insideX && insideY && insideZ && comp.type !== 'anchor') {
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
