import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PositionDetails from '@/components/rechnung/PositionDetails'

const render = (p: object) => renderToStaticMarkup(createElement(PositionDetails, { p, onFeld: () => {}, onMenge: () => {} }))

describe('PositionDetails', () => {
  it('zeigt alle Arten, Maßfelder und Mengenvorschläge', () => {
    const html = render({ art: 'konsolen', laengeM: 12, breiteM: 2, hoeheM: 6 })
    for (const t of ['Gerüst / Modul', 'Zusätzliche Arbeitslage', 'Rollgerüst', 'Hängegerüst', 'Gitterträger', 'Konsolen', 'Ausleger aus Modulgerüst', 'Plane', 'Zelt']) expect(html).toContain(t)
    expect(html).toContain('L (m)'); expect(html).toContain('B (m)'); expect(html).toContain('H (m)')
    expect(html).toContain('L × H = 72 m²'); expect(html).toContain('L × B × H = 144 m³')
  })
  it('zeigt Mitarbeiter und Tätigkeit nur bei Stundenlohn', () => {
    expect(render({ art: 'regie' })).toContain('Mitarbeiter (Name)')
    expect(render({})).not.toContain('Mitarbeiter (Name)')
  })
})
