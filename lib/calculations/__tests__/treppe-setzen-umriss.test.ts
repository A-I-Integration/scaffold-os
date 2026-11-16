// Treppe setzen/ziehen: rastet im ganzen Gerüst auf das nächste Feld ein (jede Seite, jede Lage, auch an Umriss-Kanten),
// auch wenn der Klick auf ein Teil ohne Feldbezug fällt (Seite/Lage unbekannt).
import { describe, it, expect } from 'vitest'
import { generateCADModel, addManualPlacement, type BuildingParams, type ManualPlacement } from '@/lib/calculations/cad-engine'
import { platzierungAusTreffer, verschiebePlatzierung } from '@/lib/calculations/cad-platzierung'

const basis = (o: Partial<BuildingParams>) => ({ lengthM: 12, widthM: 9, heightM: 8, floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'flachdach', sides: ['front', 'back', 'left', 'right'], ...o }) as unknown as BuildingParams
const formen: [string, BuildingParams][] = [
  ['Rechteck', basis({})],
  ['Umriss (L-Form)', basis({ umriss: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 6, z: 9 }, { x: 6, z: 12 }, { x: 0, z: 12 }] })],
]

for (const [name, b] of formen) {
  describe(`Treppe – ${name}`, () => {
    const m = generateCADModel(b, 'layher-allround')
    const felder = m.fields.filter((f) => f.levelIndex === 1 && !f.isCorner)
    it('jedes Feld wird getroffen, auch bei unbekannter Seite/Lage', () => {
      expect(felder.length).toBeGreaterThan(4)
      for (const f of felder) {
        const lage = m.levels.find((l) => l.index === 1)!
        const klick: [number, number, number] = [f.positionX, f.positionY + lage.heightM / 2, f.positionZ]
        expect(platzierungAusTreffer(m, 'stair', klick, f.side, f.levelIndex).fieldId, `${f.id} mit Seite/Lage`).toBe(f.id)
        expect(platzierungAusTreffer(m, 'stair', klick, '' as ManualPlacement['side'], -1).fieldId, `${f.id} ohne Seite/Lage`).toBe(f.id)
      }
    })
    it('der Lauf entsteht im getroffenen Feld (Teile liegen innerhalb seiner Länge)', () => {
      const f = felder[Math.floor(felder.length * 0.7)]
      const pl = platzierungAusTreffer(m, 'stair', [f.positionX, f.positionY + 1, f.positionZ], f.side, f.levelIndex)
      const kopie = JSON.parse(JSON.stringify(m))
      const n0 = kopie.components3D.length
      const m2 = addManualPlacement(kopie, { id: 'manual-stair-test', ...pl } as ManualPlacement)
      const neu = m2.components3D.slice(n0).filter((c) => c.id.startsWith('manual-stair-test'))
      expect(neu.length).toBeGreaterThan(5)
      for (const c of neu) expect(Math.hypot(c.position[0] - f.positionX, c.position[2] - f.positionZ), c.id).toBeLessThan(f.lengthM / 2 + f.widthM + 0.1)
    })
    it('Ziehen: eine gesetzte Treppe springt auf ein weit entferntes Feld (andere Seite/Lage)', () => {
      const von = felder[0], nach = felder[felder.length - 1]
      const pl = { id: 'manual-stair-z', ...platzierungAusTreffer(m, 'stair', [von.positionX, von.positionY + 1, von.positionZ], von.side, von.levelIndex) } as ManualPlacement
      const neu = verschiebePlatzierung(m, pl, [nach.positionX, nach.positionY + 1, nach.positionZ], '' as ManualPlacement['side'], -1)
      expect(neu.id).toBe('manual-stair-z')
      expect(neu.fieldId).toBe(nach.id)
    })
  })
}
