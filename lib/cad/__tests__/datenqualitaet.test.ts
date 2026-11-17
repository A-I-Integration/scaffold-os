// Testmatrix der zentralen Prüfung. „echt“ = echte Plandatei (Leithner, Vektor-PDF, Fixture); „synthetisch“ = von Hand gebaut und so gekennzeichnet.
import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams, type CADModel } from '@/lib/calculations/cad-engine'
import { pruefePlanImport, pruefeModell3D, fussAbweichungen, formatHinweis, formatFaehigkeit, alsWarnungen } from '@/lib/cad/datenqualitaet'
import type { PlanImport } from '@/lib/cad/plan-import'
import plan from '@/lib/cad/__tests__/fixtures/plan-import-efh-hang.json'

const codes = (b: { befunde: { code: string }[] }) => b.befunde.map((x) => x.code)
const echt = plan as unknown as PlanImport
const synth = (patch: Partial<PlanImport>): PlanImport => ({ ...echt, ...patch })

describe('Plan-Import: echte Datei (Leithner, Vektor-PDF, Hanglage, mehrere Ansichten)', () => {
  const r = pruefePlanImport(echt)
  it('liefert Werte mit Quelle, Methode und Konfidenz; fehlende Werte stehen als „fehlt“, nicht als 0', () => {
    expect(r.werte.length).toBeGreaterThan(8)
    for (const w of r.werte) { expect(w.quelle).toBeTruthy(); expect(w.methode).toBeTruthy(); expect(w.konfidenz).toBeTruthy() }
    for (const w of r.werte.filter((x) => x.konfidenz === 'fehlt')) expect(w.wert).toBeUndefined()
  })
  it('Ost und West haben keine eigene Geländelinie → GELB und Hinweis, nicht grün', () => {
    expect(r.ampel).not.toBe('gruen')
    expect(codes(r)).toContain('GELAENDE_SEITEN')
    expect(r.werte.find((w) => w.schluessel === 'gelaende.Ost')?.konfidenz).toBe('fehlt')
  })
  it('keine Quelle enthält einen Dateinamen', () => {
    for (const w of r.werte) expect(w.quelle).not.toMatch(/\.pdf|Leithner|\.dxf/i)
  })
})

describe('Plan-Import: synthetische Fälle (gekennzeichnet)', () => {
  it('kein Plan lesbar → ROT, keine Werte', () => { const r = pruefePlanImport(null); expect(r.ampel).toBe('rot'); expect(r.werte).toEqual([]) })
  it('Maßstab fehlt → ROT', () => expect(pruefePlanImport(synth({ massstab: 0 })).ampel).toBe('rot'))
  it('ungewöhnlicher Maßstab → mindestens GELB', () => expect(codes(pruefePlanImport(synth({ massstab: 37 })))).toContain('MASSSTAB'))
  it('Höhen fehlen → GELB, Werte undefiniert (nicht 0)', () => {
    const r = pruefePlanImport(synth({ firstKoteM: undefined, traufKoteM: undefined }))
    expect(codes(r)).toContain('HOEHEN_FEHLEN')
    expect(r.werte.find((w) => w.schluessel === 'gebaeude.firstM')?.wert).toBeUndefined()
  })
  it('First unter Traufe → ROT', () => expect(codes(pruefePlanImport(synth({ firstKoteM: 3, traufKoteM: 5 })))).toContain('HOEHEN_WIDERSPRUCH'))
  it('Fläche größer als Länge × Breite → ROT (widersprüchliche Maße)', () => {
    const g = echt.geschosse.map((x) => (x.ebene === echt.hauptEbene ? { ...x, flaecheM2: x.laengeM * x.breiteM * 1.5 } : x))
    expect(pruefePlanImport(synth({ geschosse: g })).ampel).toBe('rot')
  })
  it('L-förmiger Grundriss (Fläche deutlich unter dem Rechteck) → GELB', () => {
    const g = echt.geschosse.map((x) => (x.ebene === echt.hauptEbene ? { ...x, flaecheM2: x.laengeM * x.breiteM * 0.6 } : x))
    expect(codes(pruefePlanImport(synth({ geschosse: g })))).toContain('KEIN_RECHTECK')
  })
  it('Geschosslücke → GELB', () => {
    const g = [{ ...echt.geschosse[0], ebene: 0 }, { ...echt.geschosse[0], ebene: 3 }]
    expect(codes(pruefePlanImport(synth({ geschosse: g, hauptEbene: 0 })))).toContain('GESCHOSSLUECKE')
  })
  it('unplausibler Geländeunterschied (Einheitenfehler) → ROT', () => {
    const l = (echt.gelaendeLinien ?? []).map((x, i) => (i === 0 ? { ...x, profil: x.profil.map((p, k) => ({ ...p, hoeheM: p.hoeheM + k * 100 })) } : x))
    expect(codes(pruefePlanImport(synth({ gelaendeLinien: l })))).toContain('GELAENDE_UNPLAUSIBEL')
  })
  it('ohne Geländedaten: GELB mit klarem Hinweis (ebener Boden angenommen)', () => {
    expect(codes(pruefePlanImport(synth({ gelaendeLinien: undefined, gelaende: undefined, gelaendeTiefe: undefined })))).toContain('GELAENDE_FEHLT')
  })
})

describe('Dateiformate: keine falsche Universalunterstützung', () => {
  it('DWG wird als nicht lesbar gemeldet', () => expect(formatHinweis('x.dwg')).toMatch(/nicht|exportieren/i))
  it('Bild/Foto wird als eingeschränkt gemeldet, nicht als maßhaltig', () => { expect(formatFaehigkeit('a.jpg')?.stufe).toBe('eingeschraenkt'); expect(formatHinweis('a.png')).toBeTruthy() })
  it('Vektor-PDF und DXF ohne Warnung', () => { expect(formatHinweis('a.pdf')).toBeNull(); expect(formatHinweis('a.dxf')).toBeNull() })
  it('unbekanntes Format wird gemeldet', () => expect(formatHinweis('a.xyz')).toMatch(/nicht gelesen/))
})

const rechteck = (patch: Partial<BuildingParams> = {}): BuildingParams => ({
  lengthM: 12, widthM: 8, heightM: 9, eavesHeightM: 7.5, roofHeightM: 1.5, roofForm: 'satteldach', floors: 3, floorHeightsM: [],
  windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'], ...patch,
} as BuildingParams)
const hang: BuildingParams['geruestOptionen'] = { gelaendeEckenM: { fl: -1.2, fr: -0.2, bl: -2.4, br: -1.4 } }
const vorbauten = [{ id: 'v0', side: 'back' as const, offsetAlongM: -1.6, breiteM: 4.4, tiefeM: 1.5, hoeheM: 5.92 }]

describe('3D-Prüfung: Modelle (synthetisch, gekennzeichnet) – korrekte Modelle werden nicht beanstandet', () => {
  it('einfaches Rechteck, eben: keine roten Befunde, Füße auf dem Gelände', () => {
    const m = generateCADModel(rechteck(), 'layher-allround')
    const r = pruefeModell3D(m)
    expect(r.befunde.filter((x) => x.ampel === 'rot')).toEqual([])
    expect(Math.max(...fussAbweichungen(m)!.map((f) => Math.abs(f.abweichungM)))).toBeLessThanOrEqual(0.02)
  })
  it('Hanglage (Rechteck): keine roten Befunde', () => {
    const r = pruefeModell3D(generateCADModel(rechteck({ geruestOptionen: hang }), 'layher-allround'))
    expect(r.befunde.filter((x) => x.ampel === 'rot')).toEqual([])
  })
  it('Hanglage mit Vorbau (Fall der Nutzerin): Füße auf dem Gelände, Feldanzahl > 0', () => {
    const m = generateCADModel(rechteck({ lengthM: 13.8, widthM: 8.85, heightM: 6.94, eavesHeightM: 5.92, roofHeightM: 1.02, roofForm: 'pultdach', sides: ['front', 'left', 'right'], vorbauten, geruestOptionen: hang }), 'layher-allround')
    const r = pruefeModell3D(m)
    expect(m.fieldCount).toBeGreaterThan(0)
    expect(codes(r)).not.toContain('FUESSE_GELAENDE')
    expect(codes(r)).not.toContain('FELDZAHL_NULL')
    expect(r.befunde.filter((x) => x.ampel === 'rot')).toEqual([])
  })
  it('mehrere Geschosse / Dachformen: Pultdach, Walmdach ohne rote Befunde', () => {
    for (const roofForm of ['pultdach', 'walmdach', 'flachdach'] as const) {
      const r = pruefeModell3D(generateCADModel(rechteck({ roofForm, floors: 4, heightM: 12, eavesHeightM: 11 }), 'layher-allround'))
      expect(r.befunde.filter((x) => x.ampel === 'rot')).toEqual([])
    }
  })
  it('L-förmiger Umriss: Füße „nicht prüfbar“ → GELB, nie stillschweigend grün', () => {
    const m = generateCADModel(rechteck({ umriss: [{ x: -6, z: -4 }, { x: 6, z: -4 }, { x: 6, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 4 }, { x: -6, z: 4 }] as never }), 'layher-allround')
    expect(codes(pruefeModell3D(m))).toContain('FUESSE_NICHT_PRUEFBAR')
  })
})

describe('3D-Prüfung: fehlerhafte Modelle werden erkannt (nichts geht unbemerkt in die Freigabe)', () => {
  const basis = (): CADModel => generateCADModel(rechteck({ geruestOptionen: hang }), 'layher-allround')
  it('Fuß 10 cm über dem Gelände (schwebend) → ROT', () => {
    const m = basis(); const f = m.components3D.find((c) => c.type === 'footplate')!; f.position = [f.position[0], f.position[1] + 0.1, f.position[2]]
    expect(pruefeModell3D(m).ampel).toBe('rot'); expect(codes(pruefeModell3D(m))).toContain('FUESSE_GELAENDE')
  })
  it('Fuß 30 cm im Boden → ROT', () => {
    const m = basis(); const f = m.components3D.find((c) => c.type === 'footplate')!; f.position = [f.position[0], f.position[1] - 0.3, f.position[2]]
    expect(codes(pruefeModell3D(m))).toContain('FUESSE_GELAENDE')
  })
  it('alle Füße auf einer Höhe trotz Hang (Fehler des Abschnitts-Pfads) → ROT', () => {
    const m = basis(); m.components3D.filter((c) => c.type === 'footplate').forEach((c) => { c.position = [c.position[0], 0, c.position[2]] })
    expect(pruefeModell3D(m).ampel).toBe('rot')
  })
  it('Feldanzahl 0 bei vorhandenen Feldern → ROT (angezeigte „0 Felder“)', () => {
    const m = basis(); m.fieldCount = 0
    expect(codes(pruefeModell3D(m))).toContain('FELDZAHL_NULL')
  })
  it('Seite gewählt, aber ohne Felder → ROT', () => {
    const m = basis(); m.fields = m.fields.filter((f) => f.side !== 'left')
    expect(codes(pruefeModell3D(m))).toContain('SEITE_FEHLT')
  })
  it('Umriss-Modus (Felder an Kanten): Seiten hinten/links/rechts sind kein Fehler', () => {
    const m = basis(); m.fields = m.fields.map((f) => ({ ...f, side: 'front' as const, kante: 0 }))
    expect(codes(pruefeModell3D(m))).not.toContain('SEITE_FEHLT')
  })
  it('Bauteilliste leer → ROT', () => { const m = basis(); m.components3D = []; expect(pruefeModell3D(m).ampel).toBe('rot') })
  it('Gebäudehöhe 0 (fehlender Wert still durch 0 ersetzt) → ROT', () => {
    const m = basis(); m.building = { ...m.building, heightM: 0 }
    expect(codes(pruefeModell3D(m))).toContain('GEOMETRIE_NULL')
  })
  it('Traufe über Gebäudehöhe → ROT', () => {
    const m = basis(); m.building = { ...m.building, eavesHeightM: m.building.heightM + 2 }
    expect(codes(pruefeModell3D(m))).toContain('HOEHE_TRAUFE')
  })
  it('Meldungen für die bestehende Warnungsanzeige', () => {
    const m = basis(); m.fieldCount = 0
    expect(alsWarnungen(pruefeModell3D(m)).some((w) => w.type === 'error' && w.code.startsWith('PRUEF_'))).toBe(true)
  })
})

describe('Plan-Import: Maßketten (synthetisch)', () => {
  const ang = (n: number, status: 'bestaetigt' | 'abweichend' | 'ohne_linie') => Array.from({ length: n }, (_, i) => ({ text: `${i + 1},00`, textM: i + 1, status, x: 0, y: 0 }))
  const masse = (bestaetigt: number, rest: number, extra: object = {}) => ({ angaben: [...ang(bestaetigt, 'bestaetigt'), ...ang(rest, 'ohne_linie')], bestaetigt, abweichend: 0, ohneLinie: rest, ...extra })
  it('viele bestätigte Maßketten: Befund grün, Maßstab doppelt belegt', () => {
    const r = pruefePlanImport(synth({ masse: masse(9, 1) }))
    expect(r.befunde.find((x) => x.code === 'MASSKETTEN_OK')?.ampel).toBe('gruen')
  })
  it('wenige bestätigte: gelb', () => {
    expect(codes(pruefePlanImport(synth({ masse: masse(2, 8) })))).toContain('MASSKETTEN_TEILWEISE')
  })
  it('Maßketten sprechen für anderen Maßstab: gelb mit Hinweis', () => {
    const r = pruefePlanImport(synth({ masse: masse(0, 8, { besterMassstab: 50, trefferAnteil: 0.9 }) }))
    expect(r.befunde.find((x) => x.code === 'MASSSTAB_MASSKETTEN')?.ampel).toBe('gelb')
  })
  it('ohne Maßketten-Angaben bleibt alles wie bisher', () => {
    expect(codes(pruefePlanImport(echt)).some((c) => c.startsWith('MASSKETTEN') || c === 'MASSSTAB_MASSKETTEN')).toBe(false)
  })
})
