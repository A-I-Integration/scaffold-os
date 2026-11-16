// Umriss-Modus am Hang (so importiert die App einen Plan mit Vorsprung): jede Fußplatte steht auf der Geländefläche, die auch die 3D-Ansicht zeichnet.
import { describe, it, expect } from 'vitest'
import { generateCADModel, generateScaffoldComponents, gelaendeHoeheFn, type BuildingParams } from '@/lib/calculations/cad-engine'
import { gelaendeProfilAusLinien } from '@/lib/cad/plan-oeffnungen-modell'
import { hangDaten } from '@/lib/cad/hang-geometrie'
import plan from '@/lib/cad/__tests__/fixtures/plan-import-efh-hang.json'

const haupt = plan.geschosse.find((g) => g.ebene === plan.hauptEbene)!
const profile = gelaendeProfilAusLinien(plan.gelaendeLinien as never, 'unten')
const L = haupt.laengeM, W = haupt.breiteM
const form = [{ x: 0, z: 0 }, { x: L, z: 0 }, { x: L, z: W }, { x: L * 0.6, z: W }, { x: L * 0.6, z: W + 2 }, { x: L * 0.3, z: W + 2 }, { x: L * 0.3, z: W }, { x: 0, z: W }]
const drehe = (pts: typeof form, grad: number) => { const c = Math.cos((grad * Math.PI) / 180), s = Math.sin((grad * Math.PI) / 180); return pts.map((p) => ({ x: p.x * c - p.z * s, z: p.x * s + p.z * c })) }
const bauen = (umriss: typeof form, geruestOptionen?: BuildingParams['geruestOptionen']) => ({
  lengthM: L, widthM: W, heightM: plan.firstKoteM, floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0,
  roofForm: 'flachdach', sides: ['front', 'back', 'left', 'right'], umriss, geruestOptionen,
}) as unknown as BuildingParams

describe('Umriss am Hang', () => {
  for (const grad of [0, 30]) {
    const b = bauen(drehe(form, grad), { gelaendeProfilM: profile })
    const m = generateCADModel(b, 'layher-allround')
    const gfB = gelaendeHoeheFn({ ...b, lengthM: m.building.lengthM, widthM: m.building.widthM, umriss: undefined } as BuildingParams)
    // wie in der 3D-Ansicht: Gelände in Gebäude-Koordinaten (Boxmitte bei 0), der Umriss liegt in Szenen-Koordinaten (Rückseite bei z = −0,5)
    const gf = (x: number, z: number) => gfB(x, z + m.building.widthM / 2 + 0.5)
    const platten = generateScaffoldComponents(m).filter((c) => c.type === 'footplate')
    it(`Drehung ${grad}°: Fußplatten stehen höchstens 1,5 cm neben der Geländefläche, nicht auf einer Ebene`, () => {
      expect(platten.length).toBeGreaterThan(40)
      const abw = platten.map((c) => c.position[1] + 0.02 - gf(c.position[0], c.position[2]))
      expect(Math.max(...abw.map(Math.abs))).toBeLessThan(0.015)
      expect(Math.max(...platten.map((c) => c.position[1])) - Math.min(...platten.map((c) => c.position[1]))).toBeGreaterThan(1.5)
    })
    it(`Drehung ${grad}°: Kennzahlen zählen die belegten Felder und Lagen`, () => {
      expect(m.fieldCount).toBeGreaterThan(10)
      expect(m.levelCount).toBeGreaterThanOrEqual(4)
    })
  }
  it('ohne Gelände bleibt alles flach und unverändert (Füße auf einer Höhe, kein Hang-Hinweis)', () => {
    const m = generateCADModel(bauen(form), 'layher-allround')
    expect(m.warnings.some((w) => w.code === 'UMRISS_HANG_ABGETREPPT')).toBe(false)
    const ys = new Set(generateScaffoldComponents(m).filter((c) => c.type === 'footplate').map((c) => c.position[1]))
    expect(ys.size).toBe(1)
  })
  it('die 3D-Ansicht bekommt für den Umriss dieselbe Geländehöhe (hangDaten)', () => {
    expect(hangDaten(bauen(form, { gelaendeProfilM: profile })).hangM).toBeGreaterThan(2)
    expect(hangDaten(bauen(form)).hangM).toBe(0)
  })
})
