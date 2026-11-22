import { describe, it, expect } from 'vitest'
import { projektZeilen } from '../projekt-info'

describe('projektZeilen', () => {
  const basis = { name: 'Leithner EFH', systemName: 'MJ UniConnect', speicherText: 'Gespeichert', versionText: 'Stand 3' }
  it('zeigt nur bekannte Angaben', () => {
    const z = projektZeilen(basis)
    expect(z.map((x) => x.label)).toEqual(['Projekt', 'Gerüstsystem', 'Speicherstatus', 'Version'])
  })
  it('Zeitangaben aus dem Konto bzw. der Browser-Sicherung', () => {
    const z = projektZeilen({ ...basis, erstelltAm: '2026-11-01T10:00:00Z', geaendertAm: '2026-11-20T08:30:00Z' })
    expect(z.map((x) => x.label)).toContain('Erstellt')
    expect(z.find((x) => x.label === 'Letzte Änderung')?.wert).toMatch(/2026/)
    expect(projektZeilen({ ...basis, gesichertUm: new Date(2026, 10, 22, 12, 0) }).some((x) => x.label === 'Letzte Änderung')).toBe(true)
  })
  it('ungültiges Datum wird ausgelassen, Ersatztexte ohne Name und System', () => {
    const z = projektZeilen({ ...basis, name: null, systemName: null, erstelltAm: 'kaputt' })
    expect(z[0].wert).toBe('Unbenanntes Projekt'); expect(z[1].wert).toBe('Kein System'); expect(z.some((x) => x.label === 'Erstellt')).toBe(false)
  })
})
