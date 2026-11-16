// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import EigenschaftenLeiste from '../EigenschaftenLeiste'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'

const b = { lengthM: 14, widthM: 9, heightM: 8, floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'flachdach', sides: ['front', 'back', 'left', 'right'], geruestOptionen: { treppe: false, tuerenFreihalten: false } } as unknown as BuildingParams
const model = generateCADModel(b, 'layher-allround')

describe('Eigenschaften: Feld teilen / zusammenführen', () => {
  it('zeigt beide Werkzeuge mit Längen aus dem Systemkatalog', () => {
    const frame = model.components3D.find((c) => c.type === 'frame' && c.fieldId && model.fields.find((f) => f.id === c.fieldId && f.side === 'front' && !f.isCorner))!
    const html = renderToStaticMarkup(createElement(EigenschaftenLeiste, { model, id: frame.id, artikelWahl: {}, manuell: false, onEntfernen: () => {}, onZu: () => {}, onFeldTeilen: () => {}, onFeldZusammen: () => {} }))
    expect(html).toContain('Feld teilen')
    expect(html).toContain('Mit Nachbarfeld zusammenführen')
    for (const l of model.system!.feldlangenM) expect(html).toContain(l.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' m')
  })
})
