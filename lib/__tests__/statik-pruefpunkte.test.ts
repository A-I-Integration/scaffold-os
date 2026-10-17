import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '../calculations/cad-engine'
import { statikPruefpunkte } from '../statik-pruefpunkte'
import { bereinigeStatikDaten } from '../statik-daten'

const basis: BuildingParams = {
  lengthM: 12, widthM: 8, heightM: 30, eavesHeightM: 30, roofHeightM: 0, roofForm: 'flachdach',
  floors: 10, floorHeightsM: Array(10).fill(3), windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front'],
}

describe('Prüfpunkte für den Statiker', () => {
  it('nennt hohe Gerüste und Angaben des Planers', () => {
    const m = generateCADModel(basis, 'layher-allround')
    const p = statikPruefpunkte(m, { bekleidung: 'plane', verankerungsgrund: 'Wärmedämmverbundsystem (WDVS)', sonderlasten: ['schnee'], systemmischung: true })
    const ids = p.map((x) => x.id)
    expect(ids).toEqual(expect.arrayContaining(['hoehe', 'plane', 'anker', 'wdvs', 'misch', 'sonder-schnee']))
  })
  it('ohne Modell und ohne Angaben gibt es keine Punkte', () => {
    expect(statikPruefpunkte(null, {})).toEqual([])
  })
  it('warnt bei Windzone ohne Windgeschwindigkeit', () => {
    expect(statikPruefpunkte(null, { windzone: '2' }).map((x) => x.id)).toContain('wind')
    expect(statikPruefpunkte(null, { windzone: '2', vrefMs: 25 }).map((x) => x.id)).not.toContain('wind')
  })
  it('bereinigt neue Felder', () => {
    expect(bereinigeStatikDaten({ windzone: '5', bekleidung: 'x', sonderlasten: ['schnee', 'quatsch'], systemmischung: 'ja', verankerungsgrund: 'Stahlbeton' }))
      .toEqual({ sonderlasten: ['schnee'], verankerungsgrund: 'Stahlbeton' })
  })
})
