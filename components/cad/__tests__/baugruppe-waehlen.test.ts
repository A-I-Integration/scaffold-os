import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import EigenschaftenLeiste from '../EigenschaftenLeiste'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { geruestfeldErzeugen } from '@/lib/cad/geruestfeld'
import { teileDerBaugruppe } from '@/lib/cad/baugruppen'

const haus: BuildingParams = { lengthM: 12, widthM: 8, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [4, 4], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'], geruestOptionen: { treppe: false } }
const m0 = generateCADModel(haus, 'layher-allround')
const feld = geruestfeldErzeugen(m0, { side: 'front', klickX: 0, klickZ: 0, feldlaengeM: 2.5, breiteM: 0.73, lagen: 2, geschosshoeheM: 2, id: 'feld-b' })
const model = { ...m0, components3D: [...m0.components3D, ...feld.teile] }
const h = () => {}
const basis = { model, id: feld.teile[0].id, artikelWahl: {}, manuell: false, onEntfernen: h, onZu: h, onLage: h, onEinrasten: h, griffModus: 'verschieben', einrasten: true }

describe('Ganze Baugruppe wählen', () => {
  it('teileDerBaugruppe liefert alle Teile des Gerüstfeldes, Einzelteile nur sich selbst', () => {
    expect(teileDerBaugruppe(model.components3D, feld.teile[0].id).length).toBe(feld.teile.length)
    const frei = m0.components3D[0]
    expect(teileDerBaugruppe(model.components3D, frei.id)).toEqual([frei.id])
  })
  it('Knopf erscheint nur bei Baugruppen mit mehr als einem Teil', () => {
    const mit = renderToStaticMarkup(createElement(EigenschaftenLeiste, { ...basis, baugruppeAnzahl: feld.teile.length, onBaugruppe: h } as never))
    expect(mit).toContain(`Ganze Baugruppe wählen (${feld.teile.length} Teile)`)
    expect(renderToStaticMarkup(createElement(EigenschaftenLeiste, { ...basis, baugruppeAnzahl: 1, onBaugruppe: h } as never))).not.toContain('Ganze Baugruppe')
  })
})
