import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, type BuildingParams } from '@/lib/calculations/cad-engine'
import { wendeBauteilAenderungenAn, setzeBauteilLage, dupliziereBauteil, setzeBauteilZurueck, KEINE_UEBERLAGERUNG, rastern, istKopieId } from '@/lib/cad/bauteil-aenderungen'
import { pruefeModell3D } from '@/lib/cad/datenqualitaet'

const b = { lengthM: 12, widthM: 8, heightM: 9, eavesHeightM: 7.5, roofHeightM: 1.5, roofForm: 'satteldach', floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front', 'left'] } as BuildingParams
const m0 = generateCADModel(b, 'layher-allround')
const deck = m0.components3D.find((c) => c.type === 'deck')!
const anz = (m: typeof m0, art: string) => generateBillOfMaterials(m).filter((z) => z.articleNumber === art).reduce((s, z) => s + z.quantity, 0)

describe('manuelle Bauteiländerungen (Phase 1)', () => {
  it('Verschieben ändert nur dieses Bauteil, das Ausgangsmodell bleibt unverändert', () => {
    const u = setzeBauteilLage(KEINE_UEBERLAGERUNG, deck, deck, [deck.position[0] + 0.25, deck.position[1] + 0.5, deck.position[2]])
    const m = wendeBauteilAenderungenAn(m0, u)
    const neu = m.components3D.find((c) => c.id === deck.id)!
    expect(neu.position[0]).toBeCloseTo(deck.position[0] + 0.25, 4); expect(neu.position[1]).toBeCloseTo(deck.position[1] + 0.5, 4)
    expect(m0.components3D.find((c) => c.id === deck.id)!.position).toEqual(deck.position)
    expect(m.components3D.length).toBe(m0.components3D.length)
  })
  it('wiederholtes Verschieben summiert sich, Rückkehr zur Ausgangslage entfernt den Eintrag', () => {
    let u = setzeBauteilLage(KEINE_UEBERLAGERUNG, deck, deck, [deck.position[0] + 1, deck.position[1], deck.position[2]])
    const angezeigt = wendeBauteilAenderungenAn(m0, u).components3D.find((c) => c.id === deck.id)!
    u = setzeBauteilLage(u, deck, angezeigt, [deck.position[0], deck.position[1], deck.position[2]])
    expect(u.aenderungen).toEqual([])
  })
  it('Drehen um die Hochachse um 90° (Position bleibt)', () => {
    const u = setzeBauteilLage(KEINE_UEBERLAGERUNG, deck, deck, deck.position, 90)
    const neu = wendeBauteilAenderungenAn(m0, u).components3D.find((c) => c.id === deck.id)!
    expect(neu.position).toEqual(deck.position)
    // Weltachse Y: Ergebnis = Drehung um Y ∘ ursprüngliche Ausrichtung (Euler-Darstellung kann anders aussehen)
    const soll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...deck.rotation)))
    const ist = new THREE.Quaternion().setFromEuler(new THREE.Euler(...neu.rotation))
    expect(Math.abs(soll.dot(ist))).toBeGreaterThan(0.9999)
  })
  it('Duplizieren: Stückliste wächst um genau ein Bauteil, Kopie liegt 0,5 m daneben', () => {
    const { ueberlagerung, neueId } = dupliziereBauteil(KEINE_UEBERLAGERUNG, deck.id)
    const m = wendeBauteilAenderungenAn(m0, ueberlagerung)
    expect(istKopieId(neueId)).toBe(true)
    expect(m.components3D.length).toBe(m0.components3D.length + 1)
    expect(anz(m, deck.articleNumber)).toBe(anz(m0, deck.articleNumber) + 1)
    expect(m.components3D.find((c) => c.id === neueId)!.position[0]).toBeCloseTo(deck.position[0] + 0.5, 4)
  })
  it('Kopie einer Kopie und Zurücksetzen/Löschen', () => {
    const a = dupliziereBauteil(KEINE_UEBERLAGERUNG, deck.id)
    const b2 = dupliziereBauteil(a.ueberlagerung, a.neueId)
    expect(b2.ueberlagerung.kopien).toHaveLength(2)
    expect(wendeBauteilAenderungenAn(m0, b2.ueberlagerung).components3D.length).toBe(m0.components3D.length + 2)
    expect(setzeBauteilZurueck(b2.ueberlagerung, a.neueId).kopien).toHaveLength(1)
  })
  it('Bauteil nicht mehr im Modell (Neuberechnung): Änderung wird übersprungen, kein Absturz', () => {
    const u = { aenderungen: [{ id: 'gibt-es-nicht', dx: 1, dy: 0, dz: 0, drehGrad: 0 }], kopien: [{ id: 'kopie-1-x', quelleId: 'x', dx: 0, dy: 0, dz: 0, drehGrad: 0 }] }
    expect(wendeBauteilAenderungenAn(m0, u).components3D.length).toBe(m0.components3D.length)
  })
  it('Einrasten auf 5 cm bzw. ausgeschaltet', () => { expect(rastern(0.123, 0.05)).toBeCloseTo(0.1, 6); expect(rastern(0.123, 0)).toBe(0.123) })
  it('manuell verschobener Fuß wird von der 3D-Prüfung gemeldet, nicht automatisch korrigiert', () => {
    const fuss = m0.components3D.find((c) => c.type === 'footplate')!
    const m = wendeBauteilAenderungenAn(m0, setzeBauteilLage(KEINE_UEBERLAGERUNG, fuss, fuss, [fuss.position[0], fuss.position[1] + 0.2, fuss.position[2]]))
    expect(pruefeModell3D(m).befunde.some((x) => x.code === 'FUESSE_GELAENDE' && x.ampel === 'rot')).toBe(true)
    expect(m.components3D.find((c) => c.id === fuss.id)!.position[1]).toBeCloseTo(fuss.position[1] + 0.2, 4)
  })
})

import { bauteileDerLage, verschiebeBauteile, kopiereBauteile, imHoehenraster } from '@/lib/cad/bauteil-aenderungen'
describe('Lagen als Ganzes (Phase 2)', () => {
  const lageIdx = m0.levels[1].index
  const ids = bauteileDerLage(m0, lageIdx, 'front')
  it('Lage enthält Beläge und Geländer dieser Seite, keine Fußplatten, nichts anderer Lagen', () => {
    expect(ids.length).toBeGreaterThan(5)
    const t = new Set(ids.map((i) => m0.components3D.find((c) => c.id === i)!.type))
    expect(t.has('deck') || t.has('railing')).toBe(true); expect(t.has('footplate')).toBe(false)
    const felder = new Set(m0.fields.filter((f) => f.levelIndex === lageIdx && f.side === 'front').map((f) => f.id))
    for (const i of ids) expect(felder.has(m0.components3D.find((c) => c.id === i)!.fieldId!)).toBe(true)
    expect(bauteileDerLage(m0, lageIdx, null).length).toBeGreaterThanOrEqual(ids.length)
  })
  it('Lage nach oben verschieben: alle Bauteile genau um die Rasterhöhe, übrige unverändert', () => {
    const h = m0.levels[1].heightM
    const m = wendeBauteilAenderungenAn(m0, verschiebeBauteile(KEINE_UEBERLAGERUNG, m0, ids, [0, h, 0]))
    for (const c of m0.components3D) {
      const n = m.components3D.find((x) => x.id === c.id)!
      expect(n.position[1] - c.position[1]).toBeCloseTo(ids.includes(c.id) ? h : 0, 4)
    }
    expect(m.components3D.length).toBe(m0.components3D.length)
  })
  it('Lage kopieren: Stückliste wächst um genau die Bauteile der Lage', () => {
    const m = wendeBauteilAenderungenAn(m0, kopiereBauteile(KEINE_UEBERLAGERUNG, ids, [0, m0.levels[1].heightM, 0]))
    expect(m.components3D.length).toBe(m0.components3D.length + ids.length)
    const art = m0.components3D.find((c) => c.id === ids[0])!.articleNumber
    expect(anz(m, art)).toBeGreaterThan(anz(m0, art))
  })
  it('Höhenraster', () => { expect(imHoehenraster(4, 2)).toBe(true); expect(imHoehenraster(3.01, 2)).toBe(false); expect(imHoehenraster(3, 1.5)).toBe(true) })
})
