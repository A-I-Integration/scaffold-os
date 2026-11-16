// Leiter (Zugang) setzen/ziehen: steht außen am nächsten Feld, parallel zur Fassade, über die Lagenhöhe – auch an Umriss-Kanten.
import { describe, it, expect } from 'vitest'
import { generateCADModel, addManualPlacement, feldRahmen, type BuildingParams, type ManualPlacement } from '@/lib/calculations/cad-engine'
import { platzierungAusTreffer, verschiebePlatzierung } from '@/lib/calculations/cad-platzierung'

const basis = (o: Partial<BuildingParams>) => ({ lengthM: 12, widthM: 9, heightM: 8, floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'flachdach', sides: ['front', 'back', 'left', 'right'], ...o }) as unknown as BuildingParams
const formen: [string, BuildingParams][] = [
  ['Rechteck', basis({})],
  ['Umriss (L-Form)', basis({ umriss: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 6, z: 9 }, { x: 6, z: 12 }, { x: 0, z: 12 }] })],
]
const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

for (const [name, b] of formen) {
  describe(`Leiter – ${name}`, () => {
    const m = generateCADModel(b, 'layher-allround')
    const felder = m.fields.filter((f) => f.levelIndex === 1 && !f.isCorner)
    for (const sicht of ['mit Seite/Lage', 'ohne Seite/Lage'] as const) {
      it(`steht ${sicht} außen am getroffenen Feld, parallel zur Fassade`, () => {
        for (const f of felder) {
          const klick: [number, number, number] = [f.positionX, f.positionY + 1, f.positionZ]
          const pl = platzierungAusTreffer(m, 'ladder', klick, sicht === 'mit Seite/Lage' ? f.side : ('' as ManualPlacement['side']), sicht === 'mit Seite/Lage' ? f.levelIndex : -1)
          expect(pl.fieldId, f.id).toBe(f.id)
          const kopie = JSON.parse(JSON.stringify(m))
          const n0 = kopie.components3D.length
          const c = addManualPlacement(kopie, { id: 'manual-ladder-t', ...pl } as ManualPlacement).components3D.slice(n0).find((x) => x.id === 'manual-ladder-t')!
          // Abstand zur Feldmitte quer zur Fassade = halbe Rahmenbreite + 5 cm, entlang der Fassade in der Feldmitte
          const rf = feldRahmen(f, m.building)
          const [cx, cz] = rf.toLocal(f.positionX, f.positionZ), [lx, lz] = rf.toLocal(c.position[0], c.position[2])
          expect(Math.abs(lx - cx), `${f.id} entlang`).toBeLessThan(0.02)
          expect(lz - cz, `${f.id} quer`).toBeCloseTo((f.widthM || 0.73) / 2 + 0.05, 2)
          // parallel zur Fassade: lokale Drehung der Leiter = Drehung des Feldrahmens (±180°/90° zulässig, die Leiter ist symmetrisch)
          const d = Math.abs(norm(c.rotation[1] - rf.yaw)) % Math.PI
          expect(Math.min(d, Math.PI - d) < 0.01 || Math.abs(d - Math.PI / 2) < 0.01 && (f.side === 'left' || f.side === 'right') && f.kante === undefined, `${f.id} Drehung`).toBe(true)
          // über die ganze Lage
          expect(c.position[1] - c.scale[1] / 2).toBeCloseTo(f.positionY, 2)
        }
      })
    }
    it('Klick am Feldrand: die Leiter bleibt mindestens 25 cm von den Ständern ihres Feldes entfernt', () => {
      for (const f0 of felder) {
        const rf0 = feldRahmen(f0, m.building)
        const [cx0, cz0] = rf0.toLocal(f0.positionX, f0.positionZ)
        const [wx, wz] = rf0.toWorld(cx0 + f0.lengthM / 2 - 0.02, cz0)
        const pl = platzierungAusTreffer(m, 'ladder', [wx, f0.positionY + 1, wz], f0.side, f0.levelIndex)
        const f = m.fields.find((x) => x.id === pl.fieldId)!
        const rf = feldRahmen(f, m.building)
        const [cx] = rf.toLocal(f.positionX, f.positionZ)
        const [lx] = rf.toLocal(pl.positionX, pl.positionZ)
        expect(Math.abs(lx - cx), f.id).toBeLessThanOrEqual(f.lengthM / 2 - 0.25 + 1e-6)
      }
    })
    it('Ziehen: die Leiter wechselt auf ein weit entferntes Feld (andere Seite/Lage)', () => {
      const von = felder[0], nach = felder[felder.length - 1]
      const pl = { id: 'manual-ladder-z', ...platzierungAusTreffer(m, 'ladder', [von.positionX, von.positionY + 1, von.positionZ], von.side, von.levelIndex) } as ManualPlacement
      const neu = verschiebePlatzierung(m, pl, [nach.positionX, nach.positionY + 1, nach.positionZ], '' as ManualPlacement['side'], -1)
      expect(neu.id).toBe('manual-ladder-z')
      expect(neu.fieldId).toBe(nach.id)
    })
  })
}
