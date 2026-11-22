import { describe, it, expect } from 'vitest'
import type { BuildingParams } from '@/lib/calculations/cad-engine'
import { generateCADModel } from '@/lib/calculations/cad-engine'
import { setzeGeschosse, geschossHoehen, traufeAusGeschossen, setzeDach, wandZeilen, setzeWandHoehe, setzeRechteck } from '../gebaeude-bearbeiten'

const rechteck: BuildingParams = { lengthM: 12, widthM: 9, heightM: 9, eavesHeightM: 9, roofHeightM: 0, roofForm: 'flachdach', floors: 3, floorHeightsM: [], windowCount: 4, doorCount: 1, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'] }
const umriss: BuildingParams = { ...rechteck, umriss: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 6 }, { x: 0, z: 6 }] }
const ok = <T,>(r: { ok: boolean; wert?: T; fehler?: string }): T => { if (!r.ok) throw new Error(r.fehler); return r.wert as T }

describe('Geschosse', () => {
  it('Anzahl und Höhen setzen, Summe → Traufe', () => {
    const b = ok(setzeGeschosse(rechteck, 4, [2.5, 2.5, 2.5, 2.5]))
    expect(b.floors).toBe(4); expect(b.floorHeightsM).toEqual([2.5, 2.5, 2.5, 2.5])
    const t = traufeAusGeschossen({ ...b, roofHeightM: 1 })
    expect(t.eavesHeightM).toBe(10); expect(t.heightM).toBe(11)
  })
  it('ohne Höhen: gleichmäßig aus der Traufe', () => {
    expect(geschossHoehen(rechteck)).toEqual([3, 3, 3])
  })
  it('lehnt falsche Eingaben ab', () => {
    expect(setzeGeschosse(rechteck, 0, null).ok).toBe(false)
    expect(setzeGeschosse(rechteck, 2, [2.5]).ok).toBe(false)
    expect(setzeGeschosse(rechteck, 2, [2.5, null]).ok).toBe(false)
    expect(setzeGeschosse(rechteck, 2, [2.5, 9]).ok).toBe(false)
  })
  it('Modell lässt sich damit rechnen', () => {
    const m = generateCADModel(ok(setzeGeschosse(rechteck, 4, [2.5, 2.5, 2.5, 2.5])), 'mj-uniconnect')
    expect(m.levelCount).toBeGreaterThan(0)
  })
})

describe('Dach', () => {
  it('Satteldach: Gebäudehöhe = Traufe + Dachhöhe', () => {
    const b = ok(setzeDach(rechteck, { form: 'satteldach', traufeM: 6, dachHoeheM: 3, ueberstandM: 0.4 }))
    expect(b.roofForm).toBe('satteldach'); expect(b.eavesHeightM).toBe(6); expect(b.roofHeightM).toBe(3); expect(b.heightM).toBe(9); expect(b.overhangM).toBe(0.4)
  })
  it('Pultdach merkt die niedrige Seite', () => {
    const b = ok(setzeDach(rechteck, { form: 'pultdach', traufeM: 5.92, dachHoeheM: 1.02, ueberstandM: 0, pultNiedrigeSeite: 'right' }))
    expect(b.geruestOptionen?.pultNiedrigeSeite).toBe('right'); expect(b.heightM).toBe(6.94)
  })
  it('Flachdach: Dachhöhe 0', () => {
    const b = ok(setzeDach({ ...rechteck, roofForm: 'satteldach', eavesHeightM: 6, roofHeightM: 3 }, { form: 'flachdach', traufeM: 9, dachHoeheM: null, ueberstandM: 0 }))
    expect(b.roofHeightM).toBe(0); expect(b.heightM).toBe(9)
  })
  it('lehnt fehlende Werte ab', () => {
    expect(setzeDach(rechteck, { form: 'satteldach', traufeM: null, dachHoeheM: 3, ueberstandM: 0 }).ok).toBe(false)
    expect(setzeDach(rechteck, { form: 'satteldach', traufeM: 6, dachHoeheM: null, ueberstandM: 0 }).ok).toBe(false)
    expect(setzeDach(rechteck, { form: 'satteldach', traufeM: 6, dachHoeheM: 3, ueberstandM: 5 }).ok).toBe(false)
  })
})

describe('Wände', () => {
  it('Länge je Kante und Höhe', () => {
    const z = wandZeilen(umriss)
    expect(z.map((w) => w.laengeM)).toEqual([10, 6, 10, 6]); expect(z.every((w) => w.hoeheM === 9)).toBe(true)
  })
  it('einzelne Wand niedriger: Einzelhöhen gesetzt, Gebäudehöhe = höchste', () => {
    const b = ok(setzeWandHoehe(umriss, 1, 4))
    expect(b.umrissKantenHoeheM).toEqual([9, 4, 9, 9]); expect(b.heightM).toBe(9)
  })
  it('alle gleich: Einzelangabe entfällt', () => {
    const b1 = ok(setzeWandHoehe(umriss, 0, 7)); const b2 = ok(setzeWandHoehe({ ...b1 }, 1, 7)); const b3 = ok(setzeWandHoehe(b2, 2, 7)); const b4 = ok(setzeWandHoehe(b3, 3, 7))
    expect(b4.umrissKantenHoeheM).toBeUndefined(); expect(b4.heightM).toBe(7)
  })
  it('lehnt ab', () => {
    expect(setzeWandHoehe(umriss, 9, 5).ok).toBe(false); expect(setzeWandHoehe(umriss, 0, null).ok).toBe(false); expect(setzeWandHoehe(umriss, 0, 0.2).ok).toBe(false)
    expect(setzeWandHoehe(rechteck, 0, 5).ok).toBe(false)
  })
  it('Rechteck: Länge, Breite, Höhe', () => {
    const b = ok(setzeRechteck(rechteck, 14, 10, 8))
    expect(b.lengthM).toBe(14); expect(b.widthM).toBe(10); expect(b.heightM).toBe(8); expect(b.eavesHeightM).toBe(8)
    expect(setzeRechteck(umriss, 14, 10, 8).ok).toBe(false); expect(setzeRechteck(rechteck, null, 10, 8).ok).toBe(false)
  })
})
