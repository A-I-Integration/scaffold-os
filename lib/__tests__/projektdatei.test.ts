import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { generateCADModel } from '../calculations/cad-engine'
import { rechteckUmriss } from '../calculations/cad-umriss'
import { erzeugeProjektdatei, liesProjektdatei, PROJEKTDATEI_FORMAT, PROJEKTDATEI_VERSION } from '../cad/projektdatei'

const gebaeude = { lengthM: 10, widthM: 8, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach' as const, floors: 4, floorHeightsM: [3, 3, 3, 3], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front' as const], umriss: rechteckUmriss(10, 8) }

describe('Projektdatei', () => {
  it('speichern und wieder laden ergibt dasselbe Modell', () => {
    const d = erzeugeProjektdatei({ building: gebaeude, systemId: 'layher-allround', statikDaten: { vrefMs: 25 }, notizen: [] })
    const e = liesProjektdatei(JSON.stringify(d))
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(generateCADModel(e.daten.building, e.daten.systemId).totalAreaM2).toBe(generateCADModel(gebaeude, 'layher-allround').totalAreaM2)
    expect(e.daten.statikDaten.vrefMs).toBe(25)
  })
  it('lehnt fremde, kaputte und zu neue Dateien ab', () => {
    expect(liesProjektdatei('kein json').ok).toBe(false)
    expect(liesProjektdatei('{"format":"anderes"}').ok).toBe(false)
    expect(liesProjektdatei(JSON.stringify({ format: 'scaffoldos-cad-projekt', version: 99, building: gebaeude })).ok).toBe(false)
    expect(liesProjektdatei(JSON.stringify({ format: 'scaffoldos-cad-projekt', version: 1, building: { ...gebaeude, heightM: 'hoch' } })).ok).toBe(false)
    expect(liesProjektdatei(JSON.stringify({ format: 'scaffoldos-cad-projekt', version: 1, building: { ...gebaeude, lengthM: 1e9 } })).ok).toBe(false)
  })
  it('verwirft Ungültiges statt es zu übernehmen', () => {
    const e = liesProjektdatei(JSON.stringify({ format: 'scaffoldos-cad-projekt', version: 1, systemId: 'gibt-es-nicht', building: { ...gebaeude, roofForm: 'quatsch', umriss: [{ x: 1, z: 'a' }, { x: 2, z: 2 }, { x: 3, z: 3 }], __proto__: { x: 1 } }, statikDaten: { vrefMs: 9999, evil: 1 } }))
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(e.daten.systemId).toBe('layher-allround')
    expect(e.daten.building.roofForm).toBe('flachdach')
    expect(e.daten.building.umriss).toBeUndefined()
    expect(e.daten.statikDaten).toEqual({})
    expect(e.verworfen.length).toBeGreaterThan(0)
  })
  it('Beispieldatei Kirchturm ist lesbar, als Testdaten gekennzeichnet und ergibt ein Modell', () => {
    const e = liesProjektdatei(readFileSync('public/beispiele/kirchturm-testdaten.scaffold.json', 'utf8'))
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(e.daten.testdaten).toBe(true)
    expect(e.verworfen).toEqual([])
    const m = generateCADModel(e.daten.building, e.daten.systemId)
    expect(m.totalAreaM2).toBeCloseTo(36 * 58, 0)
  })
  it('Beispiel Kirche mit Turm: nur Turm samt Helm eingerüstet, Schiff nur dargestellt', () => {
    const e = liesProjektdatei(readFileSync('public/beispiele/kirche-mit-turm-testdaten.scaffold.json', 'utf8'))
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(e.daten.testdaten).toBe(true)
    expect(e.verworfen).toEqual([])
    const m = generateCADModel(e.daten.building, e.daten.systemId)
    expect(m.totalHeightM).toBe(58)
    // rechte Seite nur als Turmwand zum Schiff; das Gerüst steht auf dem Schiffdach (Traufe 12 m, First 20 m)
    const rechts = m.fields.filter((f) => f.side === 'right')
    expect(rechts.length).toBeGreaterThan(0)
    expect(Math.min(...rechts.map((f) => f.positionY))).toBeGreaterThanOrEqual(12 - 2.5)
    expect(m.warnings.some((w) => w.code === 'SECTIONS_TEIL_GERUEST')).toBe(true)
  })
})

describe('Projektdatei: Türen, Kederplane, Aufzug', () => {
  const basisGebaeude = { lengthM: 10, widthM: 8, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach', floors: 3, windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] }
  const datei = (building: Record<string, unknown>) => JSON.stringify({ format: PROJEKTDATEI_FORMAT, version: PROJEKTDATEI_VERSION, name: 'x', building, systemId: 'layher-allround', statikDaten: {}, notizen: [] })

  it('behält Türen, Türen-freihalten, Kederplane und Aufzug', () => {
    const r = liesProjektdatei(datei({
      ...basisGebaeude,
      tueren: [{ id: 'a', side: 'front', offsetAlongM: -2, widthM: 1.1, heightM: 2.2 }],
      geruestOptionen: { tuerenFreihalten: false, kederplane: { vonM: 4, bisM: 12 }, aufzug: { seite: 'right', gemietet: true, bisM: 12, haltestellen: 3, kostenAufbauEur: 100 } },
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.daten.building.tueren).toEqual([{ id: 'a', side: 'front', offsetAlongM: -2, widthM: 1.1, heightM: 2.2 }])
    expect(r.daten.building.geruestOptionen).toMatchObject({ tuerenFreihalten: false, kederplane: { vonM: 4, bisM: 12 }, aufzug: { seite: 'right', gemietet: true, bisM: 12, haltestellen: 3, kostenAufbauEur: 100 } })
  })

  it('behält Aufschlag, Flügel und Anschlag der Tür', () => {
    const r = liesProjektdatei(datei({ ...basisGebaeude, tueren: [{ id: 'a', side: 'front', offsetAlongM: 0, widthM: 1.2, heightM: 2.1, aufschlag: 'aussen', fluegel: 1, anschlag: 'plus' }] }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.daten.building.tueren?.[0]).toMatchObject({ aufschlag: 'aussen', fluegel: 1, anschlag: 'plus' })
  })

  it('verwirft ungültige Türen mit Hinweis', () => {
    const r = liesProjektdatei(datei({ ...basisGebaeude, tueren: [{ id: 'a', side: 'oben', offsetAlongM: 0, widthM: 1, heightM: 2 }] }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.daten.building.tueren).toBeUndefined()
    expect(r.verworfen.some((v) => v.startsWith('Türen'))).toBe(true)
  })
})
