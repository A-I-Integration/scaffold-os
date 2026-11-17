import { describe, it, expect } from 'vitest'
import { generateCADModel, generateScaffoldComponents, type BuildingParams } from '@/lib/calculations/cad-engine'

const haus = (opt: any = {}): BuildingParams => ({
  lengthM: 12.42, widthM: 8, heightM: 6.5, eavesHeightM: 6, roofHeightM: 0.5, roofForm: 'flachdach',
  floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0,
  sides: ['front', 'back', 'left', 'right'], geruestOptionen: { ...opt },
} as any)
const bauen = (opt?: any) => { const m = generateCADModel(haus(opt), 'layher-allround'); return { m, c: generateScaffoldComponents(m) } }

describe('Treppe im Gerüstfeld (Option)', () => {
  it('Standard bleibt: Treppe vor dem Gerüst, Belag aller Felder vorhanden', () => {
    const a = bauen(), b = bauen({ treppeImFeld: false })
    expect(b.c.length).toBe(a.c.length)
    expect(a.m.warnings.some((w) => w.code === 'TREPPE_AUSSEN')).toBe(true)
    expect(a.m.warnings.some((w) => w.code === 'TREPPE_IM_FELD')).toBe(false)
  })
  const vor = bauen(), im = bauen({ treppeImFeld: true })
  it('im Feld: Warnhinweis statt Außentreppe, Treppe liegt innerhalb der Gerüsttiefe', () => {
    expect(im.m.warnings.some((w) => w.code === 'TREPPE_IM_FELD')).toBe(true)
    const rahmen = im.c.find((c) => c.id === 'stair-frame-0')!
    const feld = im.m.fields.find((f) => f.side === 'front')!
    const vorRahmen = vor.c.find((c) => c.id === 'stair-frame-0')!
    // Mitte der Treppe liegt im Feld, nicht davor: näher an der Wand als bei der Außentreppe
    expect(Math.abs(rahmen.position[2] - feld.positionZ)).toBeLessThan(Math.abs(vorRahmen.position[2] - feld.positionZ))
  })
  it('im Feld: Belag des Treppenfelds entfällt auf den durchlaufenen Lagen, alle anderen Felder behalten ihn', () => {
    const decks = (c: typeof im.c) => c.filter((x) => x.type === 'deck' && x.id.startsWith('deck-'))
    expect(decks(im.c).length).toBeLessThan(decks(vor.c).length)
    const weg = decks(vor.c).length - decks(im.c).length
    // genau ein Belag je durchlaufener Lage
    expect(weg).toBe(im.c.filter((c) => /^stair-podest-[rl]\d$/.test(c.id)).length)
    expect(weg).toBeGreaterThanOrEqual(2)
  })
  it('im Feld: keine eigenen Treppenpfosten und Treppenfüße', () => {
    expect(im.c.some((c) => /^stair-(pfosten|fuss|ausgleich)/.test(c.id))).toBe(false)
    expect(vor.c.some((c) => /^stair-pfosten/.test(c.id))).toBe(true)
  })
  it('im Feld: Podeste liegen je Lage auf Belaghöhe (≤ 1 cm)', () => {
    const podeste = im.c.filter((c) => /^stair-podest-[rl]\d$/.test(c.id))
    expect(podeste.length).toBeGreaterThanOrEqual(2)
    for (const p of podeste) {
      const lagen = im.m.levels.map((l: any) => l.topY)
      expect(Math.min(...lagen.map((y: number) => Math.abs(y - (p.position[1] + 0.01))))).toBeLessThan(0.01)
    }
  })
  it('im Feld: Stückliste bleibt Bauteil für Bauteil gleich der Modell-Liste (keine Geisterteile)', () => {
    const ids = new Set(im.c.map((c) => c.id))
    expect(ids.size).toBe(im.c.length)
  })
})
