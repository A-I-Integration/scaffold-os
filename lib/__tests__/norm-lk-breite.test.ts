import { describe, it, expect } from 'vitest'
import { mindestBreiteFuerLastklasse } from '../geruestklassen'
import { checkRules, type RuleCheckParams } from '../calculations/cad-rules'
import { GERUEST_SYSTEME } from '../calculations/geruest-systeme'
import { rechteckUmriss } from '../calculations/cad-umriss'
import { erzeugeLeistungsverzeichnis, LV_STANDARD_EINGABEN } from '../leistungsverzeichnis'
import { generateCADModel, generateBillOfMaterials, calculateLogistics, type BuildingParams } from '../calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'

const gebaeude: BuildingParams = {
  lengthM: 10, widthM: 8, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach',
  floors: 4, floorHeightsM: [3, 3, 3, 3], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front'], umriss: rechteckUmriss(10, 8),
}
const system = GERUEST_SYSTEME.find((s) => s.rahmenBreitenM.includes(1.09) && s.rahmenBreitenM.includes(0.73)) ?? null

function params(b: Partial<BuildingParams>): RuleCheckParams {
  return { building: { ...gebaeude, ...b }, system, fieldCount: 3, levelCount: 4, totalHeightM: 12, totalLengthM: 10 }
}
const regel = (p: RuleCheckParams) => checkRules(p).find((r) => r.rule.id === 'NORM-LK-BREITE')!

describe('Norm: Lastklasse 4–6 braucht mindestens W09 (DIN EN 12811-1)', () => {
  it('Mindestbreite je Lastklasse', () => {
    expect(mindestBreiteFuerLastklasse(3)).toBeNull()
    expect(mindestBreiteFuerLastklasse(undefined)).toBeNull()
    expect(mindestBreiteFuerLastklasse(4)).toBe(0.9)
    expect(mindestBreiteFuerLastklasse(6)).toBe(0.9)
  })
  it('Regel löst bei LK 4 mit 0,73 m aus und schlägt 1,09 m vor', () => {
    expect(system).not.toBeNull()
    const r = regel(params({ lastklasse: 4 }))
    expect(r.triggered).toBe(true)
    expect(r.fixedValue?.geruestOptionen?.breiteM).toBe(1.09)
  })
  it('Regel löst nicht aus bei LK 3 oder ausreichender Breite', () => {
    expect(regel(params({ lastklasse: 3 })).triggered).toBe(false)
    expect(regel(params({ lastklasse: 4, geruestOptionen: { breiteM: 1.09 } })).triggered).toBe(false)
  })
  it('ohne gewählte Lastklasse gilt der Standard (LK 4): schmales Gerüst löst aus, 1,09 m nicht', () => {
    expect(regel(params({})).triggered).toBe(true)
    expect(regel(params({ geruestOptionen: { breiteM: 1.09 } })).triggered).toBe(false)
  })
  it('LV warnt bei LK 4 mit schmalem CAD-Gerüst, nicht bei LK 3', () => {
    const model = generateCADModel(gebaeude, 'layher-allround')
    const materials: MaterialItem[] = generateBillOfMaterials(model).map((m) => ({ ...m, unitPrice: 10, totalPrice: m.quantity * 10 }))
    const log = calculateLogistics(model, materials, 2.0)
    const q = { model, materials, aufbauStunden: log.aufbauStunden, abbauStunden: log.abbauStunden }
    const lk4 = erzeugeLeistungsverzeichnis(q, { ...LV_STANDARD_EINGABEN, lastklasse: 4 })
    const lk3 = erzeugeLeistungsverzeichnis(q, { ...LV_STANDARD_EINGABEN, lastklasse: 3 })
    expect(lk4.annahmen.some((a) => a.includes('ACHTUNG Lastklasse 4'))).toBe(true)
    expect(lk3.annahmen.some((a) => a.includes('ACHTUNG Lastklasse'))).toBe(false)
  })
})
