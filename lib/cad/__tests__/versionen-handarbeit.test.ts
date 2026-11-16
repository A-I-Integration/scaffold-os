import { describe, it, expect } from 'vitest'
import { erzeugeProjektdatei, liesProjektdatei, handarbeitLeer, type Handarbeit } from '@/lib/cad/projektdatei'
import { fuegeVersionHinzu, loescheVersion, benenneVersion, versionenZuText, versionenAusText, passeInSpeicher, MAX_VERSIONEN } from '@/lib/cad/versionen'
import { bereinigeStatikDaten } from '@/lib/statik-daten'
import type { BuildingParams } from '@/lib/calculations/cad-engine'

const building = { lengthM: 12, widthM: 9, heightM: 8, floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'flachdach', sides: ['front', 'back'] } as unknown as BuildingParams
const hand: Handarbeit = {
  platzierungen: [{ id: 'manual-stair-1', type: 'stair', positionX: 3.5, positionY: 2.1, positionZ: -6, side: 'front', levelIndex: 1, fieldId: 'field-front-1-2' }, { id: 'manual-f_deck-2', type: 'f_deck', positionX: 1, positionY: 2, positionZ: 0, side: 'back', levelIndex: 0, fieldId: 'field-back-0-1' }],
  ueberlagerung: { aenderungen: [{ id: 'deck-field-front-0-1', dx: 0.1, dy: 0, dz: -0.2, drehGrad: 15 }], kopien: [{ id: 'kopie-1', quelleId: 'rail-field-front-0-1-top', dx: 0, dy: 2, dz: 0, drehGrad: 0 }] },
  entfernt: [['frame-field-front-0-0-left', 'frame-field-front-0-0-right']],
}
const datei = (h?: Handarbeit) => erzeugeProjektdatei({ name: 'Test', building, systemId: 'layher-allround', statikDaten: bereinigeStatikDaten(undefined), notizen: [], handarbeit: h })

describe('Projektdatei: Handarbeit', () => {
  it('speichert und lädt gesetzte Treppen, verschobene, kopierte und entfernte Teile unverändert', () => {
    const l = liesProjektdatei(JSON.stringify(datei(hand)))
    expect(l.ok).toBe(true)
    if (l.ok) { expect(l.daten.handarbeit).toEqual(hand); expect(l.verworfen).toEqual([]) }
  })
  it('ohne Handarbeit steht nichts in der Datei (ältere Dateien bleiben lesbar)', () => {
    const d = datei({ platzierungen: [], ueberlagerung: { aenderungen: [], kopien: [] }, entfernt: [] })
    expect(d.handarbeit).toBeUndefined()
    const l = liesProjektdatei(JSON.stringify(d))
    expect(l.ok && l.daten.handarbeit).toBeFalsy()
    expect(handarbeitLeer({ platzierungen: [], ueberlagerung: { aenderungen: [], kopien: [] }, entfernt: [] })).toBe(true)
  })
  it('verwirft ungültige Einträge einzeln und meldet sie', () => {
    const kaputt = JSON.parse(JSON.stringify(datei(hand)))
    kaputt.handarbeit.platzierungen.push({ id: 'x', type: 'unbekannt', positionX: 1, positionY: 1, positionZ: 1, side: 'front', levelIndex: 0 })
    kaputt.handarbeit.platzierungen.push({ id: 'y', type: 'stair', positionX: 'viel', positionY: 1, positionZ: 1, side: 'front', levelIndex: 0 })
    kaputt.handarbeit.ueberlagerung.aenderungen.push({ id: 'z', dx: 1e9, dy: 0, dz: 0, drehGrad: 0 })
    kaputt.handarbeit.entfernt.push('kein-array')
    const l = liesProjektdatei(JSON.stringify(kaputt))
    expect(l.ok).toBe(true)
    if (l.ok) {
      expect(l.daten.handarbeit?.platzierungen.map((p) => p.id)).toEqual(['manual-stair-1', 'manual-f_deck-2'])
      expect(l.daten.handarbeit?.ueberlagerung.aenderungen).toHaveLength(1)
      expect(l.daten.handarbeit?.entfernt).toHaveLength(1)
      expect(l.verworfen.some((v) => v.startsWith('Handarbeit'))).toBe(true)
    }
  })
})

describe('Versionsverlauf', () => {
  const d = datei(hand)
  it('neueste Version steht vorn, Nummern zählen weiter, Namen werden gekürzt und haben einen Ersatz', () => {
    let l = fuegeVersionHinzu([], d, 'Vor der Treppe')
    l = fuegeVersionHinzu(l, d, '')
    expect(l.map((v) => v.id)).toEqual(['v2', 'v1'])
    expect(l[0].name).toBe('Version 2')
    expect(fuegeVersionHinzu([], d, 'x'.repeat(200))[0].name).toHaveLength(80)
    l = loescheVersion(l, 'v1')
    expect(fuegeVersionHinzu(l, d, 'neu')[0].id).toBe('v3') // keine Nummer doppelt vergeben
  })
  it(`behält höchstens ${MAX_VERSIONEN} Versionen, die ältesten fallen heraus`, () => {
    let l: ReturnType<typeof fuegeVersionHinzu> = []
    for (let i = 0; i < MAX_VERSIONEN + 5; i++) l = fuegeVersionHinzu(l, d, `V${i}`)
    expect(l).toHaveLength(MAX_VERSIONEN)
    expect(l[0].name).toBe(`V${MAX_VERSIONEN + 4}`)
  })
  it('Umbenennen und Löschen verändern nur die gemeinte Version', () => {
    let l = fuegeVersionHinzu(fuegeVersionHinzu([], d, 'a'), d, 'b')
    l = benenneVersion(l, 'v1', 'Alt')
    expect(l.map((v) => v.name)).toEqual(['b', 'Alt'])
    expect(loescheVersion(l, 'v2').map((v) => v.id)).toEqual(['v1'])
  })
  it('Speichern und Lesen ist verlustfrei inklusive Handarbeit; Kaputtes wird übersprungen', () => {
    const l = fuegeVersionHinzu([], d, 'Stand')
    const zurueck = versionenAusText(versionenZuText(l))
    expect(zurueck).toHaveLength(1)
    expect(zurueck[0].daten.handarbeit).toEqual(hand)
    expect(versionenAusText('kein json')).toEqual([])
    expect(versionenAusText(null)).toEqual([])
    const gemischt = JSON.parse(versionenZuText(l)); gemischt.push({ id: 'v9', name: 'kaputt', zeit: 'x', daten: { format: 'falsch' } })
    expect(versionenAusText(JSON.stringify(gemischt))).toHaveLength(1)
  })
  it('zu große Liste verliert die ältesten, die neueste bleibt immer', () => {
    let l: ReturnType<typeof fuegeVersionHinzu> = []
    for (let i = 0; i < 6; i++) l = fuegeVersionHinzu(l, d, `V${i}`)
    const klein = passeInSpeicher(l, 3000)
    expect(klein.length).toBeLessThan(l.length)
    expect(klein[0].name).toBe('V5')
    expect(passeInSpeicher(l, 1)).toHaveLength(1)
  })
})
