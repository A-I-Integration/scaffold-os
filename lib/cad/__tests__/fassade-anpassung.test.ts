import { describe, it, expect } from 'vitest'
import { passeWandabstandAn } from '@/lib/cad/fassade-anpassung'
import { boxNetz } from '@/lib/cad/netz'
import { boolescheOperation } from '@/lib/cad/netz-csg'
import type { BuildingParams } from '@/lib/calculations/cad-engine'

// Haus 12 × 8 × 6 m: im Modell liegen die Wände bei x = ±6 und z = −8,5 … −0,5 (Gerüst-Innenrahmen im Wandabstand davor).
const HAUS: BuildingParams = { lengthM: 12, widthM: 8, heightM: 6, eavesHeightM: 6, roofForm: 'flachdach', overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'] } as BuildingParams
const wand = () => boxNetz([-6, 0, -8.5], [6, 6, -0.5])
const mitErker = (tiefeM: number) => {
  const r = boolescheOperation(wand(), boxNetz([-1, 0, -8.5 - tiefeM], [1, 6, -8.4]), 'vereinigung')
  if (!r.ok) throw new Error(r.fehler)
  return r.netz
}

describe('Wandabstand an die Fassade anpassen', () => {
  it('glatte Wand: kein Handlungsbedarf, Wert bleibt', () => {
    const r = passeWandabstandAn(HAUS, 'layher-allround', wand())
    expect(r).toMatchObject({ gefunden: true, wandabstandM: 0.3, startM: 0.3, kollisionenVorher: 0, kollisionenNachher: 0 })
    expect(r.schritte).toHaveLength(1)
    expect(r.hinweise[0]).toMatch(/bleibt beim eingestellten Wert/)
  })
  it('Erker 0,4 m vor der Wand: Wandabstand wächst auf den kleinsten Wert ohne Kollision (0,45 m)', () => {
    const r = passeWandabstandAn(HAUS, 'layher-allround', mitErker(0.4))
    expect(r.kollisionenVorher).toBeGreaterThan(0)
    expect(r.gefunden).toBe(true)
    expect(r.wandabstandM).toBe(0.45)
    expect(r.kollisionenNachher).toBe(0)
    // alle Schritte davor hatten Kollisionen, der letzte keine
    expect(r.schritte.slice(0, -1).every((s) => s.kollisionen > 0)).toBe(true)
    expect(r.hinweise.join(' ')).toMatch(/erhöht/)
    expect(r.hinweise.join(' ')).toMatch(/über 0,3 m/)
  })
  it('Vorsprung größer als die Obergrenze: bester Wert wird gewählt, Rest wird gemeldet', () => {
    const r = passeWandabstandAn(HAUS, 'layher-allround', mitErker(0.9))
    expect(r.gefunden).toBe(false)
    expect(r.kollisionenNachher).toBeGreaterThan(0)
    expect(r.kollisionenNachher).toBeLessThanOrEqual(r.kollisionenVorher)
    expect(r.hinweise.join(' ')).toMatch(/bleiben \d+ Bauteile in der Hülle/)
    expect(r.wandabstandM).toBeLessThanOrEqual(0.6)
  })
  it('eingestellter Wandabstand ist der Startwert; das Gebäude-Objekt bleibt unverändert', () => {
    const b = { ...HAUS, geruestOptionen: { wandabstandM: 0.4 } } as BuildingParams
    const vorher = JSON.stringify(b)
    const r = passeWandabstandAn(b, 'layher-allround', mitErker(0.4))
    expect(r.startM).toBe(0.4)
    expect(r.wandabstandM).toBe(0.45)
    expect(JSON.stringify(b)).toBe(vorher)
  })
  it('leere Hülle: Hinweis, nichts angepasst', () => {
    const r = passeWandabstandAn(HAUS, 'layher-allround', { punkte: [], dreiecke: [] })
    expect(r.gefunden).toBe(false)
    expect(r.schritte).toEqual([])
    expect(r.hinweise[0]).toMatch(/keine Gebäudehülle/)
  })
})
