// Treppe von Hand setzen: dieselbe Außentreppe wie die automatische – vor dem Gerüst, vom Boden bis zur obersten Lage der Reihe.
import { describe, it, expect } from 'vitest'
import { generateCADModel, addManualPlacement, feldReihe, type BuildingParams, type ManualPlacement, type ScaffoldComponent3D } from '@/lib/calculations/cad-engine'
import { platzierungAusTreffer, platzierungIdVon, verschiebePlatzierung } from '@/lib/calculations/cad-platzierung'

const L = 12, W = 9, R = 5
const basis = (o: Partial<BuildingParams>, treppe = false) => ({ lengthM: L, widthM: W, heightM: 8, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'flachdach', sides: ['front', 'back', 'left', 'right'], ...o, geruestOptionen: { treppe, tuerenFreihalten: false, ...(o.geruestOptionen as object) } }) as unknown as BuildingParams
const lform = [{ x: 0, z: 0 }, { x: L, z: 0 }, { x: L, z: W }, { x: L * 0.6, z: W }, { x: L * 0.6, z: W + 2 }, { x: L * 0.3, z: W + 2 }, { x: L * 0.3, z: W }, { x: 0, z: W }]
const formen: [string, Partial<BuildingParams>][] = [
  ['Rechteck', {}],
  ['L-Form-Umriss', { umriss: lform }],
  ['Hang (Umriss, hinten 2,4 m tiefer)', { umriss: lform, geruestOptionen: { gelaendeEckenM: { fl: 0, fr: 0, bl: -2.4, br: -2.4 } } as never }],
  ['Achteck-Umriss', { lengthM: 10, widthM: 10, umriss: Array.from({ length: 8 }, (_, i) => ({ x: R + R * Math.cos((2 * Math.PI * i) / 8), z: R + R * Math.sin((2 * Math.PI * i) / 8) })) }],
]
const hauptlauf = (cs: ScaffoldComponent3D[], id: string) => cs.find((c) => c.id === id)!

for (const [name, o] of formen) {
  describe(`Außentreppe von Hand – ${name}`, () => {
    const m = generateCADModel(basis(o), 'layher-allround')
    const auto = generateCADModel(basis(o, true), 'layher-allround')
    const setze = (id: string, mod = m, f = m.fields.find((x) => x.levelIndex === 1 && !x.isCorner) ?? m.fields.find((x) => x.levelIndex === 1)!) =>
      addManualPlacement(JSON.parse(JSON.stringify(mod)), { id, ...platzierungAusTreffer(mod, 'stair', [f.positionX, f.positionY + 1, f.positionZ], '' as ManualPlacement['side'], -1) } as ManualPlacement)

    it('entspricht der automatischen Treppe: gleiche Lauf-Anzahl bis ganz nach oben, Breite, Höhe und Abstand vor dem Gerüst', () => {
      const lauf = auto.components3D.find((c) => c.id === 'stair-frame-0')!
      const autoFeld = auto.fields.find((f) => Math.hypot(f.positionX - lauf.position[0], f.positionZ - lauf.position[2]) < f.lengthM && f.levelIndex === 0) ?? auto.fields[0]
      // dasselbe Feld in einem Modell ohne automatische Treppe anklicken
      const gleichesFeld = m.fields.find((f) => f.id === autoFeld.id)!
      const m2 = setze('manual-t', m, gleichesFeld)
      const von = hauptlauf(m2.components3D, 'manual-t')
      expect(von, 'Hauptteil der Treppe').toBeTruthy()
      expect(von.type).toBe('stair')
      expect(von.flights).toBe(lauf.flights)
      for (let i = 0; i < 3; i++) expect(von.scale[i]).toBeCloseTo(lauf.scale[i], 6)
      for (let i = 0; i < 3; i++) expect(von.position[i]).toBeCloseTo(lauf.position[i], 6)
      const teileAuto = auto.components3D.filter((c) => c.id.startsWith('stair-')).length
      expect(m2.components3D.filter((c) => c.id === 'manual-t' || c.id.startsWith('manual-t-')).length).toBe(teileAuto)
    })
    it('Treppe führt durch alle Lagen der angeklickten Reihe, IDs bleiben eindeutig und der Platzierung zuordenbar', () => {
      const f = m.fields.find((x) => x.levelIndex === 1 && !x.isCorner) ?? m.fields.find((x) => x.levelIndex === 1)!
      const reihe = feldReihe(m, f)
      const m2 = setze('manual-t')
      const lauf = hauptlauf(m2.components3D, 'manual-t')
      expect(lauf.flights).toBeGreaterThanOrEqual(Math.min(reihe.length, 2))
      expect(new Set(m2.components3D.map((c) => c.id)).size).toBe(m2.components3D.length)
      for (const c of m2.components3D.filter((c) => c.id.startsWith('manual-t'))) expect(platzierungIdVon(c.id, [{ id: 'manual-t' }])).toBe('manual-t')
      // beginnt in der untersten Lage der Reihe (Boden), endet oben
      const unten = reihe[0]
      expect(lauf.position[1] - lauf.scale[1] / 2).toBeLessThan(unten.positionY + 1.2)
    })
    it('steht vor dem Gerüst (außerhalb der Belag-Außenkante), nicht im Gerüst', () => {
      const f = m.fields.find((x) => x.levelIndex === 1 && !x.isCorner) ?? m.fields.find((x) => x.levelIndex === 1)!
      const m2 = setze('manual-t', m, f)
      const lauf = hauptlauf(m2.components3D, 'manual-t')
      const feldMitte = Math.hypot(f.positionX, f.positionZ)
      expect(Number.isFinite(feldMitte)).toBe(true)
      // Abstand Lauf–Feldmitte größer als halbe Gerüstbreite (Treppe liegt außen)
      const d = Math.hypot(lauf.position[0] - f.positionX, lauf.position[2] - f.positionZ)
      expect(d).toBeGreaterThan(f.widthM / 2)
    })
    it('Ziehen auf ein weit entferntes Feld baut die Treppe dort neu (wieder bis oben)', () => {
      const f = m.fields.find((x) => x.levelIndex === 1)!
      const abst = (g: (typeof m.fields)[number]) => (g.positionX - f.positionX) ** 2 + (g.positionZ - f.positionZ) ** 2
      const ziel = m.fields.filter((g) => g.levelIndex === 1).sort((a, b) => abst(b) - abst(a))[0]
      const pl = { id: 'manual-t', ...platzierungAusTreffer(m, 'stair', [f.positionX, f.positionY + 1, f.positionZ], '' as ManualPlacement['side'], -1) } as ManualPlacement
      const neu = verschiebePlatzierung(m, pl, [ziel.positionX, ziel.positionY + 1, ziel.positionZ], '' as ManualPlacement['side'], -1)
      const m2 = addManualPlacement(JSON.parse(JSON.stringify(m)), neu as ManualPlacement)
      const lauf = hauptlauf(m2.components3D, 'manual-t')
      expect(lauf).toBeTruthy()
      expect(neu.fieldId).toBe(ziel.id)
      expect(Math.hypot(lauf.position[0] - ziel.positionX, lauf.position[2] - ziel.positionZ)).toBeLessThan(ziel.widthM + 1.5)
    })
  })
}

describe('Treppe ohne Feldbezug', () => {
  it('wird nie zur Rückfall-Spindeltreppe (4 Rohre), sondern zur vollständigen Außentreppe am nächsten Feld', () => {
    const m = generateCADModel(basis({}), 'layher-allround')
    const f = m.fields.find((x) => x.levelIndex === 1)!
    const m2 = addManualPlacement(JSON.parse(JSON.stringify(m)), { id: 'manual-x', type: 'stair', positionX: f.positionX, positionY: f.positionY + 1, positionZ: f.positionZ, side: f.side, levelIndex: f.levelIndex } as ManualPlacement)
    const lauf = m2.components3D.find((c) => c.id === 'manual-x')!
    expect(lauf.flights).toBeGreaterThan(0)
    expect(m2.components3D.some((c) => c.name === 'Spindeltreppe (manuell)')).toBe(false)
    expect(m2.components3D.filter((c) => c.id.startsWith('manual-x-stair-step')).length).toBeGreaterThan(5)
  })
})
