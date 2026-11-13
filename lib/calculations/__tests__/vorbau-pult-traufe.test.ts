import { describe, it, expect } from 'vitest'
import { vorbautenAlsAbschnitte, BELAG_UEBER_RINNE_M } from '../cad-engine'

const basis: any = { lengthM: 13.8, widthM: 8.85, heightM: 6.94, eavesHeightM: 5.92, roofHeightM: 1.02, roofForm: 'pultdach', floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
  vorbauten: [{ side: 'front', offsetAlongM: 0, breiteM: 2, tiefeM: 1.5, hoeheM: 3 }] }

describe('Vorbau: Pultdach folgt der Traufe', () => {
  it('Abschnittshöhe liegt höchstens 1,0 m über der Traufe (hier 6,0 m), nicht bei der Firsthöhe', () => {
    const r = vorbautenAlsAbschnitte(basis, 0.5, 0.5)!
    for (const sec of r.sections) { expect(sec.hoeheM).toBeLessThanOrEqual(basis.eavesHeightM + BELAG_UEBER_RINNE_M + 1e-6); expect(sec.hoeheM).toBe(6) }
  })
  it('Flachdach bleibt bei der Gebäudehöhe', () => {
    const r = vorbautenAlsAbschnitte({ ...basis, roofForm: 'flachdach' }, 0.5, 0.5)!
    expect(r.sections[0].hoeheM).toBe(6.94)
  })
})
