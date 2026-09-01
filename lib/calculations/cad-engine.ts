// ============================================================
// lib/calculations/cad-engine.ts
// SCAFFOLD OS – CAD Geometrie-Engine
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
  type: 'frame' | 'deck' | 'railing' | 'diagonal' | 'footplate' | 'coupling' | 'anchor' | 'console' | 'stair' | 'net' | 'board' | 'protection_roof' | 'safety_net' | 'load_plate'
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

  fields.forEach((field) => {
    const { positionX, positionY, positionZ, lengthM, widthM, levelIndex } = field
    const level = levels.find((l) => l.index === levelIndex)
    if (!level) return
    const yBottom = level.bottomY
    const yTop = level.topY
    const levelH = level.heightM

    components.push({ id: `frame-${field.id}-left`, type: 'frame', articleNumber: getFrameArticle(lengthM), name: `Rahmen ${lengthM}m`, position: [positionX - lengthM / 2 + 0.02, yBottom + levelH / 2, positionZ], rotation: [0, 0, 0], scale: [0.073, levelH, 0.04], color: colorFrame, fieldId: field.id, levelId: level.id })
    components.push({ id: `frame-${field.id}-right`, type: 'frame', articleNumber: getFrameArticle(lengthM), name: `Rahmen ${lengthM}m`, position: [positionX + lengthM / 2 - 0.02, yBottom + levelH / 2, positionZ], rotation: [0, 0, 0], scale: [0.073, levelH, 0.04], color: colorFrame, fieldId: field.id, levelId: level.id })
    components.push({ id: `rail-${field.id}-bottom`, type: 'frame', articleNumber: 'QR-001', name: 'Querriegel', position: [positionX, yBottom + 0.05, positionZ], rotation: [0, 0, 0], scale: [lengthM, 0.04, 0.04], color: colorFrame, fieldId: field.id, levelId: level.id })
    components.push({ id: `rail-${field.id}-top`, type: 'frame', articleNumber: 'QR-001', name: 'Querriegel', position: [positionX, yTop - 0.05, positionZ], rotation: [0, 0, 0], scale: [lengthM, 0.04, 0.04], color: colorFrame, fieldId: field.id, levelId: level.id })
    components.push({ id: `deck-${field.id}`, type: 'deck', articleNumber: getDeckArticle(lengthM), name: `Arbeitsbühne ${lengthM}m`, position: [positionX, yTop, positionZ + widthM / 2 - 0.02], rotation: [-Math.PI / 2, 0, 0], scale: [lengthM - 0.05, widthM - 0.05, 0.02], color: colorDeck, fieldId: field.id, levelId: level.id })
    components.push({ id: `railing-${field.id}-top`, type: 'railing', articleNumber: getRailingArticle(lengthM), name: `Geländer ${lengthM}m`, position: [positionX, yTop, positionZ + widthM / 2 + 0.02], rotation: [0, 0, 0], scale: [lengthM, 1.0, 0.04], color: colorRailing, fieldId: field.id, levelId: level.id })

    if (levelIndex % 2 === 0) {
      const diagLen = Math.sqrt(lengthM * lengthM + levelH * levelH)
      components.push({ id: `diagonal-${field.id}`, type: 'diagonal', articleNumber: getDiagonalArticle(lengthM), name: `Diagonale ${lengthM}m`, position: [positionX, yBottom + levelH / 2, positionZ], rotation: [0, 0, Math.atan2(levelH, lengthM)], scale: [0.03, diagLen, 0.03], color: colorDiagonal, fieldId: field.id, levelId: level.id })
    }

    if (levelIndex === 0) {
      components.push({ id: `foot-${field.id}-left`, type: 'footplate', articleNumber: 'FP-001', name: 'Fußplatte', position: [positionX - lengthM / 2 + 0.02, yBottom - 0.02, positionZ], rotation: [0, 0, 0], scale: [0.15, 0.04, 0.15], color: colorFoot, fieldId: field.id, levelId: level.id })
      components.push({ id: `foot-${field.id}-right`, type: 'footplate', articleNumber: 'FP-001', name: 'Fußplatte', position: [positionX + lengthM / 2 - 0.02, yBottom - 0.02, positionZ], rotation: [0, 0, 0], scale: [0.15, 0.04, 0.15], color: colorFoot, fieldId: field.id, levelId: level.id })
    }

    components.push({ id: `coupling-${field.id}-1`, type: 'coupling', articleNumber: 'KU-001', name: 'Kupplung', position: [positionX - lengthM / 2 + 0.02, yTop, positionZ], rotation: [0, 0, 0], scale: [0.05, 0.05, 0.05], color: colorFrame, fieldId: field.id, levelId: level.id })
    components.push({ id: `coupling-${field.id}-2`, type: 'coupling', articleNumber: 'KU-001', name: 'Kupplung', position: [positionX + lengthM / 2 - 0.02, yTop, positionZ], rotation: [0, 0, 0], scale: [0.05, 0.05, 0.05], color: colorFrame, fieldId: field.id, levelId: level.id })
    components.push({ id: `board-${field.id}`, type: 'board', articleNumber: 'BB-001', name: `Bordbrett ${lengthM}m`, position: [positionX, yTop + 0.3, positionZ - widthM / 2 - 0.02], rotation: [0, 0, 0], scale: [lengthM, 0.19, 0.02], color: colorBoard, fieldId: field.id, levelId: level.id })
  })

  model.anchors.forEach((anchor) => {
    components.push({ id: `anchor-${anchor.id}`, type: 'anchor', articleNumber: 'AN-001', name: 'Fassadenanker', position: [anchor.positionX, anchor.positionY, anchor.positionZ], rotation: [0, 0, 0], scale: [0.08, 0.08, 0.3], color: colorAnchor })
  })

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

  const stairInterval = 3
  for (let i = 0; i < levels.length; i += stairInterval) {
    const level = levels[i]
    const field = fields[0]
    if (field && level) {
      components.push({ id: `stair-${i}`, type: 'stair', articleNumber: 'SP-001', name: 'Spindeltreppe', position: [field.positionX - field.lengthM / 2 - 0.8, level.bottomY, field.positionZ], rotation: [0, 0, 0], scale: [0.8, level.heightM * stairInterval, 0.8], color: colorStair, levelId: level.id })
    }
  }

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

  if (building.heightM > 15 || building.overhangM > 0.5) {
    const roofCount = Math.max(1, Math.ceil(building.lengthM / 6))
    for (let i = 0; i < roofCount; i++) {
      const xPos = (i * 6) - building.lengthM / 2 + 3
      components.push({ id: `roof-${i}`, type: 'protection_roof', articleNumber: 'SD-001', name: 'Schutzdach', position: [xPos, building.heightM + 0.5, 0.5], rotation: [0.3, 0, 0], scale: [6, 0.1, 2], color: colorRoof })
    }
  }

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
  const levelCalc = system ? calculateLevels(building.heightM, system) : { levels: 1, levelHeightM: 2.0, levelsData: [{ index: 0, bottomY: 0, topY: 2.0 }] }

  const fields: ScaffoldField[] = []
  const levels: ScaffoldLevel[] = []
  const sides: ('front' | 'back' | 'left' | 'right')[] = ['front']

  sides.forEach((side) => {
    const zOffset = side === 'front' ? distanceToBuildingM : side === 'back' ? -distanceToBuildingM - scaffoldWidthM : 0
    levelCalc.levelsData.forEach((levelData) => {
      const levelId = `level-${side}-${levelData.index}`
      const levelFields: ScaffoldField[] = []
      fieldDiv.distribution.forEach((fieldLength, fieldIndex) => {
        const fieldId = `field-${side}-${levelData.index}-${fieldIndex}`
        const totalLength = fieldDiv.distribution.reduce((a, b) => a + b, 0)
        const xPos = fieldIndex * fieldLength - totalLength / 2 + fieldLength / 2
        const field: ScaffoldField = { id: fieldId, index: fieldIndex, lengthM: fieldLength, widthM: scaffoldWidthM, positionX: parseFloat(xPos.toFixed(3)), positionY: levelData.bottomY, positionZ: zOffset, side, levelIndex: levelData.index }
        fields.push(field)
        levelFields.push(field)
      })
      levels.push({ id: levelId, index: levelData.index, heightM: levelCalc.levelHeightM, bottomY: levelData.bottomY, topY: levelData.topY, fields: levelFields })
    })
  })

  const anchors: ScaffoldAnchor[] = []
  if (building.heightM > 6) {
    const anchorLevels = Math.floor(levelCalc.levelsData.length / 2)
    for (let al = 0; al < anchorLevels; al++) {
      const yAnchor = (al * 2 + 2) * levelCalc.levelHeightM
      for (let f = 0; f < fieldDiv.fields; f += 2) {
        const totalLength = fieldDiv.distribution.reduce((a, b) => a + b, 0)
        const xPos = f * fieldDiv.fieldLengthM - totalLength / 2 + fieldDiv.fieldLengthM / 2
        anchors.push({ id: `anchor-${al}-${f}`, positionX: xPos, positionY: yAnchor, positionZ: distanceToBuildingM + scaffoldWidthM / 2, side: 'front', type: 'fassadenanker' })
      }
    }
  }

  const preliminaryModel: CADModel = { building, system, fields, levels, anchors, components3D: [], totalLengthM: fieldDiv.fields * fieldDiv.fieldLengthM, totalHeightM: building.heightM, totalAreaM2: building.lengthM * building.heightM, fieldCount: fieldDiv.fields, levelCount: levelCalc.levels, warnings }
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
  const map: Record<string, string> = { frame: 'Rahmen', deck: 'Belag', railing: 'Geländer', diagonal: 'Diagonalen', footplate: 'Fundamente', coupling: 'Kupplungen', anchor: 'Anker', console: 'Konsolen', stair: 'Treppen', net: 'Sicherheit', board: 'Bordbretter', protection_roof: 'Sicherheit', safety_net: 'Sicherheit', load_plate: 'Fundamente' }
  return map[type] || 'Sonstiges'
}

function getUnit(type: ScaffoldComponent3D['type']): string {
  if (type === 'net' || type === 'safety_net') return 'm²'
  return 'Stk'
}

function getUnitPrice(articleNumber: string): number {
  const prices: Record<string, number> = { 'RA-001': 45, 'RA-002': 52, 'RA-003': 58, 'AB-001': 85, 'AB-002': 98, 'AB-003': 112, 'DI-001': 28, 'DI-002': 32, 'DI-003': 36, 'GE-001': 35, 'GE-002': 40, 'GE-003': 45, 'FP-001': 18, 'KU-001': 4.5, 'AN-001': 15, 'QR-001': 12, 'KO-001': 32, 'SP-001': 450, 'FN-001': 4.2, 'SD-001': 850, 'BB-001': 22, 'LV-001': 45 }
  return prices[articleNumber] || 10
}

function getWeightKg(articleNumber: string): number {
  const weights: Record<string, number> = { 'RA-001': 12.5, 'RA-002': 15.2, 'RA-003': 18.0, 'AB-001': 22, 'AB-002': 26, 'AB-003': 31, 'DI-001': 8.5, 'DI-002': 9.8, 'DI-003': 11.2, 'GE-001': 7.2, 'GE-002': 8.5, 'GE-003': 9.8, 'FP-001': 5.5, 'KU-001': 0.8, 'AN-001': 2.5, 'QR-001': 3.5, 'KO-001': 9.0, 'SP-001': 85.0, 'FN-001': 0.5, 'SD-001': 120.0, 'BB-001': 6.5, 'LV-001': 18.0 }
  return weights[articleNumber] || 5
}

function getRecommendation(articleNumber: string): string {
  const recs: Record<string, string> = { 'RA-001': 'Standard-Rahmen für Feldlänge 2,07 m', 'RA-002': 'Für breitere Felder', 'RA-003': 'Für große Feldlängen', 'AB-001': 'Standard-Arbeitsbühne', 'AB-002': 'Für 2,50 m Feldlänge', 'AB-003': 'Für 3,00 m Feldlänge', 'DI-001': 'Stabilisierung je Feld', 'DI-002': 'Stabilisierung 2,50 m', 'DI-003': 'Stabilisierung 3,00 m', 'GE-001': 'Brüstungsgeländer', 'GE-002': 'Geländer 2,50 m', 'GE-003': 'Geländer 3,00 m', 'FP-001': 'Grundplatte je Standfuß', 'KU-001': 'Verbindung Rahmen/Diagonale', 'AN-001': 'Standard-Fassadenanker', 'QR-001': 'Querriegel', 'KO-001': 'Für Überstände und Dacharbeiten', 'SP-001': 'Zugang je 3–4 Ebenen', 'FN-001': 'Fangnetz bei Höhe > 12m', 'SD-001': 'Schutzdach öffentlicher Raum', 'BB-001': 'Seitenschutz/Absturzsicherung', 'LV-001': 'Bei weichem Untergrund' }
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
