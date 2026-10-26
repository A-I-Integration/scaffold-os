import { describe, it, expect } from 'vitest'
import { pruefeEingabe } from '@/lib/rechnung-pruefung'

describe('pruefeEingabe', () => {
  it('Akzeptieren braucht nur Entscheidung und Namen', () => {
    const r = pruefeEingabe({ entscheidung: 'akzeptiert', geprueft_von: ' Max Muster ' })
    expect(r).toEqual({ ok: true, wert: { entscheidung: 'akzeptiert', geprueftVon: 'Max Muster', kommentar: null } })
  })
  it('Änderung und Ablehnung brauchen eine Begründung', () => {
    expect(pruefeEingabe({ entscheidung: 'aenderung', geprueft_von: 'Max Muster' }).ok).toBe(false)
    expect(pruefeEingabe({ entscheidung: 'abgelehnt', geprueft_von: 'Max Muster', kommentar: '  ' }).ok).toBe(false)
    expect(pruefeEingabe({ entscheidung: 'abgelehnt', geprueft_von: 'Max Muster', kommentar: 'Menge falsch' }).ok).toBe(true)
  })
  it('ohne Namen oder mit unbekannter Entscheidung abgelehnt', () => {
    expect(pruefeEingabe({ entscheidung: 'akzeptiert', geprueft_von: 'M' }).ok).toBe(false)
    expect(pruefeEingabe({ entscheidung: 'egal', geprueft_von: 'Max Muster' }).ok).toBe(false)
    expect(pruefeEingabe(null).ok).toBe(false)
  })
})
