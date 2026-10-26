import { describe, it, expect } from 'vitest'
import { pruefeRueckmeldung, verlaufMit, antwortErlaubt, MAX_VERLAUF, ANTWORT_ZU_STATUS } from '@/lib/angebot-rueckmeldung'

describe('pruefeRueckmeldung', () => {
  it('nur Token (alter Aufruf) = annehmen', () => {
    expect(pruefeRueckmeldung({ token: 'x' })).toEqual({ ok: true, art: 'annehmen', notiz: null, name: null })
  })
  it('Korrektur braucht eine Notiz', () => {
    expect(pruefeRueckmeldung({ art: 'korrektur' }).ok).toBe(false)
    expect(pruefeRueckmeldung({ art: 'korrektur', notiz: '  hm ' }).ok).toBe(false)
    expect(pruefeRueckmeldung({ art: 'korrektur', notiz: ' Treppenturm fehlt ', name: ' Frau Meier ' })).toEqual({ ok: true, art: 'korrektur', notiz: 'Treppenturm fehlt', name: 'Frau Meier' })
  })
  it('Ablehnen geht auch ohne Notiz; unbekannte Antworten und zu lange Notizen nicht', () => {
    expect(pruefeRueckmeldung({ art: 'ablehnen' })).toMatchObject({ ok: true, art: 'ablehnen', notiz: null })
    expect(pruefeRueckmeldung({ art: 'vielleicht' }).ok).toBe(false)
    expect(pruefeRueckmeldung({ art: 'ablehnen', notiz: 'x'.repeat(2001) }).ok).toBe(false)
  })
  it('ordnet Antworten Status zu', () => {
    expect(ANTWORT_ZU_STATUS).toEqual({ annehmen: 'angenommen', korrektur: 'korrektur', ablehnen: 'abgelehnt' })
  })
})

describe('Verlauf und Sperre', () => {
  it('hängt an und begrenzt', () => {
    let v: any[] = []
    for (let i = 0; i < MAX_VERLAUF + 5; i++) v = verlaufMit(v, { art: 'korrektur', notiz: String(i), name: null, am: 'x' })
    expect(v).toHaveLength(MAX_VERLAUF)
    expect(v[v.length - 1].notiz).toBe(String(MAX_VERLAUF + 4))
    expect(verlaufMit('kaputt', { art: 'ablehnen', notiz: null, name: null, am: 'x' })).toHaveLength(1)
  })
  it('nach Annahme keine weitere Antwort', () => {
    expect(antwortErlaubt('angenommen')).toBe(false)
    for (const s of ['versendet', 'gelesen', 'korrektur', 'abgelehnt', undefined]) expect(antwortErlaubt(s)).toBe(true)
  })
})
