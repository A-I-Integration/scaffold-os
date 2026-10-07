import { describe, it, expect } from 'vitest'
import { baueEntwurfPayload } from '../aufmass-entwurf'

describe('baueEntwurfPayload', () => {
  it('markiert als Entwurf und übernimmt Name/Adresse aus Schritt 1', () => {
    const p = baueEntwurfPayload({ step1: { name: ' Muster GmbH ', adresse: 'Hauptstr. 1' }, step2: { a: 1 } })
    expect(p.name).toBe('Muster GmbH')
    expect(p.adresse).toBe('Hauptstr. 1')
    expect(p.data.entwurf).toBe(true)
    expect(p.data.step2).toEqual({ a: 1 })
  })
  it('nimmt Platzhalter-Name und leere Adresse, wenn nichts eingegeben', () => {
    const p = baueEntwurfPayload({ step1: { foo: 1 } })
    expect(p.name).toBe('Unbenanntes Projekt')
    expect(p.adresse).toBe('')
  })
  it('verändert die übergebenen Daten nicht', () => {
    const steps = { step1: { name: 'X' } }
    baueEntwurfPayload(steps)
    expect((steps as any).entwurf).toBeUndefined()
  })
})
