import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PositionsstatusBlock from '@/components/PositionsstatusBlock'

// Rauchtest der Oberfläche (Server-Rendering): Der Block zeigt Leistung, Abrechnung, noch abrechenbar, Status und Hinweise je Gerüstbereich.
const za = (id: string, nr: number, dach: number, fass: number, rechnung?: string) => ({
  id, nr, stichtag: '2026-10-05', flaecheM2: dach + fass, notiz: '', erstelltAm: '2026-10-05T10:00:00Z',
  ...(rechnung ? { rechnungId: 'r-' + id, rechnungNr: rechnung, abgerechnetAm: '2026-10-10' } : {}),
  positionen: [
    { key: 'dach', bezeichnung: 'Dachgerüst', einheit: 'm²', einzelpreis: 100, menge: dach, vertragsmenge: 100 },
    { key: 'fassade', bezeichnung: 'Fassadengerüst', einheit: 'm²', einzelpreis: 100, menge: fass, vertragsmenge: 200 },
  ],
})
const render = (data: any) => renderToStaticMarkup(createElement(PositionsstatusBlock, { project: { id: 'p1', data } }))

describe('Positionsstatus-Block', () => {
  it('ohne Zwischenaufmaß mit Positionen wird nichts angezeigt', () => {
    expect(render({})).toBe('')
    expect(render({ zwischenaufmasse: [] })).toBe('')
  })
  it('zeigt je Bereich Prozent, noch abrechenbar, Status und Hinweis zum Endaufmaß', () => {
    const html = render({
      zwischenaufmasse: [za('a', 1, 65, 130, 'RE-1')],
      positionsEreignisse: [
        { id: 'e1', key: 'dach', art: 'abmeldung', datum: '2026-12-05', ansprechpartner: 'Herr Meier', erstelltAm: '2026-12-05T08:00:00Z' },
        { id: 'e2', key: 'dach', art: 'abbau', datum: '2026-12-10', vollstaendig: true, nachweis: 'Protokoll 7', erstelltAm: '2026-12-10T08:00:00Z' },
      ],
    })
    expect(html).toContain('Positionsstatus (je Gerüstbereich)')
    expect(html).toContain('Dachgerüst'); expect(html).toContain('Fassadengerüst')
    expect(html).toContain('65 %')
    expect(html).toContain('Abgebaut 10.12.2026')
    expect(html).toContain('Steht noch')
    expect(html).toContain('bis Vertrag 3.500,00')       // Dach: 35 m² × 100 € noch bis zur vereinbarten Menge
    expect(html).toContain('bis Vertrag 7.000,00')       // Fassade
    expect(html).toContain('Abmeldung durch den Kunden'); expect(html).toContain('Herr Meier')
    expect(html).toContain('Nachweis: Protokoll 7')
    expect(html).toContain('Aufmaß auf den Endstand aktualisieren')
  })
  it('nach dem Endaufmaß ohne Abrechnung: 3.500,00 € abrechenbar', () => {
    const html = render({ zwischenaufmasse: [za('a', 1, 65, 130, 'RE-1'), za('b', 2, 100, 130)] })
    expect(html).toContain('3.500,00')
  })
})

describe('Positionsstatus-Block: Vorhaltung je Position', () => {
  const lk3 = (nr: string, key: string, menge: number) => ({ key, posNr: nr, bezeichnung: 'Gerüst LK3', einheit: 'm²', einzelpreis: 5, menge, vertragsmenge: 100 })
  const data = {
    zwischenaufmasse: [{ id: 'a', nr: 1, stichtag: '2026-11-01', flaecheM2: 60, notiz: '', erstelltAm: '2026-11-01T10:00:00Z', positionen: [lk3('01.01', 'k1', 20), lk3('01.02', 'k2', 20), lk3('01.03', 'k3', 20)] }],
    vorhaltung: { aktiv: true, beginn: '2026-11-01', freiTage: 28, intervall: 'woche', preis: 10, abrechnung: 'nachtraeglich', teilabbauten: [] },
    positionsMiete: [{ key: 'k2', modus: 'eigen', freiTage: 0 }, { key: 'k3', modus: 'keine', verweisKey: 'k1' }],
  }
  it('zeigt je gleichnamiger Position die eigene Regel', () => {
    const html = renderToStaticMarkup(createElement(PositionsstatusBlock, { project: { id: 'p1', data } }))
    expect(html).toContain('Pos. 01.01 Gerüst LK3'); expect(html).toContain('Pos. 01.02 Gerüst LK3'); expect(html).toContain('Pos. 01.03 Gerüst LK3')
    expect(html).toContain('4 Wochen frei · Miete ab 29.11.2026 (wie Baustelle)')
    expect(html).toContain('sofort Miete · Miete ab 01.11.2026')
    expect(html).toContain('keine eigene Miete – läuft in Pos. 01.01 Gerüst LK3 weiter')
  })
})
