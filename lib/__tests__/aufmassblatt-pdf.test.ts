import { describe, it, expect } from 'vitest'
import { abschnitteAusSchritt2, berechneAufmass, erzeugeAufmassblattPdf } from '../aufmassblatt-pdf'

describe('Aufmaßblatt', () => {
  it('liest Haupt- und Zusatz-Abschnitte, ignoriert ungültige', () => {
    const a = abschnitteAusSchritt2({ laenge: '12,5', hoehe: '8', abschnitte: [
      { bezeichnung: 'Anbau', laenge: '4', hoehe: '3' }, { bezeichnung: 'leer', laenge: '', hoehe: '3' }, { laenge: '2', hoehe: '2' }] })
    expect(a.map((x) => x.bezeichnung)).toEqual(['Abschnitt 1', 'Anbau', 'Abschnitt 3'])
    expect(a[0]).toMatchObject({ laengeM: 12.5, hoeheM: 8 })
  })
  it('einzelner Abschnitt heißt Fassade; ohne Maße leer', () => {
    expect(abschnitteAusSchritt2({ laenge: '10', hoehe: '6' })[0].bezeichnung).toBe('Fassade')
    expect(abschnitteAusSchritt2({})).toEqual([])
    expect(abschnitteAusSchritt2(undefined)).toEqual([])
  })
  it('rechnet Länge × Höhe und summiert gerundet', () => {
    const r = berechneAufmass([{ bezeichnung: 'A', laengeM: 12.5, hoeheM: 8 }, { bezeichnung: 'B', laengeM: 3.333, hoeheM: 3 }])
    expect(r.zeilen.map((z) => z.flaecheM2)).toEqual([100, 10])
    expect(r.gesamtM2).toBe(110)
  })
  it('erzeugt ein PDF mit Text (auch mit kaputter Unterschrift)', () => {
    const doc = erzeugeAufmassblattPdf({ kunde: 'Muster GmbH', adresse: 'Weg 1, Berlin', abschnitte: [{ bezeichnung: 'Fassade', laengeM: 10, hoeheM: 6 }], unterschriftDataUrl: 'data:image/png;base64,xxx' })
    const buf = doc.output('arraybuffer')
    expect(buf.byteLength).toBeGreaterThan(1000)
    expect(doc.getNumberOfPages()).toBe(1)
  })
})
