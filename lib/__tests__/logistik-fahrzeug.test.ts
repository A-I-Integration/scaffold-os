import { describe, it, expect } from 'vitest'
import { fahrzeugeAus, waehleFahrzeug } from '../logistik-fahrzeug'
import { generateCADModel, calculateLogistics, type BuildingParams } from '../calculations/cad-engine'
import { rechteckUmriss } from '../calculations/cad-umriss'
import type { MaterialItem } from '@/types/scaffold'

const fz = fahrzeugeAus([
  { id: 'a', name: 'Sprinter', capacity_kg: 1000, license_plate: 'X-1' },
  { id: 'b', name: 'LKW 12 t', capacity_kg: 7000 },
  { id: 'c', name: 'ohne Angabe', capacity_kg: 0 },
  { id: 'd', name: 'LKW 7,5 t', capacity_kg: 3500 },
  { name: 'ohne id', capacity_kg: 100 },
])

describe('Logistik-Fahrzeuge', () => {
  it('liest nur Fahrzeuge mit Nutzlast', () => {
    expect(fz.map((f) => f.id)).toEqual(['a', 'b', 'd'])
    expect(fahrzeugeAus(null)).toEqual([])
  })
  it('automatisch: wenigste Fahrten, bei Gleichstand kleinere Nutzlast', () => {
    expect(waehleFahrzeug(fz, 20000, 'auto')?.id).toBe('b')
    expect(waehleFahrzeug(fz, 900, 'auto')?.id).toBe('a')
    expect(waehleFahrzeug(fz, 3000, 'auto')?.id).toBe('d')
  })
  it('feste Wahl, Standard und unbekannte ID', () => {
    expect(waehleFahrzeug(fz, 1000, 'd')?.id).toBe('d')
    expect(waehleFahrzeug(fz, 1000, 'standard')).toBeNull()
    expect(waehleFahrzeug(fz, 1000, 'gibt-es-nicht')).toBeNull()
    expect(waehleFahrzeug([], 1000, 'auto')).toBeNull()
  })
  it('Fahrten richten sich nach der Nutzlast des Fahrzeugs', () => {
    const b: BuildingParams = { lengthM: 10, widthM: 8, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach', floors: 4, floorHeightsM: [3, 3, 3, 3], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'], umriss: rechteckUmriss(10, 8) }
    const model = generateCADModel(b, 'layher-allround')
    const mat = [{ articleNumber: 'X', name: 'x', quantity: 10, weightKg: 1000, unitPrice: 0, totalPrice: 0 }] as unknown as MaterialItem[]
    expect(calculateLogistics(model, mat).lkwFahrten).toBe(3)
    expect(calculateLogistics(model, mat, 2, { name: 'LKW 12 t', nutzlastKg: 7000 }).lkwFahrten).toBe(2)
    const l = calculateLogistics(model, mat, 2, { name: 'LKW 12 t', nutzlastKg: 7000 })
    expect(l.fahrzeugName).toBe('LKW 12 t')
    expect(l.nutzlastKg).toBe(7000)
    expect(calculateLogistics(model, mat).fahrzeugName).toBeUndefined()
  })
})
