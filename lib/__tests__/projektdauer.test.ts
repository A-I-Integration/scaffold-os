import { describe, it, expect } from 'vitest'
import { dauerTage, dauerText } from '../projektdauer'
import { unterdeckung } from '../preis-pruefung'
import { baueAufmassDaten, pruefeKiAntwort } from '../ki-anfrage'

describe('Projektdauer', () => {
  it('Wochen mit Kennzeichnung → Tage ×7, Anzeige in Wochen', () => {
    const s = { dauer: '6', dauerEinheit: 'wochen' }
    expect(dauerTage(s)).toBe(42); expect(dauerText(s)).toBe('6 Wochen')
    expect(dauerText({ dauer: '1', dauerEinheit: 'wochen' })).toBe('1 Woche')
  })
  it('Alte Daten ohne Kennzeichnung bleiben Tage (unverändert)', () => {
    expect(dauerTage({ dauer: '30' })).toBe(30); expect(dauerText({ dauer: '30' })).toBe('30 Tage')
  })
  it('Ohne Angabe: –', () => { expect(dauerText({})).toBe('–'); expect(dauerTage(null)).toBeNull(); expect(dauerTage({ dauer: 'abc' })).toBeNull() })
  it('Das KI-Angebot kennzeichnet die Standzeit als Wochen', () => {
    const e = pruefeKiAntwort({ kunde: 'A', standzeit_wochen: 6 }, 'A, 6 Wochen').entwurf
    const d = baueAufmassDaten(e, { id: 'k', name: 'A' }, 'A, 6 Wochen') as any
    expect(d.step1.dauer).toBe('6'); expect(d.step1.dauerEinheit).toBe('wochen')
    expect(dauerTage(d.step1)).toBe(42)
  })
})
describe('Unterdeckung', () => {
  it('Pauschale unter den Selbstkosten', () => { expect(unterdeckung(5000, 31755.5)).toBe(26755.5) })
  it('Preis über oder gleich den Kosten: keine Warnung', () => { expect(unterdeckung(42341, 31755.5)).toBeNull(); expect(unterdeckung(100, 100)).toBeNull() })
  it('Fehlende Werte: keine Warnung', () => { expect(unterdeckung(null, 100)).toBeNull(); expect(unterdeckung(0, 100)).toBeNull() })
})
