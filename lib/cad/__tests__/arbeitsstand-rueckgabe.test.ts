import { describe, it, expect } from 'vitest'
import { speichereArbeitsstand } from '../arbeitsstand'

const basis = { systemId: 'x', notizen: [], statikDaten: {}, artikelWahl: {} }
describe('speichereArbeitsstand Rückgabe', () => {
  it('false bei ungültigen Maßen, ohne zu schreiben', () => {
    expect(speichereArbeitsstand({ ...basis, building: { lengthM: 0, widthM: 6, heightM: 8 } } as never)).toBe(false)
  })
  it('false, wenn der Speicher fehlt oder gesperrt ist', () => {
    expect(speichereArbeitsstand({ ...basis, building: { lengthM: 14, widthM: 6, heightM: 8 } } as never)).toBe(false)
  })
  it('true, wenn gespeichert wurde', () => {
    const g = globalThis as unknown as { localStorage?: unknown }
    const alt = g.localStorage
    g.localStorage = { setItem: () => {}, getItem: () => null, removeItem: () => {} }
    try { expect(speichereArbeitsstand({ ...basis, building: { lengthM: 14, widthM: 6, heightM: 8 } } as never)).toBe(true) } finally { g.localStorage = alt }
  })
})
