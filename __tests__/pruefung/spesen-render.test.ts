import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SpesenTag, SpesenSaetzeBlock } from '@/components/SpesenBloecke'

const S = (regelwerk: string, schluessel: string, wert: number) => ({ id: schluessel, regelwerk, schluessel, wert, gueltig_ab: '2021-04-01', bemerkung: null })
const saetze = [S('tarif', 'verpflegung_heimfahrt', 3.5), S('tarif', 'verpflegung_schwelle_stunden', 10), S('tarif', 'ausloesung_voll', 24), S('tarif', 'ausloesung_an_abreise', 12),
  S('steuer', 'pauschale_ueber_8h', 14), S('steuer', 'pauschale_schwelle_stunden', 8), S('steuer', 'pauschale_24h', 28), S('steuer', 'pauschale_an_abreise', 14),
  S('steuer', 'kuerzung_fruehstueck_prozent', 20), S('steuer', 'kuerzung_mittag_prozent', 40), S('steuer', 'kuerzung_abend_prozent', 40)]

describe('Spesen-Oberfläche', () => {
  it('zeigt Vorschlag mit Begründung und steuerlichem Vergleich', () => {
    const html = renderToStaticMarkup(createElement(SpesenTag, { employeeId: 'e1', datum: '2026-11-10', stempelStunden: 11, fortbildung: false, saetze, onGespeichert: () => {} }))
    expect(html).toContain('Vorschlag Tarif: 3,50'); expect(html).toContain('§ 7 Nr. 3.2'); expect(html).toContain('steuerliche Pauschale zum Vergleich: 14,00')
    for (const t of ['spesen-einsatzart', 'spesen-manuell', 'spesen-speichern']) expect(html).toContain(t)
  })
  it('Fortbildung zeigt keinen Betrag; fehlende Sätze werden benannt', () => {
    expect(renderToStaticMarkup(createElement(SpesenTag, { employeeId: 'e1', datum: '2026-11-10', stempelStunden: 11, fortbildung: true, saetze, onGespeichert: () => {} }))).toContain('Vorschlag Tarif: 0,00')
    expect(renderToStaticMarkup(createElement(SpesenTag, { employeeId: 'e1', datum: '2026-11-10', stempelStunden: 11, fortbildung: false, saetze: [], onGespeichert: () => {} }))).toContain('fehlen Spesensätze')
  })
  it('Sätze-Block ist zunächst eingeklappt', () => {
    const html = renderToStaticMarkup(createElement(SpesenSaetzeBlock, { saetze, datum: '2026-11-10', onGeaendert: () => {} }))
    expect(html).toContain('spesen-saetze-toggle'); expect(html).not.toContain('satz-wert')
  })
})
