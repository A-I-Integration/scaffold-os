import { describe, it, expect } from 'vitest'
import { leseKoordinaten } from '../../../components/cad/Lod2Panel'

describe('Koordinaten aus Google Maps lesen', () => {
  it('Dezimalpunkt mit Komma', () => expect(leseKoordinaten('51.2567078, 7.1474596')).toEqual({ lat: 51.2567078, lon: 7.1474596 }))
  it('Dezimalkomma mit Semikolon', () => expect(leseKoordinaten('51,2567078; 7,1474596')).toEqual({ lat: 51.2567078, lon: 7.1474596 }))
  it('lehnt Unsinn und Punkte außerhalb Deutschlands ab', () => {
    expect(leseKoordinaten('abc')).toBeNull()
    expect(leseKoordinaten('7.14, 51.25')).toBeNull()
    expect(leseKoordinaten('51.2')).toBeNull()
  })
})
