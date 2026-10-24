import { describe, it, expect } from 'vitest'
import { nachbarDach } from '@/lib/cad/nachbardach'
import type { BuildingParams } from '@/lib/calculations/cad-engine'

const b = (sections: unknown[]) => ({ widthM: 10, sections } as unknown as BuildingParams)

describe('nachbarDach', () => {
  it('Satteldach: Fläche = Länge × 1,5 ÷ cos(Neigung)', () => {
    const d = nachbarDach(b([
      { geruest: true, tiefeM: 8 },
      { geruest: false, tiefeM: 8, roofForm: 'satteldach', roofHoeheM: 4 },
    ]))
    expect(d).not.toBeNull()
    expect(d!.laengeM).toBe(8)
    expect(d!.neigungGrad).toBe(45)
    expect(d!.flaecheM2).toBeCloseTo(8 * 1.5 / Math.cos(Math.PI / 4), 1)
  })
  it('Flachdach: cos=1; ohne Nachbar: null', () => {
    expect(nachbarDach(b([{ geruest: true, tiefeM: 6 }, { geruest: false, tiefeM: 6, roofForm: 'flachdach' }]))!.flaecheM2).toBe(9)
    expect(nachbarDach(b([{ geruest: true, tiefeM: 6 }]))).toBeNull()
  })
})
