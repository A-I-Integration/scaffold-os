import { describe, it, expect } from 'vitest'
import { platzierungAusTreffer, verschiebePlatzierung, gleicheLage, platzierungIdVon } from '../calculations/cad-platzierung'
import { generateCADModel } from '../calculations/cad-engine'
import type { BuildingParams, ManualPlacement } from '../calculations/cad-engine'

const building = { lengthM: 18, widthM: 14, heightM: 8, eavesHeightM: 8, roofForm: 'flachdach', overhangM: 0.5 } as unknown as BuildingParams
const model = generateCADModel(building, 'layher-allround')

function felder(side: string, level: number) {
  return model.fields.filter((f) => f.side === side && f.levelIndex === level && !f.isCorner)
}

describe('platzierungAusTreffer', () => {
  it('Anker sitzt genau am Treffpunkt', () => {
    const p = platzierungAusTreffer(model, 'anchor', [1.1, 2.2, 3.3], 'front', 1)
    expect([p.positionX, p.positionY, p.positionZ]).toEqual([1.1, 2.2, 3.3])
    expect(p.fieldId).toBeUndefined()
  })
  it('Treppe rastet auf das nächste Feld der Seite und Lage ein', () => {
    const f = felder('front', 0)
    expect(f.length).toBeGreaterThan(2)
    const ziel = f[2]
    const p = platzierungAusTreffer(model, 'stair', [ziel.positionX + 0.3, 1, ziel.positionZ], 'front', 0)
    expect(p.fieldId).toBe(ziel.id)
    expect(p.positionX).toBe(ziel.positionX)
    expect(p.positionZ).toBe(ziel.positionZ)
  })
  it('Treppe an der Seitenwand rastet entlang Z ein (synthetische Felder)', () => {
    const fake = { fields: [0, 1, 2].map((i) => ({ id: `f-left-0-${i}`, side: 'left', levelIndex: 0, positionX: -5, positionZ: i * 2.5, lengthM: 2.5, widthM: 0.73, positionY: 0, index: i })) } as any
    const p = platzierungAusTreffer(fake, 'stair', [-5, 1, 2.9], 'left', 0)
    expect(p.fieldId).toBe('f-left-0-1')
    expect(p.positionZ).toBe(2.5)
  })
})

describe('verschiebePlatzierung', () => {
  const alt: ManualPlacement = { id: 'manual-stair-1', type: 'stair', positionX: 0, positionY: 0, positionZ: 0, side: 'front', levelIndex: 0, fieldId: 'alt', notes: 'Nord' }
  it('Treppe wandert in ein anderes Feld, ID und Notiz bleiben', () => {
    const f = felder('front', 1)
    const ziel = f[f.length - 1]
    const neu = verschiebePlatzierung(model, alt, [ziel.positionX, 3, ziel.positionZ], 'front', 1)
    expect(neu.id).toBe('manual-stair-1')
    expect(neu.notes).toBe('Nord')
    expect(neu.fieldId).toBe(ziel.id)
    expect(neu.levelIndex).toBe(1)
  })
  it('Anker behält keine alte fieldId', () => {
    const neu = verschiebePlatzierung(model, { ...alt, type: 'anchor', fieldId: 'alt' }, [1, 2, 3], 'back', 2)
    expect(neu.fieldId).toBeUndefined()
    expect(neu.side).toBe('back')
  })
})

describe('gleicheLage', () => {
  const a = { type: 'anchor' as const, positionX: 1, positionY: 2, positionZ: 3, side: 'front' as const, levelIndex: 0 }
  it('erkennt kleine Bewegung als gleich, große nicht', () => {
    expect(gleicheLage(a, { ...a, positionX: 1.01 })).toBe(true)
    expect(gleicheLage(a, { ...a, positionX: 1.2 })).toBe(false)
    expect(gleicheLage(a, { ...a, levelIndex: 1 })).toBe(false)
    expect(gleicheLage(a, { ...a, fieldId: 'x' })).toBe(false)
  })
})

describe('Leiter', () => {
  it('steht mittig über der getroffenen Lage, unabhängig von der Klickhöhe', () => {
    const lage = model.levels.find((l) => l.index === 1)!
    const p = platzierungAusTreffer(model, 'ladder', [2, lage.bottomY + 0.1, 7], 'front', 1)
    expect(p.positionY).toBeCloseTo(lage.bottomY + lage.heightM / 2)
    expect(p.positionX).toBe(2)
    expect(p.fieldId).toBeUndefined()
  })
  it('Verschieben in eine andere Lage setzt die Höhe neu und behält die ID', () => {
    const vorher = { id: 'manual-ladder-1', ...platzierungAusTreffer(model, 'ladder', [2, 1, 7], 'front', 0) } as ManualPlacement
    const neu = verschiebePlatzierung(model, vorher, [5, 99, 7], 'front', 1)
    const lage = model.levels.find((l) => l.index === 1)!
    expect(neu.id).toBe('manual-ladder-1')
    expect(neu.positionY).toBeCloseTo(lage.bottomY + lage.heightM / 2)
    expect(neu.positionX).toBe(5)
  })
})

describe('platzierungIdVon', () => {
  const pl = [{ id: 'manual-stair-1' }, { id: 'manual-anchor-2' }]
  it('ordnet Treppenteile der Platzierung zu', () => {
    expect(platzierungIdVon('manual-stair-1', pl)).toBe('manual-stair-1')
    expect(platzierungIdVon('manual-stair-1-step-3', pl)).toBe('manual-stair-1')
    expect(platzierungIdVon('deck-field-front-0-1', pl)).toBeNull()
    expect(platzierungIdVon('manual-stair-10', pl)).toBeNull()
  })
})
