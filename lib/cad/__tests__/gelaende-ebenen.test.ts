import { describe, it, expect } from 'vitest'
import { ebenenZuProfil, ebeneHoeheAn, pruefeEbene, type GelaendeEbene } from '../gelaende-ebenen'
import { Terrain } from '@/lib/calculations/gelaende'
import { generateCADModel, gelaendeHoeheFn, type BuildingParams } from '@/lib/calculations/cad-engine'

const haus = (profil?: any): BuildingParams => ({
  lengthM: 12, widthM: 8, heightM: 6.5, eavesHeightM: 6, roofHeightM: 0.5, roofForm: 'flachdach',
  floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0,
  sides: ['front', 'back', 'left', 'right'],
  geruestOptionen: profil ? { gelaendeProfilM: profil } : undefined,
})
// Rechte Gebäudehälfte (x ab 0) liegt 1 m tiefer
const tiefRechts: GelaendeEbene = { id: 'a', name: 'Hof', x0: 0, x1: 30, z0: -30, z1: 30, hoeheM: -1 }

describe('Geländeebenen → Profil', () => {
  it('ohne Flächen: kein Profil (nichts ändert sich)', () => {
    expect(ebenenZuProfil([], { lengthM: 12, widthM: 8 })).toEqual({})
  })
  it('Stufe in der Mitte der Vorderseite mit Böschung 0,5 m', () => {
    const p = ebenenZuProfil([tiefRechts], { lengthM: 12, widthM: 8 })
    expect(p.front).toEqual([{ posM: 0, hoeheM: 0 }, { posM: 5.75, hoeheM: 0 }, { posM: 6.25, hoeheM: -1 }, { posM: 12, hoeheM: -1 }])
    expect(p.back).toEqual(p.front)
    // Links liegt komplett im hohen Bereich (±0), rechts komplett im tiefen
    expect(p.left).toBeUndefined()
    expect(p.right).toEqual([{ posM: 0, hoeheM: -1 }, { posM: 8, hoeheM: -1 }])
  })
  it('das Profil ist für die Engine gültig und liefert die Höhen der Flächen', () => {
    const t = new Terrain(ebenenZuProfil([tiefRechts], { lengthM: 12, widthM: 8 }))
    expect(t.heightAt('front', 2)).toBeCloseTo(0, 3)
    expect(t.heightAt('front', 10)).toBeCloseTo(-1, 3)
    expect(t.heightAt('front', 6)).toBeCloseTo(-0.5, 3)
  })
  it('spätere Fläche überdeckt frühere; Basis gilt außerhalb', () => {
    const e: GelaendeEbene[] = [tiefRechts, { id: 'b', name: 'Beet', x0: 3, x1: 9, z0: 4, z1: 8, hoeheM: 0.4 }]
    expect(ebeneHoeheAn(e, 5, 5)).toBe(0.4)
    expect(ebeneHoeheAn(e, -1, 0)).toBe(0)
    expect(ebeneHoeheAn(e, 10, 0)).toBe(-1)
    expect(ebeneHoeheAn(e, -5, 0, -2)).toBe(-2)
  })
  it('schmale Ebene: Böschung wird gekürzt, Punkte bleiben geordnet', () => {
    const p = ebenenZuProfil([{ id: 'c', name: 'Stufe', x0: 5, x1: 5.3, z0: -30, z1: 30, hoeheM: -0.6 }], { lengthM: 12, widthM: 8 }, { boeschungM: 2 })
    const pos = p.front!.map((q) => q.posM)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    expect(Math.min(...p.front!.map((q) => q.hoeheM))).toBeCloseTo(-0.6, 3)
  })
  it('ungültige Ebenen werden geprüft und nicht verwendet', () => {
    const bad: GelaendeEbene = { id: 'x', name: '', x0: 0, x1: 0.01, z0: 0, z1: 5, hoeheM: 1 }
    expect(pruefeEbene(bad)).toMatch(/schmal/)
    expect(pruefeEbene({ ...tiefRechts, hoeheM: 20 })).toMatch(/15/)
    expect(pruefeEbene({ ...tiefRechts, hoeheM: NaN })).toMatch(/Zahlen/)
    expect(ebenenZuProfil([bad], { lengthM: 12, widthM: 8 })).toEqual({})
  })
})

describe('Geländeebenen in Gerüst und 3D-Fläche', () => {
  const profil = ebenenZuProfil([tiefRechts], { lengthM: 12, widthM: 8 })
  it('3D-Fläche folgt der Stufe an der Vorderseite (x = −4 hoch, x = +4 tief)', () => {
    const f = gelaendeHoeheFn(haus(profil))
    expect(f(-4, 4)).toBeCloseTo(0, 1)
    expect(f(4, 4)).toBeCloseTo(-1, 1)
  })
  it('Gerüst gründet je Seite auf der Stufe: rechte Seite tiefer als linke, keine Schwebe-Warnung', () => {
    const m = generateCADModel(haus(profil), 'layher-allround')
    expect(m.warnings.some((w) => w.code === 'HANG_FUSS_SCHWEBT')).toBe(false)
    // Unterstes Feld je Spalte: Fußhöhe = Belaghöhe minus Ausgleichsstiel minus Spindel
    const front = m.fields.filter((f) => f.side === 'front')
    const fussJeSpalte = [...new Set(front.map((f) => f.index))].map((i) => {
      const unten = front.filter((f) => f.index === i).sort((x, y) => x.positionY - y.positionY)[0]
      return { x: unten.positionX, fuss: unten.positionY - ((unten.fuss?.stielM ?? 0) + (unten.fuss?.spindelM ?? 0)) }
    })
    const links = fussJeSpalte.filter((c) => c.x < -2), rechts = fussJeSpalte.filter((c) => c.x > 4)
    expect(links.length).toBeGreaterThan(0); expect(rechts.length).toBeGreaterThan(0)
    for (const c of links) expect(c.fuss).toBeCloseTo(0, 1)
    for (const c of rechts) expect(c.fuss).toBeCloseTo(-1, 1)
  })
  it('ohne Ebenen bleibt das Modell gleich (keine Veränderung am Bestand)', () => {
    const a = generateCADModel(haus(), 'layher-allround')
    const b = generateCADModel({ ...haus(), geruestOptionen: { gelaendeEbenen: [] } } as BuildingParams, 'layher-allround')
    expect(b.components3D.length).toBe(a.components3D.length)
    expect(b.fieldCount).toBe(a.fieldCount)
  })
})
