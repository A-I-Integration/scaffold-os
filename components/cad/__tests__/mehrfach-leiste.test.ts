import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MehrfachLeiste, { auswahlZusammenfassung } from '@/components/cad/MehrfachLeiste'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'

const m = generateCADModel({ lengthM: 12, widthM: 9, heightM: 8, floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'flachdach', sides: ['front'] } as unknown as BuildingParams, 'layher-allround')

describe('Mehrfachauswahl-Kasten', () => {
  const ids = m.components3D.filter((c) => c.type === 'deck').slice(0, 3).map((c) => c.id).concat(m.components3D.filter((c) => c.type === 'railing').slice(0, 2).map((c) => c.id))
  it('fasst die Auswahl nach Bauteilart aus dem Modell zusammen', () => {
    const t = auswahlZusammenfassung(m, ids)
    expect(t).toContain('5 Bauteile')
    expect(t).toContain('3 Beläge')
    expect(t).toContain('2 Geländer')
  })
  it('meldet Auswahl-Einträge, die es nicht mehr gibt', () => {
    expect(auswahlZusammenfassung(m, [...ids, 'gibt-es-nicht'])).toContain('1 nicht mehr vorhanden')
  })
  it('zeigt Entfernen, Verschieben, Kopieren und Auswahlrahmen', () => {
    const h = renderToStaticMarkup(createElement(MehrfachLeiste, { model: m, ids, einrasten: true, rahmenAktiv: false, onVerschieben: () => {}, onKopieren: () => {}, onEntfernen: () => {}, onAbwaehlen: () => {}, onRahmen: () => {} }))
    for (const wort of ['Mehrfachauswahl', 'Verschieben', 'Kopieren', 'Alle entfernen', 'Auswahlrahmen', 'rastet auf 5 cm']) expect(h).toContain(wort)
  })
  it('Rahmen-Schalter zeigt den Zustand', () => {
    const h = renderToStaticMarkup(createElement(MehrfachLeiste, { model: m, ids, einrasten: false, rahmenAktiv: true, onVerschieben: () => {}, onKopieren: () => {}, onEntfernen: () => {}, onAbwaehlen: () => {}, onRahmen: () => {} }))
    expect(h).toContain('Rahmen: an')
    expect(h).not.toContain('rastet auf 5 cm')
  })
})
