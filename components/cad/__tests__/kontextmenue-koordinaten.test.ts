import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import BauteilKontextmenue from '../BauteilKontextmenue'
import PlatzierKoordinaten from '../PlatzierKoordinaten'

const h = () => {}
describe('Rechtsklick-Menü', () => {
  it('zeigt Titel und alle Aktionen, gesperrte sind deaktiviert', () => {
    const html = renderToStaticMarkup(createElement(BauteilKontextmenue, { x: 10, y: 10, titel: 'Rahmen', onZu: h, aktionen: [
      { id: 'a', name: 'Duplizieren', onWahl: h }, { id: 'b', name: 'Auf berechnet zurücksetzen', aus: true, onWahl: h }, { id: 'c', name: 'Entfernen', gefahr: true, onWahl: h }] }))
    expect(html).toContain('data-testid="bauteil-kontextmenue"')
    for (const t of ['Rahmen', 'Duplizieren', 'Auf berechnet zurücksetzen', 'Entfernen']) expect(html).toContain(t)
    expect(html).toMatch(/disabled=""[^>]*>Auf berechnet zurücksetzen/)
  })
})
describe('Koordinaten-Leiste', () => {
  it('hat x/y/z, Einrasten-Schalter und Setzen-Knopf', () => {
    const html = renderToStaticMarkup(createElement(PlatzierKoordinaten, { name: 'Bauteil', einrasten: true, onEinrasten: h, onSetzen: h, onZu: h }))
    for (const t of ['Koordinate x', 'Koordinate y', 'Koordinate z', 'An Koordinaten setzen', 'An Anschlüsse einrasten']) expect(html).toContain(t)
    expect(html).toMatch(/checked=""/)
  })
})
