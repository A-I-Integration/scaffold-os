import { describe, it, expect } from 'vitest'
import { generateCADModel, addManualPlacement, type BuildingParams, type ManualPlacement } from '@/lib/calculations/cad-engine'
import { treppenReihen, treppeAufFeld, schiebeUmFelder } from '@/lib/cad/treppe-setzen'

const L = 13.8, W = 8.85
const lform = [{ x: 0, z: 0 }, { x: L, z: 0 }, { x: L, z: W }, { x: L * 0.6, z: W }, { x: L * 0.6, z: W + 2 }, { x: L * 0.3, z: W + 2 }, { x: L * 0.3, z: W }, { x: 0, z: W }]
const bau = (extra: object = {}) => ({ lengthM: L, widthM: W, heightM: 6.94, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'satteldach', sides: ['front', 'back', 'left', 'right'], geruestOptionen: { treppe: false }, ...extra }) as unknown as BuildingParams

for (const [name, extra] of [['Rechteck', {}], ['L-Form-Umriss', { umriss: lform }], ['Hang', { geruestOptionen: { treppe: false, gelaendeEckenM: { fl: 0, fr: 0, bl: -2.4, br: -2.4 } } }]] as [string, object][]) {
  describe(`Treppe über Auswahl – ${name}`, () => {
    const m = generateCADModel(bau(extra), 'layher-allround')
    const reihen = treppenReihen(m)
    it('bietet jede Seite/Kante mit ihren Feldern der untersten Lage an', () => {
      expect(reihen.length).toBeGreaterThanOrEqual(4)
      for (const r of reihen) {
        expect(r.felder.length).toBeGreaterThan(0)
        expect(new Set(r.felder.map((f) => f.levelIndex)).size).toBe(1)
        expect(r.felder.map((f) => f.index)).toEqual([...r.felder.map((f) => f.index)].sort((a, b) => a - b))
        expect(r.bezeichnung).toMatch(/^(Vorderseite|Rückseite|Links|Rechts|Kante \d+)$/)
      }
    })
    it('Treppe steht genau auf dem gewählten Feld jeder Reihe (vom Boden bis oben)', () => {
      for (const r of reihen) for (const f of r.felder.slice(0, 3)) {
        const p = treppeAufFeld(m, f)
        expect(p.type).toBe('stair'); expect(p.fieldId).toBe(f.id)
        const m2 = addManualPlacement(JSON.parse(JSON.stringify(m)), { id: 'manual-t', ...p } as ManualPlacement)
        const teile = m2.components3D.filter((c) => c.id === 'manual-t' || c.id.startsWith('manual-t-'))
        expect(teile.length, `${r.bezeichnung} Feld ${f.index}`).toBeGreaterThan(5)
        const haupt = teile.find((c) => c.id === 'manual-t')!
        expect(Math.hypot(haupt.position[0] - f.positionX, haupt.position[2] - f.positionZ)).toBeLessThan(f.lengthM + 1.5)
      }
    })
    it('Schieben um ein Feld bleibt auf derselben Seite, wandert genau ein Feld weiter und kommt am Ende zum Stehen', () => {
      const r = reihen.find((x) => x.felder.length >= 3)!
      let p = { id: 'manual-t', ...treppeAufFeld(m, r.felder[0]) } as ManualPlacement
      for (let i = 1; i < r.felder.length; i++) {
        const e = schiebeUmFelder(m, p, 1)
        expect(e.placement, `Schritt ${i}`).toBeTruthy()
        p = e.placement!
        expect(p.fieldId).toBe(r.felder[i].id)
        expect(p.id).toBe('manual-t')
      }
      const ende = schiebeUmFelder(m, p, 1)
      expect(ende.placement).toBeNull(); expect(ende.grund).toMatch(/Ende/)
      const zurueck = schiebeUmFelder(m, p, -1)
      expect(zurueck.placement!.fieldId).toBe(r.felder[r.felder.length - 2].id)
      const anfang = schiebeUmFelder(m, { id: 'manual-t', ...treppeAufFeld(m, r.felder[0]) } as ManualPlacement, -1)
      expect(anfang.placement).toBeNull(); expect(anfang.grund).toMatch(/Anfang/)
    })
    it('Treppe ohne Feld meldet das, statt etwas zu setzen', () => {
      const e = schiebeUmFelder(m, { id: 'x', type: 'stair', positionX: 0, positionY: 0, positionZ: 0, side: 'front', levelIndex: 0 } as ManualPlacement, 1)
      expect(e.placement).toBeNull(); expect(e.grund).toMatch(/Feld/)
    })
  })
}

describe('Leiter über Auswahl', () => {
  it('steht an genau dem gewählten Feld und in der gewählten Lage, außen am Feld', async () => {
    const { generateCADModel } = await import('@/lib/calculations/cad-engine')
    const { leiterAufFeld, lagenVon } = await import('@/lib/cad/treppe-setzen')
    const m = generateCADModel({ lengthM: 13.8, widthM: 8.85, heightM: 6.94, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'satteldach', sides: ['front', 'back', 'left', 'right'], geruestOptionen: { treppe: false } } as never, 'layher-allround')
    const lagen = lagenVon(m)
    expect(lagen.length).toBeGreaterThan(1)
    for (const f of m.fields.filter((x) => !x.isCorner && x.levelIndex === 0)) {
      for (const lv of lagen) {
        const e = leiterAufFeld(m, f, lv)
        expect(e.placement).not.toBeNull()
        const ziel = m.fields.find((x) => x.side === f.side && x.index === f.index && x.levelIndex === lv)!
        expect(e.placement!.fieldId).toBe(ziel.id)
        expect(e.placement!.levelIndex).toBe(lv)
        expect(e.placement!.type).toBe('ladder')
        // liegt in der Höhe der gewählten Lage, nicht darunter oder darüber
        expect(Math.abs(e.placement!.positionY - (ziel.positionY + 1))).toBeLessThan(0.6)
      }
    }
  })
  it('meldet es, wenn es in der Lage kein Feld gibt', async () => {
    const { leiterAufFeld } = await import('@/lib/cad/treppe-setzen')
    const f = { id: 'a', side: 'front', index: 1, levelIndex: 0, positionX: 0, positionY: 0, positionZ: 0, lengthM: 2, widthM: 0.7 } as never
    const e = leiterAufFeld({ fields: [f] } as never, f, 5)
    expect(e.placement).toBeNull()
    expect(e.grund).toMatch(/kein Feld/)
  })
})
