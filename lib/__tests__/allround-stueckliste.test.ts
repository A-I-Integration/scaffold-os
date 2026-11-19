import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, type BuildingParams } from '../calculations/cad-engine'
import katalog from '../data/layher-katalog.json'
import { ALLROUND_STIEL, ALLROUND_STIEL_OBEN, ALLROUND_ANFANGSSTUECK, allroundStiele } from '../cad/allround-stueckliste'

const b: BuildingParams = { lengthM: 10, widthM: 8, heightM: 7, eavesHeightM: 7, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [3.5, 3.5], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] }
const q = (l: { articleNumber: string; quantity: number }[], n: string) => l.find((i) => i.articleNumber === n)?.quantity ?? 0

describe('Allround-Stückliste', () => {
  it('Artikel existieren im Katalog', () => {
    for (const n of [ALLROUND_STIEL, ALLROUND_STIEL_OBEN, ALLROUND_ANFANGSSTUECK]) expect((katalog as { n: string; l: string }[]).some((e) => e.n === n && e.l === 'layher-allround')).toBe(true)
  })
  it('ersetzt Rahmen durch Anfangsstück, Stiele und oberen Stiel', () => {
    const m = generateCADModel(b, 'layher-allround')
    const l = generateBillOfMaterials(m)
    const top = Math.max(...m.levels.map((x) => x.index)) + 1
    const saeulen = q(l, ALLROUND_ANFANGSSTUECK)
    expect(saeulen).toBeGreaterThan(0)
    expect(saeulen % 2).toBe(0)
    expect(q(l, ALLROUND_STIEL_OBEN)).toBe(saeulen)
    expect(q(l, ALLROUND_STIEL)).toBe(saeulen * (top - 1))
    expect(l.some((i) => /^RA-\d{3}$/.test(i.articleNumber))).toBe(false)
    expect(allroundStiele(m).anfang).toBe(saeulen)
  })
  it('andere Systeme behalten den Rahmen', () => {
    const l = generateBillOfMaterials(generateCADModel(b, 'mj-uniconnect'))
    expect(l.some((i) => /^RA-\d{3}$/.test(i.articleNumber))).toBe(true)
    expect(q(l, ALLROUND_STIEL)).toBe(0)
  })
})

describe('Allround-Stückliste: Mengenlogik', () => {
  it('mehr Länge bedeutet mehr Stiele; Gewichte kommen aus dem Katalog', () => {
    const klein = generateBillOfMaterials(generateCADModel(b, 'layher-allround'))
    const gross = generateBillOfMaterials(generateCADModel({ ...b, lengthM: 20 }, 'layher-allround'))
    expect(q(gross, ALLROUND_STIEL)).toBeGreaterThan(q(klein, ALLROUND_STIEL))
    expect(klein.find((i) => i.articleNumber === ALLROUND_STIEL)?.weightKg).toBe(9.3)
    expect(klein.find((i) => i.articleNumber === ALLROUND_ANFANGSSTUECK)?.weightKg).toBe(1.4)
  })
})

describe('Allround: Riegel und Diagonalen', () => {
  it('Standardfelder bekommen Katalogartikel nach Feldlänge, Summen bleiben erhalten', () => {
    const m = generateCADModel(b, 'layher-allround')
    const l = generateBillOfMaterials(m)
    const riegel = l.filter((i) => /^2601\./.test(i.articleNumber)).reduce((s, i) => s + i.quantity, 0)
    const dia = l.filter((i) => /^2683\./.test(i.articleNumber)).reduce((s, i) => s + i.quantity, 0)
    const qrAlt = l.filter((i) => i.articleNumber === 'QR-001').reduce((s, i) => s + i.quantity, 0)
    const diAlt = l.filter((i) => /^DI-/.test(i.articleNumber)).reduce((s, i) => s + i.quantity, 0)
    expect(riegel).toBeGreaterThan(0)
    expect(dia).toBeGreaterThan(0)
    expect(riegel + qrAlt).toBe(m.components3D.filter((c) => c.articleNumber === 'QR-001').length)
    expect(dia + diAlt).toBe(m.components3D.filter((c) => /^DI-/.test(c.articleNumber)).length)
    for (const i of l.filter((x) => /^(2601|2683)\./.test(x.articleNumber))) expect((katalog as { n: string }[]).some((e) => e.n === i.articleNumber)).toBe(true)
  })
})
