import { describe, it, expect } from 'vitest'
import { VOR_PUNKTE, leereVorbereitung, vorbereitungFehlt, offeneAufgaben, unbeantwortet } from '../aufbau-vorbereitung'
import { KATEGORIEN } from '../baustellenmappe'

describe('Vorbereitung vor dem Aufbau', () => {
  it('leer: alles offen', () => {
    const v = leereVorbereitung('2026-01-01')
    expect(unbeantwortet(v)).toHaveLength(VOR_PUNKTE.length)
    expect(vorbereitungFehlt(v).join()).toContain('Ersteller')
  })
  it('vollständig beantwortet + Unterschrift = ablegbar, nein = offene Aufgabe', () => {
    const v = leereVorbereitung('2026-01-01')
    v.ersteller = 'M'; v.unterschrift = 'data:image/png;base64,x'
    for (const p of VOR_PUNKTE) v.punkte[p.key].antwort = 'ja'
    v.punkte[VOR_PUNKTE[0].key].antwort = 'nein'
    expect(vorbereitungFehlt(v)).toEqual([])
    expect(offeneAufgaben(v)).toHaveLength(1)
  })
  it('Schlüssel eindeutig, Kategorie vorhanden', () => {
    expect(new Set(VOR_PUNKTE.map(p => p.key)).size).toBe(VOR_PUNKTE.length)
    expect(KATEGORIEN).toContain('Vorbereitung vor dem Aufbau')
  })
})
