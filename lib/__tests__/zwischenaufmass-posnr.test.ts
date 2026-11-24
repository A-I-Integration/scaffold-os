import { describe, it, expect } from 'vitest'
import { neuesZwischenaufmassJePosition, baueTeilleistungsPositionen, positionsKey, positionsTitel, normalisiereZwischenaufmasse, aktuellerStandJePosition, type Zwischenaufmass } from '../zwischenaufmass'
import { freiePositionenMitAufmassName } from '../aufmass-integritaet'

const fuenf = [10, 20, 30, 40, 50].map((m, i) => ({ posNr: `01.0${i + 1}`, bezeichnung: 'Gerüst LK3', einheit: 'm²', einzelpreis: 4 + i, menge: m, vertragsmenge: 100 }))

describe('gleichnamige Positionen mit Positionsnummer', () => {
  it('ohne Positionsnummer weiterhin abgelehnt, mit Hinweis', () => {
    const r = neuesZwischenaufmassJePosition([], { stichtag: '2026-11-01', positionen: [fuenf[0], fuenf[1]].map((p) => ({ ...p, posNr: undefined })) }, 'aaaaaaaa-1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fehler).toContain('Pos.-Nr.')
  })
  it('fünf gleichnamige Positionen mit verschiedenen Preisen werden getrennt geführt', () => {
    const r = neuesZwischenaufmassJePosition([], { stichtag: '2026-11-01', positionen: fuenf }, 'aaaaaaaa-1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(new Set(r.eintrag.positionen!.map((p) => p.key)).size).toBe(5)
    const t = baueTeilleistungsPositionen(r.eintrag, [r.eintrag])
    expect(t.fehler).toBeNull()
    expect(t.positionen).toHaveLength(5)
    expect(t.positionen.map((p) => p.einzelpreis)).toEqual([4, 5, 6, 7, 8])
    expect(t.positionen.map((p) => p.menge)).toEqual([10, 20, 30, 40, 50])
    expect(t.positionen[0].bezeichnung).toContain('Pos. 01.01 Gerüst LK3')
  })
  it('zweites Aufmaß rechnet je Positionsnummer nur die Differenz', () => {
    const a = neuesZwischenaufmassJePosition([], { stichtag: '2026-11-01', positionen: fuenf }, 'aaaaaaaa-1')
    if (!a.ok) throw new Error('a')
    const abger: Zwischenaufmass = { ...a.eintrag, rechnungId: 'r1', rechnungNr: 'R-1' }
    const neu = fuenf.map((p, i) => (i === 2 ? { ...p, menge: 45 } : p))
    const b = neuesZwischenaufmassJePosition([abger], { stichtag: '2026-12-01', positionen: neu }, 'bbbbbbbb-2')
    expect(b.ok).toBe(true)
    if (!b.ok) return
    const t = baueTeilleistungsPositionen(b.eintrag, [abger, b.eintrag])
    expect(t.positionen).toHaveLength(1)
    expect(t.positionen[0]).toMatchObject({ menge: 15, einzelpreis: 6 })
  })
  it('gleiche Nummer doppelt wird abgelehnt', () => {
    const r = neuesZwischenaufmassJePosition([], { stichtag: '2026-11-01', positionen: [fuenf[0], { ...fuenf[1], posNr: '01.01' }] }, 'aaaaaaaa-1')
    expect(r.ok).toBe(false)
  })
  it('Altdaten ohne Positionsnummer behalten ihren Schlüssel; posNr bleibt beim Normalisieren erhalten', () => {
    expect(positionsKey('Gerüst Fassade', 'm²')).toBe('gerüst fassade|m²')
    const l = normalisiereZwischenaufmasse([{ id: 'x', nr: 1, positionen: [{ bezeichnung: 'A', einheit: 'm²', einzelpreis: 1, menge: 2, posNr: ' 02 . ' }, { bezeichnung: 'B', einheit: 'm²', einzelpreis: 1, menge: 2 }] }])
    expect(l[0].positionen![0].posNr).toBe('02 .')
    expect(l[0].positionen![1].key).toBe('b|m²')
    expect(positionsTitel(l[0].positionen![1])).toBe('B')
  })
  it('freie Rechnungsposition mit gleichem Namen wird trotz Positionsnummer erkannt', () => {
    const a = neuesZwischenaufmassJePosition([], { stichtag: '2026-11-01', positionen: [fuenf[0]] }, 'aaaaaaaa-1')
    if (!a.ok) throw new Error('a')
    expect(freiePositionenMitAufmassName([a.eintrag], [{ bezeichnung: 'Gerüst LK3', einheit: 'm²' }])).toEqual(['Gerüst LK3'])
    expect(aktuellerStandJePosition([a.eintrag]).size).toBe(1)
  })
})
