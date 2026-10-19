import { describe, it, expect } from 'vitest'
import { generateCADModel, GEBAEUDE_SZENEN_VERSATZ_M, type BuildingParams } from '../cad-engine'

const basis: BuildingParams = {
  lengthM: 20, widthM: 10, heightM: 10, eavesHeightM: 10, roofHeightM: 0, roofForm: 'flachdach',
  floors: 3, floorHeightsM: [3, 3, 4], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'], lastklasse: 3,
}
const SYS = 'layher-allround'

/** Abstand Wand → Innenlinie je Seite. Das Gebäude steht in der Szene bei z = -0,5 ... -W-0,5 und x = ±L/2. */
function abstaende(m: ReturnType<typeof generateCADModel>) {
  const b = m.building
  const L = b.lengthM, W = b.widthM
  const f = (side: string) => m.levels.filter((l) => l.index === 0).flatMap((l) => l.fields).find((x) => x.side === side)!
  return {
    front: f('front').positionZ - -GEBAEUDE_SZENEN_VERSATZ_M,
    back: -(W + GEBAEUDE_SZENEN_VERSATZ_M) - f('back').positionZ,
    left: -L / 2 - f('left').positionX,
    right: f('right').positionX - L / 2,
  }
}

describe('Wandabstand: eingestellter Wert = Abstand Wand bis Innenlinie des Gerüsts', () => {
  it('Standard 0,30 m an allen vier Seiten', () => {
    const a = abstaende(generateCADModel(basis, SYS))
    for (const v of Object.values(a)) expect(v).toBeCloseTo(0.3, 2)
  })

  it('eingestellter Wandabstand wird 1:1 übernommen', () => {
    for (const w of [0.1, 0.2, 0.4]) {
      const a = abstaende(generateCADModel({ ...basis, geruestOptionen: { wandabstandM: w } }, SYS))
      for (const v of Object.values(a)) expect(v).toBeCloseTo(w, 2)
    }
  })

  it('auch bei mehrteiligem Gebäude (vorne und hinten, gleiche Tiefe)', () => {
    const m = generateCADModel({
      ...basis, lengthM: 30, sections: [
        { laengeM: 10, hoeheM: 10, roofForm: 'flachdach', roofHoeheM: 0 },
        { laengeM: 20, hoeheM: 6, roofForm: 'flachdach', roofHoeheM: 0 },
      ],
    }, SYS)
    const a = abstaende(m)
    expect(a.front).toBeCloseTo(0.3, 2)
    expect(a.back).toBeCloseTo(0.3, 2)
  })

  it('Warnung "Wandabstand groß" bezieht sich weiter auf den eingestellten Wert', () => {
    const m = generateCADModel({ ...basis, geruestOptionen: { wandabstandM: 0.35 } }, SYS)
    expect(m.warnings.some((w) => w.code === 'WANDABSTAND_GROSS')).toBe(true)
    const n = generateCADModel({ ...basis, geruestOptionen: { wandabstandM: 0.3 } }, SYS)
    expect(n.warnings.some((w) => w.code === 'WANDABSTAND_GROSS')).toBe(false)
  })

  it('Gerüst rückt nur an die Wand: Feldzahl, Länge und Fläche bleiben gleich', () => {
    const a = generateCADModel(basis, SYS)
    const b = generateCADModel({ ...basis, geruestOptionen: { wandabstandM: 0.3 } }, SYS)
    expect(b.fieldCount).toBe(a.fieldCount)
    expect(b.totalAreaM2).toBe(a.totalAreaM2)
  })
})
