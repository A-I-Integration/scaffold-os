import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import LandAuswahl from '@/components/LandAuswahl'

describe('Land-Auswahl Darstellung', () => {
  it('zeigt die Länderliste, leer = Deutschland', () => {
    const html = renderToStaticMarkup(<LandAuswahl value="" onChange={() => {}} />)
    expect(html).toContain('data-testid="land-auswahl"')
    for (const l of ['Luxemburg', 'Österreich', 'Bulgarien']) expect(html).toContain(`>${l}</option>`)
    expect(html).not.toContain('land-auswahl-frei')
  })
  it('unbekanntes Land erscheint im Freitextfeld', () => {
    const html = renderToStaticMarkup(<LandAuswahl value="Spanien" onChange={() => {}} />)
    expect(html).toContain('data-testid="land-auswahl-frei"')
    expect(html).toContain('value="Spanien"')
  })
})
