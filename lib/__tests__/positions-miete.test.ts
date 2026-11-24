import { describe, it, expect } from 'vitest'
import { normalisierePositionsMiete, setzePositionsMiete, bereinigePositionsMiete, mietStandJePosition, type PositionsMiete } from '../positions-miete'

const pos = [
  { key: 'a', bezeichnung: 'Gerüst LK3', posNr: '01.01' },
  { key: 'b', bezeichnung: 'Gerüst LK3', posNr: '01.02' },
  { key: 'c', bezeichnung: 'Gerüst LK3', posNr: '01.03' },
]
const bau = { aktiv: true, beginn: '2026-11-01', freiTage: 28 }

describe('Vorhalte-Regel je Position', () => {
  it('ohne Sonderregel gilt die Baustelle', () => {
    const s = mietStandJePosition([], pos, bau, '2026-11-10')
    expect(s.every((x) => x.status === 'frei' && x.mieteAb === '2026-11-29')).toBe(true)
  })
  it('gleichnamige Positionen: 4 Wochen frei, 0 Wochen = direkt Miete, keine Miete mit Verweis', () => {
    let l: PositionsMiete[] = []
    for (const e of [
      { key: 'a', modus: 'eigen' as const, freiTage: 28 },
      { key: 'b', modus: 'eigen' as const, freiTage: 0 },
      { key: 'c', modus: 'keine' as const, verweisKey: 'a' },
    ]) { const r = setzePositionsMiete(l, pos, e); expect(r.ok).toBe(true); if (r.ok) l = r.liste }
    const s = mietStandJePosition(l, pos, bau, '2026-11-10')
    expect(s[0]).toMatchObject({ status: 'frei', mieteAb: '2026-11-29', freiTage: 28 })
    expect(s[0].text).toContain('4 Wochen frei')
    expect(s[1]).toMatchObject({ status: 'kostenpflichtig', mieteAb: '2026-11-01' })
    expect(s[1].text).toContain('sofort Miete')
    expect(s[2]).toMatchObject({ status: 'keine', mieteAb: null })
    expect(s[2].text).toContain('Pos. 01.01 Gerüst LK3')
  })
  it('eigene Regel braucht keine Baustellen-Vereinbarung, wenn eigener Beginn gesetzt ist', () => {
    const r = setzePositionsMiete([], pos, { key: 'a', modus: 'eigen', freiTage: 7, beginn: '2026-12-01' })
    if (!r.ok) throw new Error(r.fehler)
    expect(mietStandJePosition(r.liste, pos, null, '2026-12-05')[0]).toMatchObject({ status: 'frei', mieteAb: '2026-12-08' })
    expect(mietStandJePosition(r.liste, pos, null, '2026-12-05')[1].status).toBe('offen')
  })
  it('Prüfungen: Selbstverweis, Verweis auf mietfreie Position, Kette, fehlende Tage', () => {
    expect(setzePositionsMiete([], pos, { key: 'a', modus: 'keine', verweisKey: 'a' }).ok).toBe(false)
    expect(setzePositionsMiete([], pos, { key: 'a', modus: 'keine' }).ok).toBe(false)
    expect(setzePositionsMiete([], pos, { key: 'a', modus: 'eigen' }).ok).toBe(false)
    expect(setzePositionsMiete([], pos, { key: 'a', modus: 'eigen', freiTage: -1 }).ok).toBe(false)
    expect(setzePositionsMiete([], pos, { key: 'x', modus: 'eigen', freiTage: 1 }).ok).toBe(false)
    const l = [{ key: 'b', modus: 'keine' as const, verweisKey: 'a' }]
    expect(setzePositionsMiete(l, pos, { key: 'c', modus: 'keine', verweisKey: 'b' }).ok).toBe(false)
    expect(setzePositionsMiete(l, pos, { key: 'a', modus: 'keine', verweisKey: 'c' }).ok).toBe(false)
  })
  it('Zurück auf Baustelle entfernt die Sonderregel; Bereinigung entfernt tote Verweise', () => {
    const r = setzePositionsMiete([{ key: 'a', modus: 'eigen', freiTage: 0 }], pos, { key: 'a', modus: 'baustelle' })
    expect(r.ok && r.liste).toEqual([])
    const b = bereinigePositionsMiete([{ key: 'b', modus: 'keine', verweisKey: 'a' }, { key: 'zz', modus: 'eigen', freiTage: 1 }], [{ key: 'b' }, { key: 'c' }])
    expect(b).toEqual([])
  })
  it('normalisiert defensiv', () => {
    const l = normalisierePositionsMiete([{ key: 'a', modus: 'eigen', freiTage: '14', beginn: 'kaputt' }, { key: 'a', modus: 'keine' }, { key: '', modus: 'eigen' }, null, { key: 'q', modus: 'xyz' }])
    expect(l).toEqual([{ key: 'a', modus: 'eigen', freiTage: 14 }])
  })
})
