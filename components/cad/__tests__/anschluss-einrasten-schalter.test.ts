import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import EigenschaftenLeiste from '../EigenschaftenLeiste'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'

const model = generateCADModel({ lengthM: 13.8, widthM: 8.85, heightM: 6.94, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'satteldach', sides: ['front', 'back', 'left', 'right'], geruestOptionen: { treppe: false } } as unknown as BuildingParams, 'layher-allround')
const h = () => {}
const basis = { model, id: model.components3D[0].id, artikelWahl: {}, manuell: false, onEntfernen: h, onZu: h, onLage: h, onEinrasten: h, griffModus: 'verschieben', einrasten: true }

describe('Schalter „An Anschlüsse einrasten“', () => {
  it('erscheint mit Handler und ist standardmäßig an', () => {
    const html = renderToStaticMarkup(createElement(EigenschaftenLeiste, { ...basis, onAnschlussEinrasten: h } as never))
    expect(html).toContain('An Anschlüsse einrasten')
    expect(html).toMatch(/checked=""[^>]*\/>An Anschlüsse einrasten/)
  })
  it('lässt sich ausgeschaltet darstellen', () => {
    const html = renderToStaticMarkup(createElement(EigenschaftenLeiste, { ...basis, onAnschlussEinrasten: h, anschlussEinrasten: false } as never))
    expect(html).not.toMatch(/checked=""[^>]*\/>An Anschlüsse einrasten/)
    expect(html).toContain('An Anschlüsse einrasten')
  })
  it('ohne Handler fehlt der Schalter (andere Aufrufer unverändert)', () => {
    const html = renderToStaticMarkup(createElement(EigenschaftenLeiste, basis as never))
    expect(html).not.toContain('An Anschlüsse einrasten')
  })
})
