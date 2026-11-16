import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import VersionenDialog, { versionBeschreibung } from '@/components/cad/VersionenDialog'
import { erzeugeProjektdatei } from '@/lib/cad/projektdatei'
import { fuegeVersionHinzu } from '@/lib/cad/versionen'
import { bereinigeStatikDaten } from '@/lib/statik-daten'
import type { BuildingParams } from '@/lib/calculations/cad-engine'

const b = { lengthM: 12, widthM: 9, heightM: 8, floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'flachdach', sides: ['front'] } as unknown as BuildingParams
const d = erzeugeProjektdatei({ name: 'T', building: b, systemId: 'layher-allround', statikDaten: bereinigeStatikDaten(undefined), notizen: [], handarbeit: { platzierungen: [{ id: 'm1', type: 'stair', positionX: 1, positionY: 1, positionZ: 1, side: 'front', levelIndex: 0 }], ueberlagerung: { aenderungen: [], kopien: [] }, entfernt: [['a']] } })
const h = () => {}

describe('VersionenDialog', () => {
  it('zeigt Hinweis zum Speicherort und leere Liste', () => {
    const html = renderToStaticMarkup(createElement(VersionenDialog, { versionen: [], speicherFehler: false, onSpeichern: h, onWiederherstellen: h, onLoeschen: h, onUmbenennen: h, onZu: h }))
    expect(html).toContain('nur in diesem Browser'); expect(html).toContain('Noch keine Version')
  })
  it('listet Versionen mit Beschreibung und warnt bei Speicherfehler', () => {
    const l = fuegeVersionHinzu([], d, 'Vor der Treppe')
    const html = renderToStaticMarkup(createElement(VersionenDialog, { versionen: l, speicherFehler: true, onSpeichern: h, onWiederherstellen: h, onLoeschen: h, onUmbenennen: h, onZu: h }))
    expect(html).toContain('Vor der Treppe'); expect(html).toContain('Wiederherstellen'); expect(html).toContain('nicht dauerhaft speichern')
    expect(versionBeschreibung(l[0])).toBe('12 × 9 m · 1 von Hand gesetzt · 1 Entfernungen')
  })
})
