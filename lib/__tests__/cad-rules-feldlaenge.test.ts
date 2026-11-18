import { describe, it, expect } from 'vitest'
import { checkRules } from '@/lib/calculations/cad-rules'
import { GERUEST_SYSTEME } from '@/lib/calculations/geruest-systeme'
import type { BuildingParams } from '@/lib/calculations/cad-engine'

const building = { lengthM: 12, widthM: 8, heightM: 9, eavesHeightM: 9, roofHeightM: 0, roofForm: 'flachdach', floors: 0, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, sides: ['front'], setbackM: 0 } as BuildingParams
const system = GERUEST_SYSTEME.find((s) => s.feldlangenM.includes(3.07)) ?? GERUEST_SYSTEME[0]
const basis = { building, system, fieldCount: 2, levelCount: 5, totalHeightM: 9, totalLengthM: 5.64 }
const hatWarnung = (p: Parameters<typeof checkRules>[0]) => checkRules(p).some((r) => r.rule.id === 'SYS-002' && r.triggered)

describe('SYS-002 Feldlänge im System', () => {
  it('gemischte Standardfelder (3,07 m und 2,57 m) lösen keine Warnung aus, obwohl der Durchschnitt keine Systemlänge ist', () => {
    expect(hatWarnung({ ...basis, fieldLengthsM: [3.07, 2.57] })).toBe(false)
  })
  it('eine nicht im System vorhandene Feldlänge warnt', () => {
    expect(hatWarnung({ ...basis, fieldLengthsM: [3.07, 1.23] })).toBe(true)
  })
  it('ohne Einzellängen gilt ersatzweise der Durchschnitt', () => {
    expect(hatWarnung({ ...basis, fieldCount: 2, totalLengthM: 6.14 })).toBe(false)
  })
})
