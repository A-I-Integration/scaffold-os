import { describe, it, expect } from 'vitest'
import { naechsteAutoAktion, manuelleAktionen, tageUeberfaellig, mahnStatusText } from '../mahnung-steuerung'

describe('naechsteAutoAktion', () => {
  it('nichts vor Ablauf der Fristen und ohne Erinnerungs-Einstellung', () => {
    expect(naechsteAutoAktion({ tageUeberfaellig: 10, stufe: 0 })).toBeNull()
  })
  it('1. Mahnung ab 14, 2. Mahnung ab 28 Tagen', () => {
    expect(naechsteAutoAktion({ tageUeberfaellig: 14, stufe: 0 })).toBe(1)
    expect(naechsteAutoAktion({ tageUeberfaellig: 20, stufe: 1 })).toBeNull()
    expect(naechsteAutoAktion({ tageUeberfaellig: 28, stufe: 1 })).toBe(2)
    expect(naechsteAutoAktion({ tageUeberfaellig: 99, stufe: 2 })).toBeNull()
  })
  it('Erinnerung nur wenn eingestellt, einmalig und vor der Mahnung', () => {
    expect(naechsteAutoAktion({ tageUeberfaellig: 7, stufe: 0, erinnerungTage: 7 })).toBe('erinnerung')
    expect(naechsteAutoAktion({ tageUeberfaellig: 8, stufe: 0, erinnerungTage: 7, erinnerungAm: '2026-10-01' })).toBeNull()
    expect(naechsteAutoAktion({ tageUeberfaellig: 6, stufe: 0, erinnerungTage: 7 })).toBeNull()
    expect(naechsteAutoAktion({ tageUeberfaellig: 0, stufe: 0, erinnerungTage: 0 })).toBeNull()
    // Wurde die Erinnerung verpasst, gilt direkt die Mahnung
    expect(naechsteAutoAktion({ tageUeberfaellig: 15, stufe: 0, erinnerungTage: 7 })).toBe(1)
  })
  it('Pause stoppt alles', () => {
    expect(naechsteAutoAktion({ tageUeberfaellig: 40, stufe: 1, pausiert: true })).toBeNull()
    expect(naechsteAutoAktion({ tageUeberfaellig: 8, stufe: 0, erinnerungTage: 7, pausiert: true })).toBeNull()
  })
})

describe('manuelleAktionen', () => {
  it('bietet den jeweils nächsten Schritt an', () => {
    expect(manuelleAktionen({ stufe: 0 })).toEqual(['erinnerung', 1])
    expect(manuelleAktionen({ stufe: 0, erinnerungAm: '2026-10-01' })).toEqual([1])
    expect(manuelleAktionen({ stufe: 1 })).toEqual([2])
    expect(manuelleAktionen({ stufe: 2 })).toEqual([])
  })
})

describe('tageUeberfaellig / mahnStatusText', () => {
  it('zählt Tage ab Fälligkeit, nie negativ', () => {
    expect(tageUeberfaellig('2026-10-01', '2026-10-15')).toBe(14)
    expect(tageUeberfaellig('2026-10-20', '2026-10-15')).toBe(0)
    expect(tageUeberfaellig(null)).toBe(0)
  })
  it('Statustext', () => {
    expect(mahnStatusText({ stufe: 2, pausiert: true })).toBe('2. Mahnung, Mahnung pausiert')
    expect(mahnStatusText({ stufe: 0, erinnerungAm: '2026-10-01' })).toBe('Erinnerung gesendet')
    expect(mahnStatusText({ stufe: 0 })).toBe('')
  })
})
