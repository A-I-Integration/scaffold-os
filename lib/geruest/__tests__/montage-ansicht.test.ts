import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { erzeugeMontageAnsichten } from '../montage-ansicht'

const haus = (extra: Partial<BuildingParams> = {}) => generateCADModel({ lengthM: 12, widthM: 9, heightM: 9, eavesHeightM: 6, roofHeightM: 3, roofForm: 'satteldach', ...extra } as unknown as BuildingParams, 'layher-allround')

describe('Montage-Ansicht', () => {
  it('zeichnet je eingerüsteter Seite eine Ansicht mit Feldbreiten und Lagenhöhen', () => {
    const m = haus()
    const z = erzeugeMontageAnsichten(m)
    expect(z).toHaveLength(1)
    const t = z[0].texte.map((x) => x.text)
    const breiten = m.fields.filter((f) => f.levelIndex === 0).length
    expect(t.filter((x) => /^\d+,\d{4} m$/.test(x)).length).toBe(breiten + m.levelCount)
    expect(z[0].linien.length).toBeGreaterThan(20)
  })
  it('mehrere Seiten ergeben mehrere Ansichten', () => {
    const m = haus({ sides: ['front', 'right', 'back', 'left'] } as Partial<BuildingParams>)
    expect(erzeugeMontageAnsichten(m).length).toBe(4)
  })
  it('zeichnet das Treppenfeld mit Lauf (mehr Linien als ohne Treppe)', () => {
    const mit = erzeugeMontageAnsichten(haus())[0].linien.length
    const ohne = erzeugeMontageAnsichten(haus({ geruestOptionen: { treppe: false } } as Partial<BuildingParams>))[0].linien.length
    expect(mit).not.toBe(ohne)
  })
})
