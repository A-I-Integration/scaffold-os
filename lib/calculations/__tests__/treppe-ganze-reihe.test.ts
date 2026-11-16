// Treppe setzen: ein Klick setzt die Treppe durch die ganze Reihe – in jeder Lage übereinander, von unten bis oben.
import { describe, it, expect } from 'vitest'
import { generateCADModel, addManualPlacement, type BuildingParams, type ManualPlacement } from '@/lib/calculations/cad-engine'
import { platzierungAusTreffer, platzierungIdVon, verschiebePlatzierung } from '@/lib/calculations/cad-platzierung'

const basis = (o: Partial<BuildingParams>) => ({ lengthM: 12, widthM: 9, heightM: 8, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'flachdach', sides: ['front', 'back', 'left', 'right'], geruestOptionen: { treppe: false, tuerenFreihalten: false }, ...o }) as unknown as BuildingParams
const R = 5
const formen: [string, BuildingParams][] = [
  ['Rechteck', basis({})],
  ['Achteck-Umriss', basis({ lengthM: 10, widthM: 10, umriss: Array.from({ length: 8 }, (_, i) => ({ x: R + R * Math.cos((2 * Math.PI * i) / 8), z: R + R * Math.sin((2 * Math.PI * i) / 8) })) })],
]
for (const [name, b] of formen) {
  describe(`Treppe durch die ganze Reihe – ${name}`, () => {
    const m = generateCADModel(b, 'layher-allround')
    const f1 = m.fields.find((f) => f.levelIndex === 1 && !f.isCorner) ?? m.fields.find((f) => f.levelIndex === 1)!
    const reihe = m.fields.filter((f) => f.side === f1.side && Math.abs(f.positionX - f1.positionX) < 1e-6 && Math.abs(f.positionZ - f1.positionZ) < 1e-6)
    const setze = (id: string, mod = m) => addManualPlacement(JSON.parse(JSON.stringify(mod)), { id, ...platzierungAusTreffer(mod, 'stair', [f1.positionX, f1.positionY + 1, f1.positionZ], '' as ManualPlacement['side'], -1) } as ManualPlacement)
    it('jede Lage der Reihe bekommt einen Treppenlauf, ID-Zuordnung bleibt eindeutig', () => {
      const m2 = setze('manual-t')
      const laeufe = m2.components3D.filter((c) => c.type === 'stair' && c.id.startsWith('manual-t'))
      expect(reihe.length).toBeGreaterThanOrEqual(3)
      expect(laeufe.length).toBe(reihe.length)
      const hoehen = laeufe.map((c) => c.position[1]).sort((a, b) => a - b)
      expect(new Set(hoehen.map((h) => h.toFixed(2))).size).toBe(reihe.length) // übereinander
      expect(new Set(m2.components3D.map((c) => c.id)).size).toBe(m2.components3D.length)
      for (const c of m2.components3D.filter((c) => c.id.startsWith('manual-t'))) expect(platzierungIdVon(c.id, [{ id: 'manual-t' }])).toBe('manual-t')
    })
    it('Belag der Treppenöffnung entfällt über jeder Lage außer der obersten Lage selbst', () => {
      const m2 = setze('manual-t')
      for (const f of reihe.filter((x) => x.levelIndex > 0)) expect(m2.components3D.some((c) => c.id === `deck-${f.id}`), f.id).toBe(false)
      expect(m2.components3D.some((c) => c.id === `deck-${reihe[0].id}`)).toBe(true)
    })
    it('Ziehen auf eine andere Reihe baut die Treppe dort wieder durch alle Lagen', () => {
      const abst = (f: (typeof m.fields)[number]) => (f.positionX - f1.positionX) ** 2 + (f.positionZ - f1.positionZ) ** 2
      const ziel = m.fields.filter((f) => f.levelIndex === 0).sort((x, y) => abst(y) - abst(x))[0]
      const pl = { id: 'manual-t', ...platzierungAusTreffer(m, 'stair', [f1.positionX, f1.positionY + 1, f1.positionZ], '' as ManualPlacement['side'], -1) } as ManualPlacement
      const neu = verschiebePlatzierung(m, pl, [ziel.positionX, ziel.positionY + 1, ziel.positionZ], '' as ManualPlacement['side'], -1)
      const m2 = addManualPlacement(JSON.parse(JSON.stringify(m)), neu as ManualPlacement)
      const reihe2 = m.fields.filter((f) => f.side === ziel.side && Math.abs(f.positionX - ziel.positionX) < 1e-6 && Math.abs(f.positionZ - ziel.positionZ) < 1e-6)
      expect(m2.components3D.filter((c) => c.type === 'stair' && c.id.startsWith('manual-t')).length).toBe(reihe2.length)
    })
  })
}
