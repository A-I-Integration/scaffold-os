import { describe, it, expect } from 'vitest'
import { erzeugeFassadenAbschnitte } from '../fassaden-abschnitte'
import type { FassadenFlaeche } from '../fassaden-flaechen'

const flaeche = (overrides: Partial<FassadenFlaeche> = {}): FassadenFlaeche => ({
  geschoss: 'EG',
  von: { x: 0, z: 0 },
  bis: { x: 10, z: 0 },
  untenM: 0,
  obenM: 3,
  seite: 'oben',
  ...overrides,
})

describe('erzeugeFassadenAbschnitte', () => {
  it('überführt eine Fassadenfläche mit Länge, Höhe und Höhenlage', () => {
    const r = erzeugeFassadenAbschnitte([flaeche()])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.abschnitte).toHaveLength(1)
    expect(r.abschnitte[0]).toMatchObject({
      geschoss: 'EG', laengeM: 10, hoeheM: 3,
      unterkanteM: 0, oberkanteM: 3, status: 'manuell-zu-pruefen',
    })
  })

  it('berechnet die Außen-Normale passend zu allen vier Rasterseiten', () => {
    const faelle: Array<{ f: FassadenFlaeche; normal: [number, number] }> = [
      { f: flaeche({ von: { x: 0, z: 0 }, bis: { x: 10, z: 0 }, seite: 'oben' }), normal: [0, -1] },
      { f: flaeche({ von: { x: 10, z: 0 }, bis: { x: 10, z: 8 }, seite: 'rechts' }), normal: [1, 0] },
      { f: flaeche({ von: { x: 10, z: 8 }, bis: { x: 0, z: 8 }, seite: 'unten' }), normal: [0, 1] },
      { f: flaeche({ von: { x: 0, z: 8 }, bis: { x: 0, z: 0 }, seite: 'links' }), normal: [-1, 0] },
    ]
    for (const fall of faelle) {
      const r = erzeugeFassadenAbschnitte([fall.f])
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.abschnitte[0].aussenNormale).toEqual(fall.normal)
    }
  })

  it('behält Geschosszuordnung und unterschiedliche Höhen je Abschnitt', () => {
    const r = erzeugeFassadenAbschnitte([
      flaeche({ geschoss: 'EG', obenM: 3 }),
      flaeche({ geschoss: 'OG', von: { x: 2, z: 2 }, bis: { x: 8, z: 2 }, untenM: 3, obenM: 6, seite: 'oben' }),
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.abschnitte.map((a) => a.geschoss)).toEqual(['EG', 'OG'])
    expect(r.abschnitte.map((a) => a.hoeheM)).toEqual([3, 3])
    expect(r.abschnitte[1].unterkanteM).toBe(3)
  })

  it('lehnt leere Eingaben, Null-Länge und ungültige Höhen ab', () => {
    expect(erzeugeFassadenAbschnitte([]).ok).toBe(false)
    expect(erzeugeFassadenAbschnitte([flaeche({ bis: { x: 0, z: 0 } })]).ok).toBe(false)
    expect(erzeugeFassadenAbschnitte([flaeche({ obenM: 0 })]).ok).toBe(false)
  })

  it('markiert jeden Abschnitt als manuell zu prüfen statt ihn automatisch freizugeben', () => {
    const r = erzeugeFassadenAbschnitte([flaeche()])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.abschnitte[0].status).toBe('manuell-zu-pruefen')
  })
})
