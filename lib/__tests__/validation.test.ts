import { describe, it, expect } from 'vitest'
import { validiere, kolonneAnlegenSchema, wochenplanungEinsatzSchema, materialZuordnungSchema } from '../validation'

describe('validiere', () => {
  it('lässt gültige Daten durch', () => {
    const result = validiere(kolonneAnlegenSchema, { name: 'Kolonne Nord' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.name).toBe('Kolonne Nord')
  })

  it('lehnt fehlenden Namen ab', () => {
    const result = validiere(kolonneAnlegenSchema, {})
    expect(result.ok).toBe(false)
  })

  it('lehnt eine ungültige UUID ab, statt einen unklaren Datenbank-Fehler zu riskieren', () => {
    const result = validiere(wochenplanungEinsatzSchema, { employee_id: 'nicht-uuid', einsatz_datum: '2026-09-15' })
    expect(result.ok).toBe(false)
  })

  it('lehnt ein falsches Datumsformat ab', () => {
    const result = validiere(wochenplanungEinsatzSchema, {
      employee_id: '11111111-1111-4111-8111-111111111111',
      einsatz_datum: '15.09.2026', // falsches Format
    })
    expect(result.ok).toBe(false)
  })

  it('lehnt eine negative oder textuelle Menge ab (der ursprüngliche Bug, den diese Prüfung verhindert)', () => {
    const zeile = { inventory_id: '11111111-1111-4111-8111-111111111111', to_project_id: '22222222-2222-4222-8222-222222222222' }
    expect(validiere(materialZuordnungSchema, { ...zeile, quantity: -5 }).ok).toBe(false)
    expect(validiere(materialZuordnungSchema, { ...zeile, quantity: 'zehn' }).ok).toBe(false)
    expect(validiere(materialZuordnungSchema, { ...zeile, quantity: 10 }).ok).toBe(true)
  })
})
