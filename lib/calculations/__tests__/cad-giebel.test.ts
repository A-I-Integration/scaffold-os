import { describe, it, expect } from 'vitest'
import { generateCADModel, RINNE_ABSTAND_M, type BuildingParams } from '@/lib/calculations/cad-engine'

const haus = (patch: Partial<BuildingParams> = {}): BuildingParams => ({
  lengthM: 12, widthM: 9, heightM: 9.2, eavesHeightM: 6.3, roofHeightM: 2.9, roofForm: 'satteldach',
  floors: 0, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.5, setbackM: 0,
  sides: ['front', 'back', 'left', 'right'], ...patch,
})
/** Erwartete Lagenzahl: oberster Belag mindestens 1,0 m unter der Rinne/Dachkante, mindestens eine Lage */
const bisRinne = (h: number, raster: number) => Math.max(1, Math.floor((h - RINNE_ABSTAND_M) / raster + 1e-6))
const lagen = (m: ReturnType<typeof generateCADModel>, side: string) => {
  const idx = m.fields.filter((f) => f.side === side).map((f) => f.levelIndex)
  return idx.length ? Math.max(...idx) + 1 : 0
}

describe('Satteldach: Giebel-Lagen nach Feldmitte', () => {
  it('Standard-Felder (3 m): Mitte bis zum First, Randfelder eine Lage niedriger', () => {
    const m = generateCADModel(haus(), 'rux-super65')
    const proFeld = m.fields.filter((f) => f.side === 'left').reduce<Record<string, number>>((a, f) => ({ ...a, [f.positionZ.toFixed(2)]: Math.max(a[f.positionZ.toFixed(2)] ?? 0, f.levelIndex + 1) }), {})
    const werte = Object.entries(proFeld).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, v]) => v)
    // Rinne/Dachkante in Feldmitte: Randfelder 7,27 m → 3 Lagen, Mitte 9,2 m → 4 Lagen (Belag mind. 1,0 m darunter)
    expect(werte).toEqual([3, 4, 3])
  })
})

describe('Satteldach: Traufseiten kürzer, Giebelseiten folgen dem Dreieck', () => {
  it('First entlang der Länge: vorne/hinten enden an der Traufe, links/rechts stufen sich bis zum First', () => {
    const m = generateCADModel(haus({ geruestOptionen: { feldlaengeM: 2.07 } }), 'layher-allround')
    const raster = m.levels[0].heightM
    const trauflagen = bisRinne(6.3, raster)
    expect(lagen(m, 'front')).toBe(trauflagen)
    expect(lagen(m, 'back')).toBe(trauflagen)
    // das mittlere Feld liegt nicht exakt auf dem First (Feldmitte, 4 Felder à 2,07 m): Höhe dort ≈ 8,5 m
    expect(lagen(m, 'left')).toBe(bisRinne(8.5, raster))
    // Ecken der Giebelseite sind niedriger als die Mitte
    const links = m.fields.filter((f) => f.side === 'left' && f.levelIndex === bisRinne(8.5, raster) - 1)
    expect(links.length).toBeGreaterThan(0)
    expect(links.length).toBeLessThan(m.fields.filter((f) => f.side === 'left' && f.levelIndex === 0).length)
  })
  it('Fläche: Giebel = Rechteck + Dreieck, Traufseite = Länge × Traufe', () => {
    const m = generateCADModel(haus(), 'layher-allround')
    const soll = 2 * 12 * 6.3 + 2 * (9 * 6.3 + 0.5 * 9 * 2.9)
    expect(Math.abs(m.totalAreaM2 - soll)).toBeLessThan(0.01)
  })
  it('Ohne Dach-Angaben (Traufe = Höhe) bleibt alles wie bisher', () => {
    const m = generateCADModel(haus({ eavesHeightM: 9.2, roofHeightM: 0 }), 'layher-allround')
    expect(lagen(m, 'front')).toBe(m.levelCount)
    expect(lagen(m, 'left')).toBe(m.levelCount)
  })
  it('Breiter als lang: Giebel vorne/hinten', () => {
    const m = generateCADModel(haus({ lengthM: 8, widthM: 11 }), 'layher-allround')
    const raster = m.levels[0].heightM
    expect(lagen(m, 'left')).toBe(bisRinne(6.3, raster))
    // Feldmitte des mittleren Feldes liegt knapp unter dem First
    expect(lagen(m, 'front')).toBe(bisRinne(8.5, raster))
  })
})

describe('Oberster Belag mindestens 1,0 m unter der Rinne', () => {
  const belagOben = (m: ReturnType<typeof generateCADModel>, side: string) => Math.max(...m.levels.filter((l) => l.id.includes(`-${side}-`) && l.fields.length > 0).map((l) => l.topY))
  it('Beispiel Traufe 6,3 m (Lage 2,0 m): oberster Belag bei 4,0 m, nicht 8,0 m über der Rinne', () => {
    const m = generateCADModel(haus(), 'rux-super65')
    expect(m.levels[0].heightM).toBe(2)
    expect(lagen(m, 'front')).toBe(2)
    expect(belagOben(m, 'front')).toBeCloseTo(4, 5)
    expect(6.3 - belagOben(m, 'front')).toBeGreaterThanOrEqual(RINNE_ABSTAND_M)
  })
  it('gilt für jede Traufhöhe: Abstand zur Rinne nie unter 1,0 m (solange mehr als eine Lage nötig wäre)', () => {
    for (const traufe of [4.2, 5.0, 5.4, 6.3, 7.4, 8.0, 9.5]) {
      const m = generateCADModel(haus({ heightM: traufe + 2.9, eavesHeightM: traufe }), 'rux-super65')
      const oben = belagOben(m, 'front')
      expect(traufe - oben, `Traufe ${traufe}`).toBeGreaterThanOrEqual(RINNE_ABSTAND_M - 1e-6)
      expect(traufe - oben, `Traufe ${traufe}`).toBeLessThan(RINNE_ABSTAND_M + m.levels[0].heightM + 1e-6)
    }
  })
  it('niedrige Traufe: mindestens eine Lage', () => {
    const m = generateCADModel(haus({ heightM: 5, eavesHeightM: 2.5, roofHeightM: 2.5 }), 'rux-super65')
    expect(lagen(m, 'front')).toBe(1)
  })
  it('Walmdach und Mansarddach: alle vier Seiten enden an der Traufe, Fläche = Länge × Traufe', () => {
    for (const form of ['walmdach', 'mansardendach'] as const) {
      const m = generateCADModel(haus({ roofForm: form }), 'rux-super65')
      for (const sd of ['front', 'back', 'left', 'right']) expect(lagen(m, sd), `${form} ${sd}`).toBe(2)
      expect(Math.abs(m.totalAreaM2 - 2 * (12 + 9) * 6.3)).toBeLessThan(0.01)
      expect(m.warnings.some((w) => w.code === 'OBERSTER_BELAG_RINNE')).toBe(true)
    }
  })
  it('Pultdach: kein Belag über der Traufe (alle Seiten), ohne Traufangabe volle Höhe', () => {
    const m = generateCADModel(haus({ roofForm: 'pultdach' }), 'rux-super65')
    for (const sd of ['front', 'back', 'left', 'right']) expect(lagen(m, sd), `pult ${sd}`).toBe(2)
    expect(m.warnings.some((w) => w.code === 'OBERSTER_BELAG_RINNE')).toBe(true)
  })
  it('Flachdach und Dach ohne Traufangabe bleiben unverändert (volle Höhe)', () => {
    for (const patch of [{ roofForm: 'flachdach' as const, eavesHeightM: 9.2, roofHeightM: 0 }, { roofForm: 'pultdach' as const, eavesHeightM: 0 }, { roofForm: 'walmdach' as const, eavesHeightM: 9.2, roofHeightM: 0 }]) {
      const m = generateCADModel(haus(patch), 'rux-super65')
      expect(lagen(m, 'front')).toBe(m.levelCount)
      expect(m.warnings.some((w) => w.code === 'OBERSTER_BELAG_RINNE')).toBe(false)
    }
  })
  it('gebaute Fläche folgt dem tatsächlich gebauten Gerüst (Stunden), nicht der Wandfläche', () => {
    const m = generateCADModel(haus({ roofForm: 'walmdach' }), 'rux-super65')
    expect(m.gebauteFlaecheM2).toBeCloseTo(m.fields.reduce((s, f) => s + f.lengthM * 2, 0), 5)
    expect(m.gebauteFlaecheM2!).toBeLessThan(m.totalAreaM2)
  })
  it('Lagenzahl und Lagenliste zählen nur das gebaute Gerüst (Beispiel: 4 statt 5 Lagen)', () => {
    const m = generateCADModel(haus(), 'rux-super65')
    expect(m.levelCount).toBe(4)
    expect(Math.max(...m.levels.map((l) => l.index))).toBe(3)
  })
})

describe('Pultdach mit bekannter niedriger Seite', () => {
  const pult = (niedrig: 'front' | 'back' | 'left' | 'right') => generateCADModel(haus({ roofForm: 'pultdach', geruestOptionen: { feldlaengeM: 2.07, pultNiedrigeSeite: niedrig } }), 'layher-allround')
  it('niedrige Seite endet an der Traufe, hohe Seite am First', () => {
    const m = pult('front')
    const raster = m.levels[0].heightM
    expect(lagen(m, 'front')).toBe(bisRinne(6.3, raster))
    expect(lagen(m, 'back')).toBe(bisRinne(9.2, raster))
  })
  it('Seitenwände steigen zur hohen Seite an, nie höher als der First', () => {
    const m = pult('front')
    const raster = m.levels[0].heightM
    const links = m.fields.filter((f) => f.side === 'left')
    const hoechste = (f: typeof links) => Math.max(...f.map((x) => x.levelIndex + 1))
    const vorn = links.filter((f) => f.positionZ > 0 - 4.5), hinten = links.filter((f) => f.positionZ <= -4.5)
    expect(hoechste(vorn)).toBeLessThanOrEqual(hoechste(hinten))
    expect(hoechste(links)).toBeLessThanOrEqual(bisRinne(9.2, raster))
  })
  it('ohne Angabe der Seite gilt die Traufe vorsichtig für alle Seiten', () => {
    const m = generateCADModel(haus({ roofForm: 'pultdach', geruestOptionen: { feldlaengeM: 2.07 } }), 'layher-allround')
    expect(lagen(m, 'back')).toBe(lagen(m, 'front'))
  })
})

describe('Seitenprofil aus den Ansichten', () => {
  const mit = (seitenProfil: NonNullable<NonNullable<BuildingParams['geruestOptionen']>['seitenProfil']>) =>
    generateCADModel(haus({ roofForm: 'flachdach', geruestOptionen: { feldlaengeM: 2.07, seitenProfil } }), 'layher-allround')
  it('Dachkante je Position bestimmt die Lagen je Feld (Treppe von 6,3 auf 9,2 m)', () => {
    const m = mit({ front: [{ posM: -6, dachkanteM: 6.3 }, { posM: 6, dachkanteM: 9.2 }] })
    const raster = m.levels[0].heightM
    const hoechste = (a: (typeof m.fields)) => Math.max(...a.map((f) => f.levelIndex + 1))
    const links = m.fields.filter((f) => f.side === 'front' && f.positionX < -3), rechts = m.fields.filter((f) => f.side === 'front' && f.positionX > 3)
    expect(hoechste(links)).toBeLessThan(hoechste(rechts))
    expect(hoechste(rechts)).toBeLessThanOrEqual(bisRinne(9.2, raster))
  })
  it('Profil hat Vorrang vor der Dachform; andere Seiten bleiben unberührt', () => {
    const m = mit({ front: [{ posM: 0, dachkanteM: 4 }] })
    expect(lagen(m, 'front')).toBeLessThan(lagen(m, 'back'))
  })
  it('kein Gerüst über der Dachkante des Profils', () => {
    const m = mit({ back: [{ posM: -5, dachkanteM: 5 }, { posM: 5, dachkanteM: 5 }] })
    const raster = m.levels[0].heightM
    expect(lagen(m, 'back')).toBe(bisRinne(5, raster))
  })
})
