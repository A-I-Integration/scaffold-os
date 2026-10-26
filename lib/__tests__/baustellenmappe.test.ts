import { describe, it, expect } from 'vitest'
import { mappeDokumente, mappeLinkStatus, mappeUrl, istVorlage, bereinigeText, istDokumentOderMarkiert, type MediaRow } from '../baustellenmappe'

const P = '11111111-1111-1111-1111-111111111111'
const z = (o: Partial<MediaRow>): MediaRow => ({ id: 'x', project_id: P, file_name: 'a.pdf', file_type: 'application/pdf', created_at: '2026-10-01T10:00:00Z', storage_path: 'p', metadata: null, ...o })

describe('mappeDokumente', () => {
  it('zeigt nur markierte Dokumente dieser Baustelle', () => {
    const l = mappeDokumente([
      z({ id: '1', metadata: { mappe: true, kategorie: 'Prüfprotokoll' } }),
      z({ id: '2', metadata: { kind: 'vertrag' } }),
      z({ id: '3', project_id: 'anderes', metadata: { mappe: true } }),
      z({ id: '4', project_id: null, metadata: { mappe: true } }),
    ], P)
    expect(l.map((d) => d.id)).toEqual(['1'])
  })
  it('sortiert nach Kategorie, dann neueste zuerst; ohne Kategorie = Sonstiges', () => {
    const l = mappeDokumente([
      z({ id: 'a', metadata: { mappe: true } }),
      z({ id: 'b', metadata: { mappe: true, kategorie: 'Prüfprotokoll' }, created_at: '2026-01-01T00:00:00Z' }),
      z({ id: 'c', metadata: { mappe: true, kategorie: 'Prüfprotokoll' }, created_at: '2026-06-01T00:00:00Z' }),
    ], P)
    expect(l.map((d) => d.id)).toEqual(['c', 'b', 'a'])
    expect(l[2].kategorie).toBe('Sonstiges')
  })
})

describe('Links und Hilfen', () => {
  it('Status: ohne Ablauf aktiv, widerrufen, abgelaufen', () => {
    expect(mappeLinkStatus({ expires_at: null, revoked_at: null })).toBe('aktiv')
    expect(mappeLinkStatus({ expires_at: null, revoked_at: '2026-01-01' })).toBe('widerrufen')
    expect(mappeLinkStatus({ expires_at: '2020-01-01T00:00:00Z', revoked_at: null })).toBe('abgelaufen')
  })
  it('URL ohne doppelten Schrägstrich', () => { expect(mappeUrl('https://x.de/', 'abc')).toBe('https://x.de/baustelle/abc') })
  it('Vorlage nur ohne Projekt', () => {
    expect(istVorlage({ project_id: null, metadata: { vorlage: true } })).toBe(true)
    expect(istVorlage({ project_id: P, metadata: { vorlage: true } })).toBe(false)
  })
  it('Text bereinigen', () => { expect(bereinigeText('  a\u0000b  ', 5)).toBe('a b'); expect(bereinigeText(5, 5)).toBeUndefined() })
  it('Fotos nur wenn markiert', () => {
    expect(istDokumentOderMarkiert({ file_type: 'image/jpeg', metadata: { kind: 'foto' } })).toBe(false)
    expect(istDokumentOderMarkiert({ file_type: 'image/jpeg', metadata: { kind: 'foto', mappe: true } })).toBe(true)
  })
})
