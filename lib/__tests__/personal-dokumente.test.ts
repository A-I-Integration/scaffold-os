import { describe, it, expect } from 'vitest'
import { faelligkeit, faelligkeitText, sortiereNachFaelligkeit, pruefeDokumentEingabe } from '../personal-dokumente'

const HEUTE = '2026-11-24'
describe('Fälligkeit von Dokumenten', () => {
  it('stuft nach Ablaufdatum ein', () => {
    expect(faelligkeit(null, HEUTE)).toBe('unbefristet')
    expect(faelligkeit('2026-11-23', HEUTE)).toBe('abgelaufen')
    expect(faelligkeit('2026-11-24', HEUTE)).toBe('bald')
    expect(faelligkeit('2027-01-23', HEUTE)).toBe('bald') // 60 Tage
    expect(faelligkeit('2027-01-24', HEUTE)).toBe('gueltig') // 61 Tage
  })
  it('liefert verständliche Texte', () => {
    expect(faelligkeitText('2026-11-20', HEUTE)).toBe('abgelaufen seit 20.11.2026 (4 Tage)')
    expect(faelligkeitText('2026-11-25', HEUTE)).toBe('läuft in 1 Tag ab (25.11.2026)')
    expect(faelligkeitText('2026-12-04', HEUTE)).toBe('läuft in 10 Tagen ab (04.12.2026)')
    expect(faelligkeitText('2028-01-01', HEUTE)).toBe('gültig bis 01.01.2028')
    expect(faelligkeitText(null, HEUTE)).toBe('unbefristet')
  })
  it('sortiert abgelaufen vor bald vor gültig vor unbefristet', () => {
    const l = [{ id: 'u', gueltig_bis: null }, { id: 'g', gueltig_bis: '2028-01-01' }, { id: 'b', gueltig_bis: '2026-12-01' }, { id: 'a', gueltig_bis: '2026-10-01' }]
    expect(sortiereNachFaelligkeit(l, HEUTE).map(x => x.id)).toEqual(['a', 'b', 'g', 'u'])
  })
  it('prüft die Eingabe', () => {
    expect(pruefeDokumentEingabe({ kategorie: 'xx', bezeichnung: 'G 41' }).ok).toBe(false)
    expect(pruefeDokumentEingabe({ kategorie: 'lehrgang', bezeichnung: ' ' }).ok).toBe(false)
    expect(pruefeDokumentEingabe({ kategorie: 'lehrgang', bezeichnung: 'a', gueltig_bis: '2026-02-30' }).ok).toBe(false)
    expect(pruefeDokumentEingabe({ kategorie: 'lehrgang', bezeichnung: 'a', ausgestellt_am: '2026-05-01', gueltig_bis: '2026-04-01' }).ok).toBe(false)
    expect(pruefeDokumentEingabe({ kategorie: 'g_untersuchung', bezeichnung: ' G 41 ', gueltig_bis: '2027-05-01' })).toMatchObject({ ok: true, bezeichnung: 'G 41', gueltig_bis: '2027-05-01', ausgestellt_am: null })
  })
})
