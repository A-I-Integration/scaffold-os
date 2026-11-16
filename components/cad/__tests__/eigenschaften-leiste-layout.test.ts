import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import EigenschaftenLeiste from '../EigenschaftenLeiste'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'

const model = generateCADModel({ lengthM: 13.8, widthM: 8.85, heightM: 6.94, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'satteldach', sides: ['front', 'back', 'left', 'right'], geruestOptionen: { treppe: false } } as unknown as BuildingParams, 'layher-allround')
const h = () => {}

describe('Eigenschaften als Leiste', () => {
  it('schwebt nicht im Bild (kein absolute/fixed, keine Schatten-Karte) und trägt die Leisten-Kennung', () => {
    const html = renderToStaticMarkup(createElement(EigenschaftenLeiste, { model, id: model.components3D[0].id, artikelWahl: {}, manuell: false, onEntfernen: h, onZu: h } as never))
    expect(html).toContain('eigenschaften-leiste')
    expect(html).not.toMatch(/\b(absolute|fixed|shadow-xl)\b/)
    expect(html).toContain('Bauteil entfernen')
  })
})
