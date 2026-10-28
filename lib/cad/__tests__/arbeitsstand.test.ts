import { describe, it, expect } from 'vitest'
import { pruefeArbeitsstand } from '../arbeitsstand'

const b = { lengthM: 10, widthM: 8, heightM: 9 }
describe('CAD-Arbeitsstand', () => {
  it('liest einen gültigen Stand und füllt Lücken auf', () => {
    const r = pruefeArbeitsstand(JSON.stringify({ building: b }))
    expect(r?.building).toMatchObject(b)
    expect(r?.systemId).toBe('layher-allround')
    expect(r?.notizen).toEqual([])
    expect(r?.artikelWahl).toEqual({})
  })
  it('verwirft leere, kaputte und unvollständige Stände', () => {
    expect(pruefeArbeitsstand(null)).toBeNull()
    expect(pruefeArbeitsstand('x')).toBeNull()
    expect(pruefeArbeitsstand(JSON.stringify({ building: { lengthM: 10, widthM: 0, heightM: 9 } }))).toBeNull()
  })
  it('übernimmt System, Notizen und Statik-Angaben', () => {
    const r = pruefeArbeitsstand(JSON.stringify({ building: b, systemId: 'mj-plus', notizen: [{ id: 'n' }], statikDaten: { a: 1 }, artikelWahl: { k: 'v' } }))
    expect(r).toMatchObject({ systemId: 'mj-plus', notizen: [{ id: 'n' }], statikDaten: { a: 1 }, artikelWahl: { k: 'v' } })
  })
})
