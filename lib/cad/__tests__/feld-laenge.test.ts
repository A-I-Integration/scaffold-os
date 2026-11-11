import { describe, it, expect } from 'vitest'
import { generateCADModel, feldEntlangFassade, type BuildingParams } from '@/lib/calculations/cad-engine'
import { feldSpalteVonBauteil, setzeFeldLaenge, wendeAenderungenAn } from '../bereiche'

const b: BuildingParams = { lengthM: 12, widthM: 8, heightM: 6, eavesHeightM: 0, roofHeightM: 0, roofForm: 'flachdach', floors: 2, sides: ['front'] } as BuildingParams
const unten = (m: ReturnType<typeof generateCADModel>) => m.fields.filter((f) => f.side === 'front' && f.levelIndex === 0).sort((x, y) => x.positionX - y.positionX)

describe('Feldlänge von Hand', () => {
  it('Spalte wird länger, Rest rückt nach, alle Lagen folgen, Bauteile neu', () => {
    const m = generateCADModel(b, 'layher-allround')
    const u = unten(m)
    const alt = u[1].lengthM
    const neu = alt === 3.07 ? 2.57 : 3.07
    const r = setzeFeldLaenge(m, { art: 'laenge', seite: 'front', spalte: 1, feldlaengeM: neu })
    const un = unten(r)
    expect(un[1].lengthM).toBeCloseTo(neu, 3)
    expect(un[0].positionX).toBeCloseTo(u[0].positionX, 3)
    // Anfang der Spalte bleibt, Ende wandert um delta; das nächste Feld rückt um delta
    expect(feldEntlangFassade('front', un[1].positionX, un[1].positionZ, r.building) - neu / 2).toBeCloseTo(feldEntlangFassade('front', u[1].positionX, u[1].positionZ, m.building) - alt / 2, 2)
    expect(un[2].positionX - u[2].positionX).toBeCloseTo(neu - alt, 2)
    // zweite Lage: dieselbe Spalte hat dieselbe Länge
    const l2 = r.fields.find((f) => f.side === 'front' && f.levelIndex === 1 && Math.abs(f.positionX - un[1].positionX) < 0.01)!
    expect(l2.lengthM).toBeCloseTo(neu, 3)
    expect(r.totalLengthM).toBeCloseTo(m.totalLengthM + neu - alt, 2)
    const rahmen = r.components3D.find((c) => c.id === `deck-${un[1].id}`)!
    expect(rahmen.scale[0]).toBeCloseTo(neu - 0.05, 3)
  })
  it('gleiche Länge ändert nichts', () => {
    const m = generateCADModel(b, 'layher-allround')
    expect(setzeFeldLaenge(m, { art: 'laenge', seite: 'front', spalte: 1, feldlaengeM: unten(m)[1].lengthM })).toBe(m)
  })
  it('Spalte aus Klick: Nummer, Länge, links/rechts', () => {
    const m = generateCADModel(b, 'layher-allround')
    const u = unten(m)
    const bt = m.components3D.find((c) => c.id === `deck-${u[2].id}`)!
    const s = feldSpalteVonBauteil(m, bt.id)!
    expect(s.seite).toBe('front'); expect(s.spalte).toBe(2); expect(s.anzahl).toBe(u.length)
    expect(s.rechts).toBe('ende'); expect(s.links).toBe('anfang')
    const mh = generateCADModel({ ...b, sides: ['back'] }, 'layher-allround')
    const h = feldSpalteVonBauteil(mh, mh.components3D.find((c) => c.type === 'deck')!.id)!
    expect(h.rechts).toBe('anfang')
  })
  it('in der Änderungsliste nach „anhängen“ und mit Länge kombinierbar', () => {
    const m = generateCADModel(b, 'layher-allround')
    const r = wendeAenderungenAn(m, [{ art: 'erweitern', seite: 'front', ende: 'ende', anzahl: 1, feldlaengeM: 3.07 }, { art: 'laenge', seite: 'front', spalte: 0, feldlaengeM: 2.57 }])
    expect(unten(r)).toHaveLength(unten(m).length + 1)
    expect(unten(r)[0].lengthM).toBeCloseTo(2.57, 3)
  })
})
