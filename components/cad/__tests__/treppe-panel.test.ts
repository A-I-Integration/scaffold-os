import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import TreppePanel from '@/components/cad/TreppePanel'
import { generateCADModel, type BuildingParams, type ManualPlacement } from '@/lib/calculations/cad-engine'

const m = generateCADModel({ lengthM: 13.8, widthM: 8.85, heightM: 6.94, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'satteldach', sides: ['front', 'back', 'left', 'right'] } as unknown as BuildingParams, 'layher-allround')
const h = () => {}
const stair = { id: 's', type: 'stair', positionX: 0, positionY: 0, positionZ: 0, side: 'front', levelIndex: 0 } as ManualPlacement

describe('TreppePanel', () => {
  it('bietet Seiten und Felder zur Auswahl an und sperrt das Schieben ohne gewählte Treppe', () => {
    const html = renderToStaticMarkup(createElement(TreppePanel, { model: m, treppe: null, onSetzen: h, onSchieben: h, onZu: h }))
    expect(html).toContain('Treppe hier setzen'); expect(html).toContain('Vorderseite'); expect(html).toContain('Feld 1'); expect(html).toContain('erst eine von Hand gesetzte Treppe anklicken'.slice(0, 20))
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Felder vor"|aria-label="Felder vor"[^>]*disabled/)
  })
  it('mit gewählter Treppe sind die Schiebe-Knöpfe aktiv und die Meldung erscheint', () => {
    const html = renderToStaticMarkup(createElement(TreppePanel, { model: m, treppe: stair, meldung: 'Am Ende der Seite: weiter geht es nicht.', onSetzen: h, onSchieben: h, onZu: h }))
    expect(html).toContain('Gewählte Treppe schieben'); expect(html).toContain('Am Ende der Seite'); expect(html).not.toMatch(/disabled=""[^>]*aria-label="Felder vor"/)
  })
  it('liegt als Leiste unter dem Band und schwebt nicht im Bild', () => {
    const html = renderToStaticMarkup(createElement(TreppePanel, { model: m, treppe: null, onSetzen: h, onSchieben: h, onZu: h }))
    expect(html).not.toMatch(/\b(absolute|fixed)\b/); expect(html).toContain('treppe-leiste')
  })
  it('zeigt Lage und „Leiter hier setzen“ nur, wenn die Leiter-Funktion übergeben wird', () => {
    const mit = renderToStaticMarkup(createElement(TreppePanel, { model: m, treppe: null, onSetzen: h, onLeiter: h, onSchieben: h, onZu: h }))
    expect(mit).toContain('Leiter hier setzen'); expect(mit).toContain('Lage 1'); expect(mit).toContain('Lage 3')
    const ohne = renderToStaticMarkup(createElement(TreppePanel, { model: m, treppe: null, onSetzen: h, onSchieben: h, onZu: h }))
    expect(ohne).not.toContain('Leiter hier setzen')
  })
  it('bietet „Durchstieg (alle Lagen)“ nur mit übergebener Funktion an', () => {
    expect(renderToStaticMarkup(createElement(TreppePanel, { model: m, treppe: null, onSetzen: h, onLeiter: h, onDurchstieg: h, onSchieben: h, onZu: h }))).toContain('Durchstieg (alle Lagen)')
    expect(renderToStaticMarkup(createElement(TreppePanel, { model: m, treppe: null, onSetzen: h, onLeiter: h, onSchieben: h, onZu: h }))).not.toContain('Durchstieg (alle Lagen)')
  })
})
