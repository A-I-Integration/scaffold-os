import { describe, it, expect } from 'vitest'
import { BAUTEIL_FARBEN, bauteilFarbe } from '../cad/bauteil-farben'

describe('Bauteil-Farben', () => {
  it('alle Farben sind gültige Hex-Werte', () => {
    for (const f of Object.values(BAUTEIL_FARBEN)) expect(f).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('die wichtigsten Bauteilarten sind unterscheidbar', () => {
    const wichtige = ['frame', 'deck', 'railing', 'diagonal', 'footplate', 'anchor', 'console', 'stair'].map(bauteilFarbe)
    expect(new Set(wichtige).size).toBe(wichtige.length)
  })
  it('unbekannte Art: neutrales Grau', () => {
    expect(bauteilFarbe('gibt-es-nicht')).toBe('#888888')
  })
})
