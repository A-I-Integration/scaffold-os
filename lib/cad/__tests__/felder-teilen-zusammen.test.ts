// Felder teilen und zusammenführen (Phase 4): Längen kommen vom Aufrufer (Herstellerkatalog), das Modell rückt nach und baut neu.
import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams, type ScaffoldField } from '@/lib/calculations/cad-engine'
import { teileFeld, fuehreFelderZusammen, pruefeSpaltenOperation, wendeAenderungenAn, beschreibeAenderung } from '@/lib/cad/bereiche'
import { erzeugeProjektdatei, liesProjektdatei } from '@/lib/cad/projektdatei'

const b = { lengthM: 14, widthM: 9, heightM: 8, floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'flachdach', sides: ['front', 'back', 'left', 'right'], geruestOptionen: { treppe: false, tuerenFreihalten: false } } as unknown as BuildingParams
const m = generateCADModel(b, 'layher-allround')
const reihe = (mm: typeof m, level: number): ScaffoldField[] => mm.fields.filter((f) => f.side === 'front' && f.levelIndex === level).sort((x, y) => x.positionX - y.positionX)
const luecken = (fs: ScaffoldField[]) => fs.slice(1).map((f, i) => Math.round((f.positionX - f.lengthM / 2 - (fs[i].positionX + fs[i].lengthM / 2)) * 1000) / 1000)

describe('Feld teilen', () => {
  const vorher = reihe(m, 0)
  const ziel = vorher.findIndex((f) => !f.isCorner && f.lengthM > 1.5)
  const alt = vorher[ziel]
  const neu = teileFeld(m, { art: 'teilen', seite: 'front', spalte: ziel, laengenM: [1.09, 1.57] })
  it('aus einem Feld werden zwei, in allen Lagen, lückenlos aneinander', () => {
    for (const li of [0, 1]) {
      const r = reihe(neu, li)
      expect(r.length).toBe(reihe(m, li).length + 1)
      expect(luecken(r).every((x) => Math.abs(x) < 0.01), `Lage ${li}: ${luecken(r)}`).toBe(true)
    }
    expect(neu.fieldCount).toBe(m.fieldCount + 1)
  })
  it('die neuen Längen stimmen, der Anfang bleibt stehen, der Rest rückt um die Differenz nach', () => {
    const r = reihe(neu, 0)
    expect(r[ziel].lengthM).toBe(1.09)
    expect(r[ziel + 1].lengthM).toBe(1.57)
    expect(r[ziel].positionX - 1.09 / 2).toBeCloseTo(alt.positionX - alt.lengthM / 2, 2)
    const delta = 1.09 + 1.57 - alt.lengthM
    const hinten = reihe(m, 0)[ziel + 1]
    expect(r[ziel + 2].positionX).toBeCloseTo(hinten.positionX + delta, 2)
    expect(neu.totalLengthM).toBeCloseTo(m.totalLengthM + delta, 1)
  })
  it('Bauteile sind neu gebaut, IDs eindeutig, mehr Rahmen als vorher', () => {
    const ids = neu.components3D.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(neu.components3D.filter((c) => c.type === 'frame').length).toBeGreaterThan(m.components3D.filter((c) => c.type === 'frame').length)
  })
  it('das Ausgangsmodell bleibt unverändert', () => {
    expect(reihe(m, 0).length).toBe(vorher.length)
  })
})

describe('Felder zusammenführen', () => {
  const vorher = reihe(m, 0)
  const von = vorher.findIndex((f, i) => i > 0 && i < vorher.length - 2 && !f.isCorner && !vorher[i + 1].isCorner)
  const neu = fuehreFelderZusammen(m, { art: 'zusammen', seite: 'front', spalte: von, feldlaengeM: 3.07 })
  it('aus zwei Feldern wird eines, in allen Lagen, lückenlos', () => {
    for (const li of [0, 1]) {
      const r = reihe(neu, li)
      expect(r.length).toBe(reihe(m, li).length - 1)
      expect(luecken(r).every((x) => Math.abs(x) < 0.01), `Lage ${li}: ${luecken(r)}`).toBe(true)
    }
    expect(reihe(neu, 0)[von].lengthM).toBe(3.07)
  })
  it('Eckfelder lassen sich nicht zusammenführen, Ende der Seite meldet einen Grund', () => {
    const e = pruefeSpaltenOperation(m, 'front', 0, 2)
    expect(e.ok).toBe(false)
    expect(pruefeSpaltenOperation(m, 'front', vorher.length - 1, 2)).toMatchObject({ ok: false })
    expect(fuehreFelderZusammen(m, { art: 'zusammen', seite: 'front', spalte: 0, feldlaengeM: 3.07 })).toBe(m)
  })
  it('Umriss-Modell: nicht unterstützt, keine Änderung', () => {
    const u = generateCADModel({ ...b, umriss: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 0, z: 9 }] } as BuildingParams, 'layher-allround')
    expect(pruefeSpaltenOperation(u, 'front', 1, 1).ok).toBe(false)
  })
})

describe('Änderungsliste und Projektdatei', () => {
  it('wendeAenderungenAn führt Teilen und Zusammenführen nacheinander aus', () => {
    const l = wendeAenderungenAn(m, [{ art: 'teilen', seite: 'front', spalte: 2, laengenM: [1.09, 1.57] }, { art: 'zusammen', seite: 'front', spalte: 2, feldlaengeM: 2.57 }])
    expect(reihe(l, 0).length).toBe(reihe(m, 0).length)
    expect(beschreibeAenderung({ art: 'teilen', seite: 'front', spalte: 2, laengenM: [1.09, 1.57] })).toContain('in zwei Felder')
  })
  it('wird in der Projektdatei gespeichert und gelesen', () => {
    const liste = [{ art: 'teilen' as const, seite: 'front' as const, spalte: 2, laengenM: [1.09, 1.57] as [number, number] }, { art: 'zusammen' as const, seite: 'back' as const, spalte: 1, feldlaengeM: 2.57 }]
    const d = erzeugeProjektdatei({ building: b, systemId: 'layher-allround', statikDaten: {} as never, notizen: [], bereiche: liste })
    const r = liesProjektdatei(JSON.stringify(d))
    expect(r.ok && r.daten.bereiche).toEqual(liste)
  })
})
