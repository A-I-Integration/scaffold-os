import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BalkonEditor from '../../components/cad/BalkonEditor'
import type { BuildingParams } from '../calculations/cad-engine'

const BASIS: BuildingParams = {
  lengthM: 20, widthM: 10, heightM: 10, eavesHeightM: 8, roofHeightM: 3, roofForm: 'satteldach', floors: 3, floorHeightsM: [],
  windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'],
}

describe('BalkonEditor', () => {
  it('ohne Balkone: Hinweis zur automatischen Verteilung und beide Schaltflächen', () => {
    const html = renderToStaticMarkup(createElement(BalkonEditor, { building: BASIS, onChange: () => {} }))
    expect(html).toContain('Balkone einzeln planen')
    expect(html).toContain('gleichmäßig verteilt')
    expect(html).toContain('+ Balkon hinzufügen')
    expect(html).toContain('Aus Aufmaß übernehmen')
  })
  it('mit Balkon: Eingabefelder, Geschossauswahl bis zum 2. OG und Hinweis, dass die Zahl ignoriert wird', () => {
    const b = { ...BASIS, balconies: [{ id: 'x', side: 'front' as const, offsetAlongM: 1.5, widthM: 3, depthM: 1.2, floorIndex: 1, alleLagen: false, modus: 'ausgespart' as const }] }
    const html = renderToStaticMarkup(createElement(BalkonEditor, { building: b, onChange: () => {} }))
    expect(html).toContain('wird ignoriert')
    expect(html).toContain('1. Obergeschoss')
    expect(html).toContain('2. Obergeschoss')
    expect(html).not.toContain('3. Obergeschoss')
    expect(html).toContain('Balkon entfernen')
    expect(html).toContain('value="1.5"')
  })
})
