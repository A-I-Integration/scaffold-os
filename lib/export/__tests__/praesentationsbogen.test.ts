import { describe, it, expect } from 'vitest'
import { erzeugePraesentationsbogen, bogenTafeln } from '@/lib/export/praesentationsbogen-pdf'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'

const bau = (extra: object = {}) => ({ lengthM: 13.8, widthM: 8.85, heightM: 6.94, eavesHeightM: 5.92, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'pultdach', sides: ['front', 'back', 'left', 'right'], geruestOptionen: { treppe: true }, ...extra }) as unknown as BuildingParams
const model = generateCADModel(bau(), 'layher-allround')
const text = (u: Uint8Array) => Buffer.from(u).toString('latin1')

describe('Präsentationsbogen', () => {
  it('erzeugt genau eine A3-Seite (quer) als gültiges PDF', () => {
    const pdf = erzeugePraesentationsbogen(model, { projektName: 'EFH Test', datum: '16.11.2026' })
    expect(text(pdf).startsWith('%PDF')).toBe(true)
    expect((text(pdf).match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1)
    expect(text(pdf)).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+1190\.\d+\s+841\.\d+\s*\]/)
  })
  it('Datentafeln enthalten nur Modellwerte: Maße, Höhe, Traufe, Dachform, Lagen, Felder, Treppe', () => {
    const t = bogenTafeln(model)
    const alle = t.flatMap((x) => x.zeilen)
    const w = (l: string) => alle.find((z) => z.label === l)?.wert
    expect(w('Länge')).toBe('13,80 m'); expect(w('Gebäudehöhe')).toBe('6,94 m'); expect(w('Traufhöhe')).toBe('5,92 m'); expect(w('Dachform')).toBe('Pultdach')
    expect(w('Lagen')).toBe(String(model.levelCount)); expect(w('Felder je Lage')).toBe(String(model.fieldCount)); expect(w('Treppe')).toBe('vorhanden')
  })
  it('lässt fehlende Angaben weg statt sie zu erfinden (keine Traufe, keine Treppe)', () => {
    const m = generateCADModel(bau({ eavesHeightM: 0, geruestOptionen: { treppe: false } }), 'layher-allround')
    const alle = bogenTafeln(m).flatMap((x) => x.zeilen)
    expect(alle.some((z) => z.label === 'Traufhöhe')).toBe(false)
    expect(alle.find((z) => z.label === 'Treppe')?.wert).toBe('keine')
  })
  it('funktioniert auch mit Umriss und ohne 3D-Bild; ein ungültiges Bild bricht nicht ab', () => {
    const rect = [{ x: 0, z: 0 }, { x: 13.8, z: 0 }, { x: 13.8, z: 8.85 }, { x: 0, z: 8.85 }]
    const m = generateCADModel(bau({ umriss: rect }), 'layher-allround')
    expect(erzeugePraesentationsbogen(m, { projektName: 'U' }).length).toBeGreaterThan(1000)
    expect(erzeugePraesentationsbogen(m, { projektName: 'U' }, 'data:image/png;base64,AAAA').length).toBeGreaterThan(1000)
  })
})
