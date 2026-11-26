import { describe, it, expect } from 'vitest'
import { utm32AusWgs84 } from '@/lib/cad/lod2-citygml'
import { utmAusWgs84, lokalAusUtm, utmAusLokal, abstandZuPolygon, punktInPolygon } from '../koordinaten'
import { citygmlZuImport, erkenneEpsg } from '../citygml-zu-modell'
import { erstelleNrwProvider, bboxUmPunkt } from '../provider/nrw'
import { providerFuerBundesland } from '../provider'
import { korrigiere, pruefeFreigabe, gibFrei, nimmFreigabeZurueck } from '../freigabe'
import { zuBuildingParams } from '../zu-building-params'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import type { GebaeudeImport } from '../typen'

const ring = (pts: number[][]) => [...pts, pts[0]].map((p) => p.join(' ')).join(' ')
const flaeche = (tag: string, pts: number[][]) =>
  `<bldg:boundedBy><bldg:${tag}><bldg:lod2MultiSurface><gml:MultiSurface><gml:surfaceMember><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList srsDimension="3">${ring(pts)}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember></gml:MultiSurface></bldg:lod2MultiSurface></bldg:${tag}></bldg:boundedBy>`

// Satteldach-Haus 20 × 10 m, Boden 100, Traufe 105, First 108; Ecke bei (ox, oy) in UTM
function haus(id: string, ox: number, oy: number): string {
  const P = (x: number, y: number, z: number) => [ox + x, oy + y, z]
  return `<core:cityObjectMember><bldg:Building gml:id="${id}"><bldg:function>31001_1000</bldg:function>`
    + flaeche('RoofSurface', [P(0, 0, 105), P(20, 0, 105), P(20, 5, 108), P(0, 5, 108)])
    + flaeche('RoofSurface', [P(0, 10, 105), P(0, 5, 108), P(20, 5, 108), P(20, 10, 105)])
    + flaeche('GroundSurface', [P(0, 0, 100), P(0, 10, 100), P(20, 10, 100), P(20, 0, 100)])
    + '</bldg:Building></core:cityObjectMember>'
}
const doc = (epsg: number, ...h: string[]) => `<?xml version="1.0"?><core:CityModel><gml:boundedBy><gml:Envelope srsName="urn:adv:crs:ETRS89_UTM${epsg % 100}*DE_DHHN2016_NH"/></gml:boundedBy>${h.join('')}</core:CityModel>`
const herkunft = { provider: 'test', quelle: 'x', lizenz: 'L', attribution: 'A', abgerufenAm: '2026-11-26T00:00:00Z', speichernErlaubt: true }

describe('Koordinaten', () => {
  it('Zone 32 stimmt mit der vorhandenen Umrechnung überein', () => {
    const a = utmAusWgs84(51.2567078, 7.1474596, 32), b = utm32AusWgs84(51.2567078, 7.1474596)
    expect(a.ost).toBeCloseTo(b.ost, 6); expect(a.nord).toBeCloseTo(b.nord, 6)
  })
  it('Mittelmeridian liefert Ostwert 500000 (Zone 32 bei 9°, Zone 33 bei 15°)', () => {
    expect(utmAusWgs84(50, 9, 32).ost).toBeCloseTo(500000, 3)
    expect(utmAusWgs84(50, 15, 33).ost).toBeCloseTo(500000, 3)
  })
  it('lokal ↔ UTM ist umkehrbar; Norden zeigt nach −z, Osten nach +x', () => {
    const u = { ost: 1000, nord: 2000 }
    expect(lokalAusUtm(1010, 2005, u)).toEqual({ x: 10, z: -5 })
    expect(utmAusLokal(10, -5, u)).toEqual({ ost: 1010, nord: 2005 })
  })
  it('Abstand zum Polygon: innen 0, außen = Kantenabstand', () => {
    const q = [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }]
    expect(punktInPolygon(0, 0, q)).toBe(true)
    expect(abstandZuPolygon(0, 0, q)).toBe(0)
    expect(abstandZuPolygon(8, 0, q)).toBeCloseTo(3, 6)
  })
})

describe('CityGML → Import-Modell', () => {
  it('liest Grundfläche, Höhen, Dachform und erkennt EPSG', () => {
    const xml = doc(25832, haus('A', 340000, 5680000))
    expect(erkenneEpsg(xml, 1)).toBe(1) // Name ohne EPSG-Zahl → Rückfall
    const [g] = citygmlZuImport(xml, { herkunft, epsg: 25832 })
    expect(g.providerObjektId).toBe('A')
    expect(g.fussabdruck).toHaveLength(4)
    expect(Math.max(...g.fussabdruck.map((p) => p.x)) - Math.min(...g.fussabdruck.map((p) => p.x))).toBeCloseTo(20, 1)
    expect(g.hoehen).toEqual({ traufeM: 5, firstM: 8 })
    expect(g.dachForm).toBe('satteldach')
    expect(g.status).toBe('vorschlag')
    expect(g.herkunft.attribution).toBe('A')
  })
  it('erkennt EPSG aus srsName', () => {
    expect(erkenneEpsg('<gml:Envelope srsName="urn:ogc:def:crs:EPSG::25833"/>', 25832)).toBe(25833)
  })
  it('Suchpunkt im Haus → Abstand 0, nächstes Haus zuerst', () => {
    const p0 = utmAusWgs84(51.25, 7.15, 32), o = Math.round(p0.ost), n = Math.round(p0.nord)
    const xml = `<core:CityModel>${haus('B', o + 90, n - 5)}${haus('A', o - 10, n - 5)}</core:CityModel>`
    const liste = citygmlZuImport(xml, { herkunft, epsg: 25832, suchpunkt: { lat: 51.25, lon: 7.15 }, radiusM: 150 })
    expect(liste.map((g) => g.providerObjektId)).toEqual(['A', 'B'])
    expect(liste[0].abstandM).toBe(0)
    expect(liste[1].abstandM).toBeGreaterThan(50)
  })
  it('filtert nach Radius', () => {
    const p0 = utmAusWgs84(51.25, 7.15, 32)
    const xml = `<core:CityModel>${haus('A', Math.round(p0.ost) - 10, Math.round(p0.nord) - 5)}${haus('B', Math.round(p0.ost) + 900, Math.round(p0.nord))}</core:CityModel>`
    const liste = citygmlZuImport(xml, { herkunft, epsg: 25832, suchpunkt: { lat: 51.25, lon: 7.15 }, radiusM: 100 })
    expect(liste.map((g) => g.providerObjektId)).toEqual(['A'])
  })
})

describe('NRW-Provider', () => {
  it('fragt mit bbox/limit und Accept an und liefert Vorschläge mit Herkunft', async () => {
    const p0 = utmAusWgs84(51.25, 7.15, 32)
    const xml = `<core:CityModel>${haus('A', Math.round(p0.ost) - 10, Math.round(p0.nord) - 5)}</core:CityModel>`
    let url = '', accept = ''
    const prov = erstelleNrwProvider((async (u: string, init: RequestInit) => { url = u; accept = (init.headers as Record<string, string>).Accept; return { ok: true, status: 200, text: async () => xml } }) as unknown as typeof fetch, () => new Date('2026-11-26T10:00:00Z'))
    const liste = await prov.sucheGebaeude(51.25, 7.15, 50)
    expect(url).toContain('/collections/building/items?bbox=')
    expect(url).toContain('limit=50')
    expect(accept).toBe('application/gml+xml')
    expect(liste).toHaveLength(1)
    expect(liste[0].herkunft).toMatchObject({ provider: 'nrw', attribution: 'Bezirksregierung Köln, Geobasis NRW', abgerufenAm: '2026-11-26T10:00:00.000Z' })
  })
  it('meldet Fehler des Dienstes', async () => {
    const prov = erstelleNrwProvider((async () => ({ ok: false, status: 500, text: async () => '' })) as unknown as typeof fetch)
    await expect(prov.sucheGebaeude(51.25, 7.15, 50)).rejects.toThrow('500')
  })
  it('bbox: Fenster um den Punkt, Reihenfolge lon,lat', () => {
    const [x0, y0, x1, y1] = bboxUmPunkt(51, 7, 100)
    expect(x0).toBeLessThan(7); expect(x1).toBeGreaterThan(7); expect(y0).toBeLessThan(51); expect(y1).toBeGreaterThan(51)
  })
  it('Provider-Auswahl nach Bundesland; unbekannt → null', () => {
    expect(providerFuerBundesland('Nordrhein-Westfalen')?.id).toBe('nrw')
    expect(providerFuerBundesland('Bayern')).toBeNull()
    expect(providerFuerBundesland(null)).toBeNull()
  })
})

describe('Prüfen, Freigeben, Übergabe', () => {
  const L = [{ x: -10, z: -5 }, { x: 10, z: -5 }, { x: 10, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 5 }, { x: -10, z: 5 }]
  const basis: GebaeudeImport = {
    id: 'x:1', providerObjektId: '1', herkunft: { ...herkunft, epsg: 25832 }, georef: { epsg: 25832, ursprungOst: 0, ursprungNord: 0 },
    fussabdruck: L, hoehen: { traufeM: 6, firstM: 9 }, dachForm: 'satteldach', hinweise: [], status: 'vorschlag', korrekturen: [],
  }
  const BAU: BuildingParams = {
    lengthM: 15, widthM: 6, heightM: 10, eavesHeightM: 10, roofForm: 'satteldach', roofHeightM: 2, floors: 3, floorHeightsM: [3, 3, 3],
    windowCount: 4, doorCount: 1, balconyCount: 0, overhangM: 0.3, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
  }

  it('Korrektur wird protokolliert und setzt den Status zurück; Freigabe sperrt', () => {
    const k = korrigiere(basis, 'firstM', 9.5, '2026-11-26T10:00:00Z')
    expect(k.hoehen.firstM).toBe(9.5)
    expect(k.korrekturen).toEqual([{ feld: 'firstM', alt: '9', neu: '9.5', am: '2026-11-26T10:00:00Z' }])
    const f = gibFrei(k)
    expect(() => korrigiere(f, 'firstM', 10)).toThrow(/gesperrt/)
    expect(nimmFreigabeZurueck(f).status).toBe('geprueft')
    expect(() => korrigiere(basis, 'firstM', -1)).toThrow()
  })
  it('Freigabe nur mit Pflichtwerten', () => {
    expect(pruefeFreigabe({ ...basis, hoehen: {} })).toContain('Gebäudehöhe (First) fehlt.')
    expect(() => gibFrei({ ...basis, dachForm: undefined })).toThrow(/Dachform/)
    expect(pruefeFreigabe({ ...basis, hoehen: { traufeM: 12, firstM: 9 } })).toContain('Traufe liegt über dem First.')
  })
  it('Übergabe verweigert nicht freigegebene Gebäude', () => {
    expect(() => zuBuildingParams(basis, BAU)).toThrow(/freigegeben/)
  })
  it('Übergabe setzt Umriss, Höhen, Dachform, Nordrichtung 0 und das Gerüst lässt sich berechnen', () => {
    for (const dach of ['satteldach', 'flachdach'] as const) {
      const b = zuBuildingParams(gibFrei({ ...basis, dachForm: dach }), BAU)
      expect(b.umriss).toHaveLength(6)
      expect(b.lengthM).toBe(20); expect(b.widthM).toBe(10)
      expect(b.heightM).toBe(9)
      expect(b.eavesHeightM).toBe(dach === 'flachdach' ? 9 : 6)
      expect(b.nordrichtungGrad).toBe(0)
      const model = generateCADModel(b, 'mj-uniconnect')
      expect(model.components3D.length).toBeGreaterThan(0)
    }
  })
})

import { fassadenGrundlage } from '../fassade'
import { kannBildSpeichern, FREIGEGEBENE_BILDQUELLEN } from '../bilder'

describe('Fassadengrundlage und Bilder', () => {
  const rechteck = [{ x: -10, z: -5 }, { x: 10, z: -5 }, { x: 10, z: 5 }, { x: -10, z: 5 }]
  const imp = { id: 'x', providerObjektId: '1', herkunft: { ...herkunft, epsg: 25832 }, georef: { epsg: 25832, ursprungOst: 0, ursprungNord: 0 },
    fussabdruck: rechteck, hoehen: { traufeM: 6, firstM: 9 }, dachForm: 'satteldach' as const, hinweise: [], status: 'freigegeben' as const, korrekturen: [] }
  it('liefert je Kante Länge, Himmelsrichtung (Norden = −z) und Wandhöhe, ohne Öffnungen', () => {
    const k = fassadenGrundlage(imp)
    expect(k).toHaveLength(4)
    const nord = k.find((e) => e.richtung === 'Nord')!
    expect(nord.laengeM).toBe(20)
    expect(k.find((e) => e.richtung === 'Ost')!.laengeM).toBe(10)
    expect(k.map((e) => e.richtung).sort()).toEqual(['Nord', 'Ost', 'Süd', 'West'])
    expect(k.every((e) => e.wandHoeheM === 6)).toBe(true)
  })
  it('keine Bildquelle freigegeben, nichts wird gespeichert', () => {
    expect(FREIGEGEBENE_BILDQUELLEN).toHaveLength(0)
    expect(kannBildSpeichern(undefined)).toBe(false)
  })
})

import { gradNachUtm, zaehleGebaeude } from '../citygml-zu-modell'

describe('Dienst liefert Grad (CRS84h) statt Meter', () => {
  // Haus 20 × 10 m bei 52,03 N / 6,83 O in Grad; Längengrad-Meter = 111320·cos(Breite)
  const lat0 = 52.03, lon0 = 6.83
  const dLat = (m: number) => m / 111_320, dLon = (m: number) => m / (111_320 * Math.cos((lat0 * Math.PI) / 180))
  const grad = (lonLat: boolean) => {
    const P = (x: number, y: number, z: number) => (lonLat ? [lon0 + dLon(x), lat0 + dLat(y), z] : [lat0 + dLat(y), lon0 + dLon(x), z])
    return `<core:CityModel>${'<core:cityObjectMember><bldg:Building gml:id="G1"><bldg:function>31001_1000</bldg:function>'
      + flaeche('RoofSurface', [P(0, 0, 105), P(20, 0, 105), P(20, 5, 108), P(0, 5, 108)])
      + flaeche('RoofSurface', [P(0, 10, 105), P(0, 5, 108), P(20, 5, 108), P(20, 10, 105)])
      + flaeche('GroundSurface', [P(0, 0, 100), P(0, 10, 100), P(20, 10, 100), P(20, 0, 100)])
      + '</bldg:Building></core:cityObjectMember>'}</core:CityModel>`
  }
  for (const lonLat of [true, false]) {
    it(`rechnet ${lonLat ? 'Länge/Breite' : 'Breite/Länge'} in Meter um und liest das Gebäude`, () => {
      const xml = grad(lonLat)
      expect(zaehleGebaeude(xml)).toBe(1)
      expect(gradNachUtm(xml)?.epsg).toBe(25832)
      const [g] = citygmlZuImport(xml, { herkunft, epsg: 25832, suchpunkt: { lat: lat0 + dLat(5), lon: lon0 + dLon(10) }, radiusM: 50 })
      expect(g).toBeDefined()
      const xs = g.fussabdruck.map((p) => p.x), zs = g.fussabdruck.map((p) => p.z)
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(19.5)
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(20.5)
      expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(9.5)
      // UTM-Gitter ist gegenüber wahrem Norden gedreht (hier ca. 1,7° bei 6,83° O): die Hülle wird bei 20 m Länge ca. 0,6 m tiefer
      expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(11)
      expect(g.hoehen).toEqual({ traufeM: 5, firstM: 8 })
      expect(g.abstandM).toBe(0)
      expect(g.hinweise.join(' ')).toContain('umgerechnet')
    })
  }
  it('Meter-Daten bleiben unverändert (keine Umrechnung)', () => {
    expect(gradNachUtm(doc(25832, haus('A', 340000, 5680000)))).toBeNull()
  })
  it('Provider meldet Fehler statt „nichts gefunden“, wenn Gebäude geliefert aber unlesbar sind', async () => {
    const xml = '<core:CityModel><bldg:Building gml:id="X"></bldg:Building></core:CityModel>'
    const prov = erstelleNrwProvider((async () => ({ ok: true, status: 200, text: async () => xml, headers: new Headers({ 'content-crs': 'CRS84h' }) })) as unknown as typeof fetch)
    await expect(prov.sucheGebaeude(52.03, 6.83, 50)).rejects.toThrow(/keines konnte gelesen werden/)
  })
})

import { bereinigeUmriss } from '../umriss-bereinigen'
import { pruefeUmriss } from '@/lib/calculations/cad-umriss'

describe('Umriss bereinigen (kleine Stufen aus LoD2)', () => {
  it('zieht eine 0,25-m-Stufe zusammen und entfernt Punkte auf Geraden; Ergebnis besteht die CAD-Prüfung', () => {
    // Rechteck 14 × 10 m mit 0,25-m-Stufe in der Westwand und einem Mittelpunkt auf der Nordkante
    const roh = [{ x: 0, z: 0 }, { x: 7, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 10 }, { x: 0.25, z: 10 }, { x: 0.25, z: 9.9 }, { x: 0, z: 9.9 }]
    expect(pruefeUmriss(roh).length).toBeGreaterThan(0)
    const { punkte, entfernt } = bereinigeUmriss(roh)
    expect(entfernt).toBeGreaterThanOrEqual(2)
    expect(pruefeUmriss(punkte)).toEqual([])
    const xs = punkte.map((q) => q.x), zs = punkte.map((q) => q.z)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(13.7)
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(9.8)
  })
  it('lässt einen sauberen Umriss unverändert', () => {
    const q = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }, { x: 0, z: 5 }]
    expect(bereinigeUmriss(q)).toEqual({ punkte: q, entfernt: 0 })
  })
  it('Freigabe prüft den Umriss', () => {
    const k = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 0.2 }, { x: 0, z: 5 }]
    const imp = { id: 'x', providerObjektId: '1', herkunft: { ...herkunft, epsg: 25832 }, georef: { epsg: 25832, ursprungOst: 0, ursprungNord: 0 },
      fussabdruck: k, hoehen: { firstM: 9 }, dachForm: 'flachdach' as const, hinweise: [], status: 'vorschlag' as const, korrekturen: [] }
    expect(pruefeFreigabe(imp).some((t) => t.includes('Kante'))).toBe(true)
  })
})
