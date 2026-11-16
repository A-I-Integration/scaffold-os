// Umriss-Modus: bei geneigtem Dach endet das Gerüst wie im Rechteck-Modus an der Rinne (oberster Belag höchstens 1 m über der Traufe), nicht an der First-Höhe.
import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'

const rect = [{ x: 0, z: 0 }, { x: 13.8, z: 0 }, { x: 13.8, z: 8.85 }, { x: 0, z: 8.85 }]
const lform = [{ x: 0, z: 0 }, { x: 13.8, z: 0 }, { x: 13.8, z: 8.85 }, { x: 8.28, z: 8.85 }, { x: 8.28, z: 10.85 }, { x: 4.14, z: 10.85 }, { x: 4.14, z: 8.85 }, { x: 0, z: 8.85 }]
const bau = (extra: object) => ({ lengthM: 13.8, widthM: 8.85, heightM: 6.94, eavesHeightM: 5.92, floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'pultdach', sides: ['front', 'back', 'left', 'right'], geruestOptionen: { treppe: true }, ...extra }) as unknown as BuildingParams
const lagen = (b: BuildingParams) => generateCADModel(b, 'layher-allround').levelCount
const obersterBelag = (b: BuildingParams) => { const m = generateCADModel(b, 'layher-allround'); return Math.max(...m.levels.map((l) => l.topY)) }

describe('Umriss und Rinnen-Regel', () => {
  it('Pultdach: Umriss hat dieselbe Lagenzahl wie das Rechteck (3, nicht 4)', () => {
    expect(lagen(bau({}))).toBe(3)
    expect(lagen(bau({ umriss: rect }))).toBe(3)
    expect(lagen(bau({ umriss: lform }))).toBe(3)
  })
  it('oberster Belag liegt höchstens 1 m über der Traufe', () => {
    expect(obersterBelag(bau({ umriss: rect }))).toBeLessThanOrEqual(5.92 + 1 + 1e-6)
  })
  it('Walm- und Mansardendach genauso', () => {
    for (const roofForm of ['walmdach', 'mansardendach']) expect(lagen(bau({ roofForm, umriss: rect }))).toBe(lagen(bau({ roofForm })))
  })
  it('Flachdach, fehlende Traufe und eigene Kantenhöhen bleiben wie bisher (bis zur Gebäudehöhe)', () => {
    expect(lagen(bau({ roofForm: 'flachdach', umriss: rect }))).toBe(4)
    expect(lagen(bau({ eavesHeightM: 0, umriss: rect }))).toBe(4)
    expect(lagen(bau({ umriss: rect, umrissKantenHoeheM: [6.94, 6.94, 6.94, 6.94] }))).toBe(4)
  })
  it('meldet die Rinnen-Regel', () => {
    expect(generateCADModel(bau({ umriss: rect }), 'layher-allround').warnings.some((w) => w.code === 'OBERSTER_BELAG_RINNE')).toBe(true)
  })
  it('die automatische Treppe steht weiterhin und reicht bis zur obersten Lage', () => {
    const m = generateCADModel(bau({ umriss: rect }), 'layher-allround')
    expect(m.components3D.some((c) => c.type === 'stair')).toBe(true)
  })
})
