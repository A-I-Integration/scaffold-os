import { describe, it, expect } from 'vitest'
import { schalteAuswahl, idsImRahmen, rahmenErgebnis, istEchterRahmen } from '@/lib/cad/mehrfachauswahl'

describe('Shift+Klick', () => {
  it('nimmt das einzeln gewählte Bauteil mit, fügt dazu und nimmt wieder heraus', () => {
    expect(schalteAuswahl([], 'a', 'b')).toEqual(['a', 'b'])
    expect(schalteAuswahl(['a', 'b'], null, 'c')).toEqual(['a', 'b', 'c'])
    expect(schalteAuswahl(['a', 'b', 'c'], null, 'b')).toEqual(['a', 'c'])
    expect(schalteAuswahl([], null, 'x')).toEqual(['x'])
  })
  it('lässt die Eingabe unverändert', () => {
    const e = ['a', 'b']; schalteAuswahl(e, null, 'c'); expect(e).toEqual(['a', 'b'])
  })
})
describe('Auswahlrahmen', () => {
  const punkte = [{ id: 'a', x: 10, y: 10 }, { id: 'b', x: 50, y: 40 }, { id: 'c', x: 120, y: 90 }, { id: 'd', x: 50, y: 200 }]
  it('wählt alle Punkte im Rechteck, egal in welcher Richtung gezogen wird', () => {
    expect(idsImRahmen(punkte, { x: 0, y: 0 }, { x: 100, y: 100 })).toEqual(['a', 'b'])
    expect(idsImRahmen(punkte, { x: 100, y: 100 }, { x: 0, y: 0 })).toEqual(['a', 'b'])
    expect(idsImRahmen(punkte, { x: 0, y: 0 }, { x: 130, y: 210 })).toEqual(['a', 'b', 'c', 'd'])
  })
  it('Rand zählt mit, außerhalb nicht', () => {
    expect(idsImRahmen(punkte, { x: 10, y: 10 }, { x: 50, y: 40 })).toEqual(['a', 'b'])
    expect(idsImRahmen(punkte, { x: 11, y: 11 }, { x: 49, y: 39 })).toEqual([])
  })
  it('Shift ergänzt, sonst ersetzt – ohne Doppelte', () => {
    expect(rahmenErgebnis(['a', 'b'], ['b', 'c'], true)).toEqual(['a', 'b', 'c'])
    expect(rahmenErgebnis(['a', 'b'], ['b', 'c'], false)).toEqual(['b', 'c'])
  })
  it('winziger Rahmen ist kein Rahmen', () => {
    expect(istEchterRahmen({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false)
    expect(istEchterRahmen({ x: 0, y: 0 }, { x: 30, y: 20 })).toBe(true)
  })
})
