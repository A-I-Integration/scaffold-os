import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ZeitAuswertung from '@/components/ZeitAuswertung'

describe('Auswertung Darstellung', () => {
  it('zeigt Zeitraum, Filter, CSV und Excel', () => {
    const html = renderToStaticMarkup(<ZeitAuswertung canEdit />)
    for (const id of ['auswertung-monat', 'auswertung-jahr', 'auswertung-ueber', 'auswertung-land', 'auswertung-csv', 'auswertung-excel', 'auswertung-laender']) expect(html).toContain(`data-testid="${id}"`)
    expect(html).toContain('Mitarbeiter wählen')
  })
})
