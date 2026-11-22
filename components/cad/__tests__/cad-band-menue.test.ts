import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CadBand from '../CadBand'

const f = () => vi.fn()
const props: any = {
  hatModell: true, viewMode: '3d', onViewMode: f(), bereicheOffen: false, bereichWerkzeug: 'entfernen', onBereichWerkzeug: f(), abbauAktiv: false, onAbbau: f(),
  kannZurueck: true, kannVor: true, onZurueck: f(), onVor: f(), entferntAnzahl: 0, onEntferntZurueck: f(), onEntferntAlleZurueck: f(),
  zeichenWerkzeug: null, onZeichenWerkzeug: f(), figurenAnzahl: 0, onFigurenLoeschen: f(), placementType: null, onPlacement: f(), measureMode: false, onMeasure: f(),
  showBuilding: true, onShowBuilding: f(), showScaffold: true, onShowScaffold: f(), showDimensions: true, onShowDimensions: f(), showEnvironment: true, onShowEnvironment: f(), hoheQualitaet: false, onHoheQualitaet: f(),
  viewAngle: 'perspective', onViewAngle: f(), farbModus: 'real', onFarbModus: f(), layerState: null, onToggleSide: f(), onToggleLevel: f(), onAlleEin: f(), onAlleAus: f(), visibleTypes: {}, onToggleType: f(),
  onPdf: f(), onMontageplan: f(), onDxf: f(), onSpeichern: f(), onBild: f(),
  onNeu: f(), onOeffnen: f(), onGebaeude: f(), onUmriss: f(), onWand: f(), onGeschoss: f(), onDach: f(), onAutomatik: f(), onMessart: f(), onAnsicht: f(), onAnalyse: f(), onDock: f(), onHilfe: f(), onTreppePanel: f(), onGeruestfeldPanel: f(),
}
const html = () => renderToStaticMarkup(createElement(CadBand, props))
const texte = (h: string) => [...h.matchAll(/<span>([^<]+)<\/span><\/button>/g)].map((m) => m[1])

describe('CAD-Band wie im Vorbild', () => {
  it('Menüzeile: Datei bis Hilfe in fester Reihenfolge', () => {
    const h = html()
    const tabs = [...h.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1])
    expect(tabs).toEqual(['Datei', 'Projekt', 'Gebäude', 'Gerüst', 'Bauteile', 'Analyse', 'Prüfung', 'Auswertung', 'Ansicht', 'Hilfe'])
  })
  it('Startreiter Gerüst zeigt die Symbole des Vorbilds in dessen Reihenfolge', () => {
    const t = texte(html())
    const soll = ['Neu', 'Öffnen', 'Speichern', 'Gebäude', 'Umriss', 'Wand', 'Geschoss', 'Dach', 'Automatik', 'Feld', 'Aufstocken', 'Teilabbau', 'Bauteil setzen ▾', 'Treppe', 'Konsole', 'Netz', 'Schutzdach', 'Messen ▾', 'Bemaßung ▾', '2D', '3D', 'Schnitt', 'Ansichten ▾']
    expect(t).toEqual(soll)
  })
  it('ohne Modell sind modellabhängige Symbole gesperrt, Neu, Öffnen und Automatik bleiben frei', () => {
    const h = renderToStaticMarkup(createElement(CadBand, { ...props, hatModell: false }))
    const knoepfe = h.split('<button').slice(1)
    const gesperrt = (name: string) => / disabled=""/.test(knoepfe.find((k) => k.includes(`<span>${name}</span></button>`))!.split('>')[0])
    expect(gesperrt('Feld')).toBe(true)
    expect([gesperrt('Automatik'), gesperrt('Neu'), gesperrt('Öffnen')]).toEqual([false, false, false])
  })
})
