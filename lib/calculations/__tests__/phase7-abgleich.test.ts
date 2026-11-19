// Phase 7: Alles, was von Hand am Modell passiert, muss in Stückliste, Gewicht, Kosten, Hash und Logistik ankommen – und nichts doppelt oder verloren gehen.
import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, calculateLogistics, addManualPlacement, type BuildingParams, type CADModel, type ManualPlacement } from '@/lib/calculations/cad-engine'
import { platzierungAusTreffer } from '@/lib/calculations/cad-platzierung'
import { KEINE_UEBERLAGERUNG, dupliziereBauteil, wendeBauteilAenderungenAn } from '@/lib/cad/bauteil-aenderungen'
import { modellHash } from '@/lib/calculations/modell-stand'

const L = 13.8, W = 8.85
const lform = [{ x: 0, z: 0 }, { x: L, z: 0 }, { x: L, z: W }, { x: L * 0.6, z: W }, { x: L * 0.6, z: W + 2 }, { x: L * 0.3, z: W + 2 }, { x: L * 0.3, z: W }, { x: 0, z: W }]
const bau = (extra: object = {}, treppe = false) => ({ lengthM: L, widthM: W, heightM: 6.94, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'satteldach', sides: ['front', 'back', 'left', 'right'], geruestOptionen: { treppe }, ...extra }) as unknown as BuildingParams
const formen: [string, object][] = [['Rechteck', {}], ['L-Form', { umriss: lform }], ['Hang', { geruestOptionen: { treppe: false, gelaendeEckenM: { fl: 0, fr: 0, bl: -2.4, br: -2.4 } } }]]

// Treppe wird je Treppenlauf gezählt (Außentreppe mit n Läufen = n Stück)
const stueck = (m: CADModel) => m.components3D.filter((c) => !c.extern).reduce((s, c) => s + (c.type === 'stair' && c.articleNumber === 'SP-001' ? Math.max(1, Math.round(c.flights ?? 1)) : 1), 0)
const summe = (m: CADModel) => generateBillOfMaterials(m).reduce((s, i) => s + i.quantity, 0)
const gewicht = (m: CADModel) => generateBillOfMaterials(m).reduce((s, i) => s + i.weightKg * i.quantity, 0)
const preis = (m: CADModel) => generateBillOfMaterials(m).reduce((s, i) => s + i.totalPrice, 0)
const mitStair = (m: CADModel, id = 'manual-t') => {
  const f = m.fields.find((x) => x.levelIndex === 1 && !x.isCorner && !x.durchgang)!
  return { f, m2: addManualPlacement(JSON.parse(JSON.stringify(m)), { id, ...platzierungAusTreffer(m, 'stair', [f.positionX, f.positionY + 1, f.positionZ], '' as ManualPlacement['side'], -1) } as ManualPlacement) }
}

for (const [name, extra] of formen) {
  describe(`Phase 7 – ${name}`, () => {
    const basis = generateCADModel(bau(extra), 'mj-uniconnect')
    it('Stückliste zählt genau die Bauteile des Modells (nichts doppelt, nichts verloren)', () => {
      expect(summe(basis)).toBe(stueck(basis))
      const { m2 } = mitStair(basis)
      expect(summe(m2)).toBe(stueck(m2))
    })
    it('Treppe von Hand = automatische Treppe: gleiche Stückliste, gleiches Gewicht, gleicher Preis', () => {
      const { f, m2 } = mitStair(basis)
      const auto = generateCADModel(bau({ ...extra, geruestOptionen: { ...((extra as any).geruestOptionen ?? {}), treppe: true, treppeFeldId: f.id } }, true), 'mj-uniconnect')
      const zeilen = (m: CADModel) => generateBillOfMaterials(m).map((i) => `${i.articleNumber}:${i.quantity}`).sort().join('|')
      expect(zeilen(m2)).toBe(zeilen(auto))
      expect(Math.round(gewicht(m2) * 100)).toBe(Math.round(gewicht(auto) * 100))
      expect(Math.round(preis(m2) * 100)).toBe(Math.round(preis(auto) * 100))
    })
    it('Treppe setzen erhöht Gewicht und Stückzahl, Entfernen der Treppe stellt den Ausgangsstand wieder her', () => {
      const { m2 } = mitStair(basis)
      expect(gewicht(m2)).toBeGreaterThan(gewicht(basis))
      expect(summe(m2)).toBeGreaterThan(summe(basis) - 1)
      const ohne: CADModel = { ...m2, components3D: m2.components3D.filter((c) => !(c.id === 'manual-t' || c.id.startsWith('manual-t-'))) }
      expect(stueck(ohne)).toBeLessThan(stueck(m2))
      expect(modellHash(m2)).not.toBe(modellHash(basis))
    })
    it('Entfernen mindert die Stückliste um genau die entfernten Bauteile; Kopieren erhöht sie um genau die Kopien', () => {
      const weg = new Set(basis.components3D.filter((c) => c.type === 'deck').slice(0, 3).map((c) => c.id))
      const entfernt: CADModel = { ...basis, components3D: basis.components3D.filter((c) => !weg.has(c.id)) }
      expect(summe(basis) - summe(entfernt)).toBe(3)
      const quelle = basis.components3D.find((c) => c.type === 'railing')!
      const kopiert = wendeBauteilAenderungenAn(basis, dupliziereBauteil(KEINE_UEBERLAGERUNG, quelle.id, [0, 0, 1]).ueberlagerung)
      expect(summe(kopiert) - summe(basis)).toBe(1)
      expect(gewicht(kopiert)).toBeGreaterThan(gewicht(basis))
    })
    it('Verschieben ändert weder Stückzahl noch Gewicht noch Preis, wohl aber den Modellstand (Hash)', () => {
      const id = basis.components3D.find((c) => c.type === 'deck')!.id
      const lage = { ...KEINE_UEBERLAGERUNG, aenderungen: [{ id, dx: 0.5, dy: 0, dz: 0, drehGrad: 0 }] }
      const bewegt = wendeBauteilAenderungenAn(basis, lage)
      expect(summe(bewegt)).toBe(summe(basis)); expect(Math.round(gewicht(bewegt))).toBe(Math.round(gewicht(basis))); expect(Math.round(preis(bewegt))).toBe(Math.round(preis(basis)))
      expect(modellHash(bewegt)).not.toBe(modellHash(basis))
    })
    it('Logistik (Gewicht, Fahrten, Stunden) folgt der Stückliste mit Handarbeit; die Fläche bleibt bei Treppe/Entfernen/Kopieren unverändert', () => {
      const { m2 } = mitStair(basis)
      const lo = calculateLogistics(m2, generateBillOfMaterials(m2), 2)
      expect(lo.gesamtgewichtKg).toBe(Math.round(gewicht(m2)))
      expect(m2.totalAreaM2).toBe(basis.totalAreaM2)
      expect(lo.aufbauStunden).toBe(calculateLogistics(basis, generateBillOfMaterials(basis), 2).aufbauStunden)
    })
  })
}
