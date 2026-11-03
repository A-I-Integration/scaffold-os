import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '../calculations/cad-engine'

const kirche: BuildingParams = {
  lengthM: 13.04, widthM: 20.65, heightM: 31, eavesHeightM: 31, roofHeightM: 0, roofForm: 'flachdach',
  floors: 10, floorHeightsM: Array(10).fill(3.1), windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
  sections: [
    { laengeM: 3.86, hoeheM: 10.9, tiefeM: 20.65, roofForm: 'satteldach', roofHoeheM: 11.47, geruest: false },
    { laengeM: 9.18, hoeheM: 31, tiefeM: 9.14, roofForm: 'flachdach', roofHoeheM: 0 },
  ],
}

describe('Seitenaufbau: volle und teilweise verdeckte Seiten', () => {
  it('Turm neben niedrigerem Anbau: 3 volle Seiten, eine Seite erst über dem Anbaudach', () => {
    const m = generateCADModel(kirche, 'layher-allround')
    expect(m.seitenAufbau?.vollSeiten).toBe(3)
    expect(m.seitenAufbau?.teilSeiten).toHaveLength(1)
    expect(m.seitenAufbau!.teilSeiten[0].seite).toBe('left')
    // Kanten des Satteldachs: Traufe 10,9 m + Dachhöhe 11,47 m × (1 − Tiefe/Halbtiefe-Anteil) – hier mindestens die Traufhöhe
    expect(m.seitenAufbau!.teilSeiten[0].abM).toBeGreaterThanOrEqual(10.9)
    expect(m.seitenAufbau!.teilSeiten[0].abM).toBeLessThan(22.4)
  })
  it('ohne Anbau: vier volle Seiten, keine Teilseite', () => {
    const m = generateCADModel({ ...kirche, sections: [{ laengeM: 9.18, hoeheM: 31, tiefeM: 9.14 }, { laengeM: 5, hoeheM: 31, tiefeM: 9.14 }] }, 'layher-allround')
    expect(m.seitenAufbau?.teilSeiten).toHaveLength(0)
    expect(m.seitenAufbau?.vollSeiten).toBe(4)
  })
  it('einfaches Gebäude ohne Abschnitte: kein Seitenaufbau (alter Text bleibt)', () => {
    const m = generateCADModel({ ...kirche, sections: undefined }, 'layher-allround')
    expect(m.seitenAufbau).toBeUndefined()
  })
})
