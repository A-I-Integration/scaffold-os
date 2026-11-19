import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import EigenschaftenLeiste from '../EigenschaftenLeiste'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'

const model = generateCADModel({ lengthM: 13.8, widthM: 8.85, heightM: 6.94, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'satteldach', sides: ['front'], geruestOptionen: { treppe: false } } as unknown as BuildingParams, 'layher-allround')
const h = () => {}
const deck = model.components3D.find((c) => c.type === 'deck')!
const basis = { model, id: deck.id, artikelWahl: {}, manuell: false, onEntfernen: h, onZu: h, onLage: h, onEinrasten: h, griffModus: 'verschieben', einrasten: true }

describe('Maße und Drehung in den Eigenschaften', () => {
  it('zeigt Länge/Breite/Höhe und Drehung x/y/z mit den Werten des Bauteils', () => {
    const html = renderToStaticMarkup(createElement(EigenschaftenLeiste, { ...basis, onMasseDrehung: h } as never))
    expect(html).toContain('data-testid="masse-drehung"')
    for (const l of ['Maß Länge', 'Maß Breite', 'Maß Höhe', 'Drehung x', 'Drehung y', 'Drehung z']) expect(html).toContain(`aria-label="${l}"`)
    expect(html).toContain('Maße übernehmen')
    expect(html).toContain('Drehung übernehmen')
    expect(html).toMatch(/aria-label="Drehung x"[^>]*value="-90"/)
    expect(html).toMatch(/aria-label="Maß Länge"[^>]*value="3,02"/)
  })
  it('ohne Handler fehlt der Block', () => {
    expect(renderToStaticMarkup(createElement(EigenschaftenLeiste, basis as never))).not.toContain('masse-drehung')
  })
})
