import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '../cad-engine'
import { umrissBox } from '../cad-umriss'

const rechteck = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]
// Plan-Basis (Mitte der Geschosse bei 0): EG 14 × 9, OG 10 × 9 bündig an der linken Kante
const basis = (extra: Partial<BuildingParams> = {}) => ({
  lengthM: 14, widthM: 9, heightM: 6, eavesHeightM: 6, roofHeightM: 0, roofForm: 'flachdach', floors: 2,
  umriss: rechteck(-7, -4.5, 7, 4.5), sides: ['front', 'back', 'left', 'right'],
  ...extra,
}) as unknown as BuildingParams

describe('Gestuftes Gebäude aus bestätigten Geschossen', () => {
  it('Geschosse liegen in Szenen-Koordinaten des Hauptumrisses, mit Rücksprung', () => {
    const m = generateCADModel(basis({ fassadenGeschosse: [{ name: 'EG', obenM: 3, umriss: rechteck(-7, -4.5, 7, 4.5) }, { name: 'OG', obenM: 6, umriss: rechteck(-7, -4.5, 3, 4.5) }] }), 'layher-allround')
    const gk = m.building.geschossKoerper!
    expect(gk).toHaveLength(2)
    const hauptBox = umrissBox(m.building.umriss!)
    const eg = umrissBox(gk[0].umriss), og = umrissBox(gk[1].umriss)
    expect(eg.lengthM).toBeCloseTo(hauptBox.lengthM, 2)
    expect(eg.mitteX).toBeCloseTo(hauptBox.mitteX, 2)
    expect(eg.mitteZ).toBeCloseTo(hauptBox.mitteZ, 2)
    expect(og.lengthM).toBeCloseTo(10, 2)
    // OG bündig an der linken Kante des EG
    expect(og.mitteX - og.lengthM / 2).toBeCloseTo(eg.mitteX - eg.lengthM / 2, 2)
  })
  it('ohne bestätigte Geschosse (oder nur eines) bleibt der einfache Körper', () => {
    expect(generateCADModel(basis(), 'layher-allround').building.geschossKoerper).toBeUndefined()
    const eins = generateCADModel(basis({ fassadenGeschosse: [{ name: 'EG', obenM: 6, umriss: rechteck(-7, -4.5, 7, 4.5) }] }), 'layher-allround')
    expect(eins.building.geschossKoerper).toBeUndefined()
  })
})
