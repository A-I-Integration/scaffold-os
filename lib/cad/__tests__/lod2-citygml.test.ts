import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { leseLod2Gebaeude, findeGebaeudeAmPunkt, lod2ZuBaukoerper, lod2KachelNrw, utm32AusWgs84 } from '../lod2-citygml'

const ring = (pts: number[][]) => [...pts, pts[0]].map(p => p.join(' ')).join(' ')
const flaeche = (tag: string, pts: number[][]) =>
  `<bldg:boundedBy><bldg:${tag}><bldg:lod2MultiSurface><gml:MultiSurface><gml:surfaceMember><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList srsDimension="3">${ring(pts)}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember></gml:MultiSurface></bldg:lod2MultiSurface></bldg:${tag}></bldg:boundedBy>`

// Satteldach-Haus 20 × 10 m, Boden 100 m, Traufe 105 m, First 108 m, First längs Ost (x)
function haus(id: string, x0: number, y0: number, drehGrad = 0, mitDach = true): string {
  const c = Math.cos((drehGrad * Math.PI) / 180), s = Math.sin((drehGrad * Math.PI) / 180)
  const P = (x: number, y: number, z: number) => [x0 + x * c - y * s, y0 + x * s + y * c, z]
  const boden = flaeche('GroundSurface', [P(0, 0, 100), P(0, 10, 100), P(20, 10, 100), P(20, 0, 100)])
  const dach = mitDach
    ? flaeche('RoofSurface', [P(0, 0, 105), P(20, 0, 105), P(20, 5, 108), P(0, 5, 108)])
      + flaeche('RoofSurface', [P(0, 10, 105), P(0, 5, 108), P(20, 5, 108), P(20, 10, 105)])
    : ''
  return `<core:cityObjectMember><bldg:Building gml:id="${id}"><bldg:function>31001_1000</bldg:function>${dach}${boden}</bldg:Building></core:cityObjectMember>`
}
const doc = (...h: string[]) => `<?xml version="1.0"?><core:CityModel>${h.join('')}</core:CityModel>`

describe('LoD2-CityGML einlesen', () => {
  it('erkennt Satteldach, Traufe, First und Maße', () => {
    const [g] = leseLod2Gebaeude(doc(haus('A', 1000, 2000)))
    expect(g.dachForm).toBe('satteldach')
    expect(g.traufeZ - g.bodenZ).toBeCloseTo(5, 1)
    expect(g.firstZ - g.bodenZ).toBeCloseTo(8, 1)
    expect(g.laengeM).toBeCloseTo(20, 1)
    expect(g.tiefeM).toBeCloseTo(10, 1)
    expect(g.grundflaecheM2).toBeCloseTo(200, 0)
  })

  it('liefert den First auch bei gedrehtem Haus längs der langen Seite', () => {
    const [g] = leseLod2Gebaeude(doc(haus('B', 1000, 2000, 33)))
    expect(g.laengeM).toBeCloseTo(20, 1)
    expect(g.tiefeM).toBeCloseTo(10, 1)
    const e = lod2ZuBaukoerper(g)
    expect(e.teile[0].dachForm).toBe('satteldach')
    expect(e.teile[0].hoeheM).toBeCloseTo(5, 1)
    expect(e.teile[0].dachHoeheM).toBeCloseTo(3, 1)
    expect(e.gesamtHoeheM).toBeCloseTo(8, 1)
  })

  it('findet das Gebäude am Punkt und ignoriert Gebäude ohne Dach', () => {
    const x = doc(haus('A', 1000, 2000), haus('C', 1100, 2000), haus('D', 1200, 2000, 0, false))
    const liste = leseLod2Gebaeude(x)
    expect(liste.map(g => g.id)).toEqual(['A', 'C'])
    expect(findeGebaeudeAmPunkt(liste, 1105, 2005)?.id).toBe('C')
    expect(findeGebaeudeAmPunkt(liste, 5000, 5000)).toBeNull()
  })

  it('beschränkt auf einen Suchbereich', () => {
    const x = doc(haus('A', 1000, 2000), haus('C', 1100, 2000))
    expect(leseLod2Gebaeude(x, { ost: 1005, nord: 2005, radiusM: 20 }).map(g => g.id)).toEqual(['A'])
  })

  it('rechnet WGS84 in UTM und den NRW-Kachelnamen um (CityKirche Elberfeld)', () => {
    const { ost, nord } = utm32AusWgs84(51.2567078, 7.1474596)
    expect(ost).toBeCloseTo(370731, -1)
    expect(nord).toBeCloseTo(5680003, -1)
    expect(lod2KachelNrw(ost, nord)).toBe('LoD2_32_370_5680_1_NW.gml')
  })

  const kachel5679 = process.env.LOD2_KACHEL_370_5679
  it.skipIf(!kachel5679 || !existsSync(kachel5679!))('echte Kachel: CityKirche Elberfeld (Kirchenschiff)', () => {
    const { ost, nord } = utm32AusWgs84(51.2567078, 7.1474596)
    const liste = leseLod2Gebaeude(readFileSync(kachel5679!, 'utf8'), { ost, nord, radiusM: 40 })
    const g = liste.find(x => x.id === 'DENW29AL1000FYB1')!
    expect(g.dachForm).toBe('satteldach')
    expect(g.traufeZ - g.bodenZ).toBeGreaterThan(10)
    expect(g.traufeZ - g.bodenZ).toBeLessThan(11.5)
    expect(g.firstZ - g.bodenZ).toBeGreaterThan(22.5)
    expect(g.firstZ - g.bodenZ).toBeLessThan(23.5)
  }, 60000)
})
