import { describe, it, expect } from 'vitest'
import { hausAusEingabe, pruefeSchritt, START_EINGABE } from '../HausAssistent'
import { generateCADModel } from '@/lib/calculations/cad-engine'

const basis = { lengthM: 0, widthM: 0, heightM: 0, eavesHeightM: 0, roofHeightM: 0, roofForm: 'flachdach', floors: 1, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] } as never

describe('Haus-Assistent', () => {
  it('Rechteck mit Satteldach: Gesamthöhe = Traufe + Dach, Öffnungen übernommen, alle Seiten', () => {
    const { building, umriss } = hausAusEingabe({ ...START_EINGABE, laenge: 14, breite: 6, traufe: 7, dach: 'satteldach', dachHoehe: 3, fenster: 4, tueren: 1 }, basis)
    expect(umriss).toBeUndefined()
    expect([building.lengthM, building.widthM, building.heightM, building.eavesHeightM, building.roofHeightM]).toEqual([14, 6, 10, 7, 3])
    expect([building.windowCount, building.doorCount]).toEqual([4, 1])
    expect(building.sides).toEqual(['front', 'back', 'left', 'right'])
  })
  it('Flachdach hat keine Dachhöhe', () => {
    expect(hausAusEingabe({ ...START_EINGABE, dach: 'flachdach', dachHoehe: 5 }, basis).building.roofHeightM).toBe(0)
  })
  it('L-Form und rund liefern einen Umriss, Öffnungen entfallen', () => {
    const l = hausAusEingabe({ ...START_EINGABE, form: 'lform', fenster: 3 }, basis)
    expect(l.umriss?.length).toBe(6)
    expect(l.building.windowCount).toBe(0)
    expect(l.building.umriss).toBe(l.umriss)
    const r = hausAusEingabe({ ...START_EINGABE, form: 'rund', durchmesser: 10, kanten: 12 }, basis)
    expect(r.umriss?.length).toBe(12)
  })
  it('das Modell nimmt die Gebäudedaten an (Gesamthöhe, Länge)', () => {
    const { building } = hausAusEingabe({ ...START_EINGABE, laenge: 14, breite: 6, traufe: 8, dach: 'flachdach' }, basis)
    const m = generateCADModel(building, 'mj-uniconnect')
    expect(m.totalHeightM).toBe(8)
    expect(m.totalLengthM).toBeGreaterThanOrEqual(14)
  })
  it('prüft die Schritte', () => {
    expect(pruefeSchritt(2, { ...START_EINGABE, laenge: NaN })).toContain('Länge fehlt.')
    expect(pruefeSchritt(2, { ...START_EINGABE, form: 'lform', schenkelLaenge: 20 })).toContain('Der Anbau muss kleiner sein als das Gesamtmaß.')
    expect(pruefeSchritt(3, { ...START_EINGABE, dach: 'satteldach', dachHoehe: 0 })).toContain('Dachhöhe fehlt.')
    expect(pruefeSchritt(3, { ...START_EINGABE, geschosse: 0 })).toContain('Geschosse: mindestens 1.')
    expect(pruefeSchritt(1, START_EINGABE)).toEqual([])
  })
})
