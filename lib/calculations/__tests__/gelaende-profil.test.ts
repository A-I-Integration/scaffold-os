import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { Terrain, parseGelaendeLinie, formatGelaendeLinie } from '@/lib/calculations/gelaende'

describe('Terrain / Geländelinie', () => {
  it('interpoliert linear und hält die Enden', () => {
    const t = new Terrain({ back: [{ posM: 0, hoeheM: 1.55 }, { posM: 10, hoeheM: -0.5 }, { posM: 13.8, hoeheM: -2.55 }] })
    expect(t.heightAt('back', 0)).toBeCloseTo(1.55, 3)
    expect(t.heightAt('back', 5)).toBeCloseTo(0.525, 3)
    expect(t.heightAt('back', 12)).toBeCloseTo(-1.579, 2)
    expect(t.heightAt('back', 20)).toBeCloseTo(-2.55, 3)
    expect(t.heightAt('front', 3)).toBeUndefined()
  })
  it('liest die Texteingabe (Komma/Semikolon, Dezimalkomma)', () => {
    expect(parseGelaendeLinie('0:+1.55, 6:-0.20, 13.8:-2.55')).toEqual([{ posM: 0, hoeheM: 1.55 }, { posM: 6, hoeheM: -0.2 }, { posM: 13.8, hoeheM: -2.55 }])
    expect(parseGelaendeLinie('0:+1,55; 6:-0,20; 13,8:-2,55')?.length).toBe(3)
    expect(parseGelaendeLinie('Quatsch')).toBeNull()
    expect(parseGelaendeLinie('0:1')).toBeNull()
    expect(formatGelaendeLinie(parseGelaendeLinie('0:1.5; 5:-2')!)).toBe('0:+1,5; 5:-2')
  })
})

const haus = (): BuildingParams => ({
  lengthM: 13.79, widthM: 10.68, heightM: 6.94, eavesHeightM: 5.92, roofHeightM: 1.02, roofForm: 'satteldach',
  floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0,
  sides: ['front', 'back', 'left', 'right'],
  geruestOptionen: { gelaendeProfilM: { back: [{ posM: 0, hoeheM: 1.55 }, { posM: 13.79, hoeheM: -2.55 }], front: [{ posM: 0, hoeheM: 1.5 }, { posM: 13.79, hoeheM: -0.1 }] } },
})

describe('Gerüst gründet je Feld auf der Geländelinie', () => {
  const m = generateCADModel(haus(), 'layher-allround')
  it('keine Schwebe-Warnung, Hang bildet sich ab: tiefes Ende steht mindestens 3 m tiefer als das hohe', () => {
    expect(m.warnings.some((w) => w.code === 'HANG_FUSS_SCHWEBT')).toBe(false)
    const back = m.fields.filter((f) => f.side === 'back')
    const fuss = (f: (typeof back)[number]) => f.positionY - ((f.fuss?.stielM ?? 0) + (f.fuss?.spindelM ?? 0))
    const tief = Math.min(...back.map(fuss)), hoch = Math.max(...back.filter((f) => f.levelIndex === 0 || f.fuss).map(fuss))
    expect(hoch - tief).toBeGreaterThan(3)
    expect(tief).toBeLessThan(-2.0)
  })
  it('Oberkante Belag liegt auf allen Seiten gleich (Traufe + 1,0 m)', () => {
    const top = (sd: string) => Math.max(...m.fields.filter((f) => f.side === sd).map((f) => f.positionY + 2))
    expect(Math.abs(top('back') - top('front'))).toBeLessThan(0.01)
  })
})
