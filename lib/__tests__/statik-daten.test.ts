import { describe, it, expect } from 'vitest'
import { statikAusProjektdaten } from '../ansicht-link'
import { bereinigeStatikDaten, pruefeStatikDaten, fehlendeStatikAngaben } from '../statik-daten'

describe('Statik-Projektdaten', () => {
  it('übernimmt gültige Werte und wirft unbekannte weg', () => {
    const d = bereinigeStatikDaten({ windnorm: 'DIN EN 12811-1', vrefMs: 25.04, gelaende: 'III', untergrund: 'Beton / Asphalt', aufbau: '2026-11-02', abbau: '2026-12-01', nutzung: 'oeffentlich', notiz: ' Hinweis ', preis: 99 })
    expect(d).toEqual({ windnorm: 'DIN EN 12811-1', vrefMs: 25, gelaende: 'III', untergrund: 'Beton / Asphalt', aufbau: '2026-11-02', abbau: '2026-12-01', nutzung: 'oeffentlich', notiz: 'Hinweis' })
  })
  it('verwirft ungültige Eingaben', () => {
    const d = bereinigeStatikDaten({ windnorm: 'Quatsch', vrefMs: 500, gelaende: 'V', untergrund: 'x', aufbau: '2026-02-31', abbau: 'morgen', nutzung: 'egal' })
    expect(d).toEqual({})
    expect(bereinigeStatikDaten(null)).toEqual({})
    expect(bereinigeStatikDaten({ vrefMs: NaN })).toEqual({})
  })
  it('prüft die Reihenfolge der Termine', () => {
    expect(pruefeStatikDaten({ aufbau: '2026-12-01', abbau: '2026-11-01' })).toHaveLength(1)
    expect(pruefeStatikDaten({ aufbau: '2026-11-01', abbau: '2026-11-01' })).toHaveLength(0)
  })
  it('nennt fehlende Angaben', () => {
    expect(fehlendeStatikAngaben({})).toHaveLength(9)
    expect(fehlendeStatikAngaben({ vrefMs: 0 as number })).not.toContain('Referenzwindgeschwindigkeit')
  })
  it('liest nur bereinigte Statikdaten aus den Projektdaten', () => {
    expect(statikAusProjektdaten({ statikDaten: { vrefMs: 24, kunde: 'geheim' }, kiResult: {} })).toEqual({ vrefMs: 24 })
    expect(statikAusProjektdaten(undefined)).toEqual({})
  })
})
