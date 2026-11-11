import { describe, it, expect } from 'vitest'
import { generateCADModel, generateAnsicht, formatKote, type BuildingParams } from '../cad-engine'

const b = (extra: Partial<BuildingParams> = {}): BuildingParams => ({
  lengthM: 12, widthM: 9, heightM: 9, eavesHeightM: 6, roofHeightM: 0, roofForm: 'satteldach', floors: 3, sides: ['front', 'back', 'left', 'right'], ...extra,
} as BuildingParams)

describe('Ansicht mit Höhenkoten', () => {
  it('formatKote: deutsches Komma, Vorzeichen, ±0,00', () => {
    expect(formatKote(0)).toBe('±0,00'); expect(formatKote(5.7)).toBe('+5,70'); expect(formatKote(-0.45)).toBe('−0,45')
  })
  it('oben ist oben: First liegt über der Traufe (kleineres y)', () => {
    const p = generateAnsicht(generateCADModel(b(), 'layher-allround'), 'right')
    const dach = p.elements.find((e) => e.id === 'building-roof')!
    expect(dach.d).toContain(`${-9}`)
    const kote = p.elements.filter((e) => e.type === 'text').map((e) => e.text)
    expect(kote).toContain('±0,00'); expect(kote).toContain('Traufe +6,00'); expect(kote).toContain('First +9,00')
  })
  it('Beläge tragen Koten; Hang: Geländekote und Fußpunkt der Seite', () => {
    const m = generateCADModel(b({ geruestOptionen: { gelaendeSeiteM: { front: -1.4 } } }), 'layher-allround')
    const p = generateAnsicht(m, 'front')
    const t = p.elements.filter((e) => e.type === 'text').map((e) => e.text)
    expect(t).toContain('Gelände −1,40'); expect(t).toContain('+0,60')
    const felder = p.elements.filter((e) => e.id.startsWith('field-'))
    expect(felder.length).toBeGreaterThan(0)
    expect(Math.max(...felder.map((e) => e.y + (e.height ?? 0)))).toBeCloseTo(1.4, 2) // unterste Kante = Gelände
  })
  it('nur Felder der gewählten Seite', () => {
    const m = generateCADModel(b(), 'layher-allround')
    const n = (sd: 'front' | 'right') => generateAnsicht(m, sd).elements.filter((e) => e.id.startsWith('field-')).length
    expect(n('front')).toBe(m.fields.filter((f) => f.side === 'front').length)
    expect(n('right')).toBe(m.fields.filter((f) => f.side === 'right').length)
  })
})
