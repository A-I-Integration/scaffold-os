import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { erzeugeGeruestplanPdf, pfadPunkte, waehleMassstab } from '../geruestplan-pdf'

const haus = (extra: Partial<BuildingParams> = {}) => generateCADModel({ lengthM: 12, widthM: 9, heightM: 9, eavesHeightM: 6, roofHeightM: 3, roofForm: 'satteldach', floors: 3, sides: ['front', 'back', 'left', 'right'], ...extra } as BuildingParams, 'layher-allround')

describe('Gerüstplan-PDF', () => {
  it('pfadPunkte zerlegt M/L/Z-Pfade', () => {
    const r = pfadPunkte('M 0,-6 L 6,-9 L 12,-6 Z')
    expect(r).toHaveLength(1)
    expect(r[0].geschlossen).toBe(true)
    expect(r[0].punkte).toEqual([[0, -6], [6, -9], [12, -6]])
  })
  it('wählt den kleinsten passenden Normmaßstab', () => {
    expect(waehleMassstab(10, 5, 270, 180)).toBe(50) // 10 m bei 1:50 = 200 mm
    expect(waehleMassstab(100, 5, 270, 180)).toBe(400)
  })
  it('erzeugt ein PDF mit 6 Seiten', () => {
    const pdf = erzeugeGeruestplanPdf(haus({ geruestOptionen: { gelaendeSeiteM: { front: -1.4 } } }), { projektName: 'Test', objektadresse: 'Teststr. 1' })
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
    const text = new TextDecoder('latin1').decode(pdf)
    expect((text.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(6)
  })
  it('funktioniert auch beim Umriss und ohne System-Fehler', () => {
    const m = haus({ umriss: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 0, z: 9 }] })
    expect(erzeugeGeruestplanPdf(m, { projektName: 'U' }).length).toBeGreaterThan(1000)
  })
})

describe('Gerüstplan-PDF: Details', () => {
  it('pdfText behält das Minuszeichen (Gelände −1,40)', async () => {
    const { pdfText } = await import('../lastannahmen-pdf')
    expect(pdfText('Gelände −1,40')).toBe('Gelände -1,40')
  })
  it('Grenzen ohne Teileliste sind kleiner als der ViewBox der Ansicht', async () => {
    const { generateAnsicht } = await import('@/lib/calculations/cad-engine')
    const { zeichnungsGrenzen } = await import('../geruestplan-pdf')
    const p = generateAnsicht(haus(), 'front')
    const g = zeichnungsGrenzen(p)
    expect(g.maxX - g.minX).toBeLessThan(p.viewBox.width * 0.6)
  })
})
