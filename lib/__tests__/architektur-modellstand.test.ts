// ============================================================
// Architektur- und Integrationstest: ein CAD-Modellstand, alle Verbraucher
//
// Nachweis, dass Stückliste, Regelcheck, Pläne, Bauabschnitt, Teilabbau, Logistik und
// Leistungsverzeichnis aus demselben Modellstand abgeleitet werden. Es laufen die echten
// Produktionsfunktionen; nachgebaut wird nur die Erwartung (Zählen, Vergleichen).
//
// Der Modellstand ist `modellHash(model)` aus lib/calculations/modell-stand.ts (die Produktionsfunktion, nicht nachgebaut).
// Die früheren Lückentests (`it.fails`) sind echte Tests: Modellstand, Herkunftsprüfung im LV, unverändertes Eingabemodell.
// ============================================================
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { modellHash } from '@/lib/calculations/modell-stand'
import { readFileSync } from 'fs'
import { join } from 'path'

vi.mock('@/lib/calculations/cad-engine', async (orig) => {
  const m = await orig<typeof import('@/lib/calculations/cad-engine')>()
  return { ...m, generateCADModel: vi.fn(m.generateCADModel) }
})

import {
  generateCADModel, generateBillOfMaterials, calculateLogistics, addManualPlacement,
  type BuildingParams, type CADModel, type ScaffoldComponent3D,
} from '@/lib/calculations/cad-engine'
import { pruefeGeruest } from '@/lib/geruest/regelpruefung'
import { erzeugeZeichnungen } from '@/lib/geruest/plan-zeichnung'
import { kappeModellAufHoehe, kappeMaterial } from '@/lib/cad/bauabschnitt'
import { berechneTeilabbau } from '@/lib/cad/teilabbau'
import { erzeugeLeistungsverzeichnis, LV_STANDARD_EINGABEN, type LvEingaben, type LvPosition } from '@/lib/leistungsverzeichnis'

// ─── Gemeinsamer Modellstand (Testfixture) ───────────────────────────────────
// Hochhaus 20 × 10 m, 31 m, mit gemietetem Aufzug (Typ extern) → alle Verbraucher sehen dasselbe Modell.
const GEBAEUDE: BuildingParams = {
  lengthM: 20, widthM: 10, heightM: 31, eavesHeightM: 31, roofHeightM: 0, roofForm: 'flachdach',
  floors: 10, floorHeightsM: Array(10).fill(3.1), windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
  geruestOptionen: { aufzug: { seite: 'front', gemietet: true } },
}
const SYSTEM = 'layher-allround'
const PREISE: LvEingaben = { ...LV_STANDARD_EINGABEN, stundensatzFach: 60, stundensatzHelfer: 40, mietsatzProzentJeWoche: 2, zuschlagProzent: 10 }

/** Menge je Artikelnummer, unabhängig von der Produktionsfunktion gezählt (extern zählt nicht). */
function zaehleArtikel(comps: ScaffoldComponent3D[]): Record<string, number> {
  const z: Record<string, number> = {}
  for (const c of comps) if (!c.extern) z[c.articleNumber] = (z[c.articleNumber] ?? 0) + 1
  return z
}
const bomMap = (m: CADModel): Record<string, number> => Object.fromEntries(generateBillOfMaterials(m).map((x) => [x.articleNumber, x.quantity]))
const mitBauteilen = (m: CADModel, comps: ScaffoldComponent3D[]): CADModel => ({ ...m, components3D: comps })
/** Manuelle Konsole wie im CAD; addManualPlacement arbeitet auf einer Kopie, das Ausgangsmodell bleibt unverändert. */
const mitKonsole = (m: CADModel): CADModel => {
  const f = m.fields[0]
  return addManualPlacement({ ...m, components3D: [...m.components3D], anchors: [...m.anchors] }, { type: 'console', positionX: f.positionX, positionY: 4, positionZ: f.positionZ, side: f.side, levelIndex: 1, fieldId: f.id })
}
const positionen = (lv: ReturnType<typeof erzeugeLeistungsverzeichnis>): LvPosition[] => lv.titel.flatMap((t) => t.positionen)
const lvAus = (m: CADModel, hoursPerSqm = 2.0, e: LvEingaben = PREISE) => {
  const materials = generateBillOfMaterials(m)
  const lg = calculateLogistics(m, materials, hoursPerSqm)
  return { lv: erzeugeLeistungsverzeichnis({ model: m, materials, aufbauStunden: lg.aufbauStunden, abbauStunden: lg.abbauStunden }, e), materials, lg }
}

let modell: CADModel
beforeAll(() => {
  modell = generateCADModel(GEBAEUDE, SYSTEM)
  vi.mocked(generateCADModel).mockClear()
})

describe('Fixture', () => {
  it('Modell hat Bauteile, Lagen und ein externes Bauteil (gemieteter Aufzug)', () => {
    expect(modell.components3D.length).toBeGreaterThan(1000)
    expect(modell.levelCount).toBe(new Set(modell.levels.map((l) => l.index)).size)   // unabhängig von der Rundungsregel für die oberste Lage
    expect(modell.components3D.filter((c) => c.extern).map((c) => c.type)).toEqual(['elevator'])
  })
  it('Bauteil-IDs sind eindeutig (nichts doppelt im Modell)', () => {
    const ids = modell.components3D.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ─── 1. Modellidentität ──────────────────────────────────────────────────────
describe('1. Modellidentität: alle Verbraucher arbeiten auf dem übergebenen Modell', () => {
  it('kein Verbraucher erzeugt intern ein eigenes Modell (generateCADModel wird nicht aufgerufen)', () => {
    const materials = generateBillOfMaterials(modell)
    calculateLogistics(modell, materials, 2)
    pruefeGeruest(modell)
    erzeugeZeichnungen(modell)
    const kapp = kappeModellAufHoehe(modell, 21.5)!
    kappeMaterial(materials, modell, kapp.model)
    berechneTeilabbau(modell, { art: 'lagen', anzahl: 2 }, { gesamtAbbauStunden: 100 })
    lvAus(modell)
    lvAus(modell, 2, { ...PREISE, stil: 'statiker' })
    expect(vi.mocked(generateCADModel)).not.toHaveBeenCalled()
  })
  it('Quelltext: Verbraucher-Module rufen generateCADModel nirgends auf', () => {
    const dateien = ['lib/leistungsverzeichnis.ts', 'lib/geruest/regelpruefung.ts', 'lib/geruest/plan-zeichnung.ts', 'lib/cad/bauabschnitt.ts', 'lib/cad/teilabbau.ts', 'lib/export/statik-excel.ts', 'lib/export/statiker-paket.ts', 'lib/export/lastannahmen-pdf.ts']
    for (const d of dateien) expect(readFileSync(join(__dirname, '../../', d), 'utf8'), d).not.toMatch(/generateCADModel\s*\(/)
  })
  it('kein Verbraucher verändert das Modell (Hash vor und nach allen Aufrufen gleich)', () => {
    const vorher = modellHash(modell)
    const { materials } = lvAus(modell)
    pruefeGeruest(modell); erzeugeZeichnungen(modell)
    const kapp = kappeModellAufHoehe(modell, 21.5)!
    kappeMaterial(materials, modell, kapp.model)
    berechneTeilabbau(modell, { art: 'seite', seiten: ['front'] }, { gesamtAbbauStunden: 100 })
    expect(modellHash(modell)).toBe(vorher)
  })
  it('Bauabschnitt: das gekappte Modell besteht nur aus Bauteilen des Ausgangsmodells (gleiche IDs)', () => {
    const kapp = kappeModellAufHoehe(modell, 21.5)!
    const alle = new Set(modell.components3D.map((c) => c.id))
    expect(kapp.model.components3D.length).toBeGreaterThan(0)
    for (const c of kapp.model.components3D) expect(alle.has(c.id), c.id).toBe(true)
  })
  it('Modellstand: wird aus dem Inhalt berechnet (nicht am Modell gespeichert), ist stabil und hängt nicht an Reihenfolge oder Bauteil-IDs', () => {
    const h = modellHash(modell)
    expect(h).toMatch(/^[0-9a-f]{28}$/)
    expect(modellHash(modell)).toBe(h)
    const umgekehrt = mitBauteilen(modell, [...modell.components3D].reverse())
    expect(modellHash(umgekehrt)).toBe(h)
    expect(Object.keys(modell)).not.toContain('modellHash')
  })
})

// ─── 2. Stückliste ───────────────────────────────────────────────────────────
describe('2. Stückliste: Zählung nach Artikelnummer, extern ausgeschlossen', () => {
  it('Menge je Artikel = Anzahl der internen Bauteile mit dieser Artikelnummer', () => {
    expect(bomMap(modell)).toEqual(zaehleArtikel(modell.components3D))
  })
  it('Summe der Stückliste = Zahl der internen Bauteile; der gemietete Aufzug fehlt', () => {
    const intern = modell.components3D.filter((c) => !c.extern).length
    const summe = generateBillOfMaterials(modell).reduce((s, x) => s + x.quantity, 0)
    expect(summe).toBe(intern)
    expect(bomMap(modell)['AZ-001']).toBeUndefined()
  })
  it('derselbe Aufzug aus dem eigenen Inventar (nicht gemietet) steht in der Stückliste', () => {
    const eigen = generateCADModel({ ...GEBAEUDE, geruestOptionen: { aufzug: { seite: 'front', gemietet: false } } }, SYSTEM)
    vi.mocked(generateCADModel).mockClear()
    expect(bomMap(eigen)['AZ-001']).toBe(1)
    expect(eigen.components3D.some((c) => c.extern)).toBe(false)
  })
  it('Gewicht in der Logistik = Summe der Stücklistenzeilen (extern wiegt nichts)', () => {
    const materials = generateBillOfMaterials(modell)
    const lg = calculateLogistics(modell, materials, 2)
    expect(lg.gesamtgewichtKg).toBe(Math.round(materials.reduce((s, x) => s + x.weightKg * x.quantity, 0)))
  })
})

// ─── 3. Regelcheck ───────────────────────────────────────────────────────────
describe('3. Regelcheck: derselbe Modellstand, externe Bauteile je Regel eindeutig', () => {
  it('Kennzahlen, auf denen der Regelcheck beruht, stammen aus dem Modell (Felder, Lagen, Höhe)', () => {
    const p = pruefeGeruest(modell)
    expect(p.ergebnisse.length).toBeGreaterThan(0)
    expect(modell.fieldCount).toBe(modell.fields.filter((f) => f.levelIndex === 0).length)   // Felder je Lage (untere Lage)
    expect(modell.fields.length).toBe(modell.fieldCount * modell.levelCount)
    expect(modell.levelCount).toBe(new Set(modell.levels.map((l) => l.index)).size)
  })
  it('externe Bauteile beeinflussen KEINE Regel: Protokoll mit und ohne den gemieteten Aufzug ist gleich', () => {
    const ohneExtern = mitBauteilen(modell, modell.components3D.filter((c) => !c.extern))
    expect(pruefeGeruest(ohneExtern)).toEqual(pruefeGeruest(modell))
  })
  it('Regelcheck reagiert auf den Modellstand: ohne Diagonalen ändert sich das Protokoll', () => {
    const ohneDiagonalen = mitBauteilen(modell, modell.components3D.filter((c) => c.type !== 'diagonal'))
    expect(pruefeGeruest(ohneDiagonalen)).not.toEqual(pruefeGeruest(modell))
  })
})

// ─── 4. Leistungsverzeichnis ─────────────────────────────────────────────────
describe('4. Leistungsverzeichnis: Mengen und Stunden aus demselben Modellstand', () => {
  it('Gerüstfläche = Modellfläche, Treppen und Schutzdach aus den Bauteilen des Modells', () => {
    const { lv } = lvAus(modell)
    const p = positionen(lv)
    const flaeche = p.find((x) => x.titel.startsWith('Arbeits- und Schutzgerüst') && x.einheit === 'm²')!
    expect(flaeche.menge).toBeCloseTo(modell.totalAreaM2, 1)
    const treppen = p.find((x) => x.titel.startsWith('Treppenaufgang – Aufbau'))!
    expect(treppen.menge).toBe(modell.components3D.filter((c) => c.type === 'stair').length)
    const schutz = p.find((x) => x.titel.startsWith('Schutzdach – Aufbau'))!
    expect(schutz.menge).toBeCloseTo(modell.components3D.filter((c) => c.type === 'protection_roof').reduce((s, c) => s + Math.abs(c.scale[0]), 0), 1)
  })
  it('Aufbau-Lohn im LV = Aufbaustunden der Logistik × Stundensatz × Zuschlag (Rundung auf Cent je EP)', () => {
    const { lv, lg } = lvAus(modell)
    const aufbau = positionen(lv).filter((x) => /– Aufbau$/.test(x.titel))
    const summe = aufbau.reduce((s, x) => s + x.gp, 0)
    const soll = lg.aufbauStunden * PREISE.stundensatzFach * (1 + PREISE.zuschlagProzent / 100)
    const toleranz = aufbau.reduce((s, x) => s + x.menge * 0.005, 1)
    expect(Math.abs(summe - soll)).toBeLessThanOrEqual(toleranz)
  })
  it('Stunden folgen dem Modell: doppelte Stunden je m² → doppelter Aufbau-Lohn, Vorhaltung unverändert', () => {
    const a = lvAus(modell, 2).lv, b = lvAus(modell, 4).lv
    const lohn = (lv: typeof a) => positionen(lv).filter((x) => /– Aufbau$/.test(x.titel)).reduce((s, x) => s + x.gp, 0)
    const miete = (lv: typeof a) => positionen(lv).filter((x) => x.titel.startsWith('Vorhaltung')).reduce((s, x) => s + x.gp, 0)
    expect(lohn(b) / lohn(a)).toBeCloseTo(2, 1)
    expect(miete(b)).toBeCloseTo(miete(a), 2)
  })
  it('kein Bauteil doppelt gezählt: Materialwert der Stückliste = Summe der Einzelpreise der internen Bauteile', () => {
    const materials = generateBillOfMaterials(modell)
    const aus = materials.reduce((s, x) => s + x.totalPrice, 0)
    const je = Object.fromEntries(materials.map((x) => [x.articleNumber, x.unitPrice]))
    const soll = modell.components3D.filter((c) => !c.extern).reduce((s, c) => s + (je[c.articleNumber] ?? 0), 0)
    expect(aus).toBeCloseTo(soll, 1)
  })
})

// ─── 5. Bauabschnitte und Teilabbau ──────────────────────────────────────────
describe('5. Bauabschnitt und Teilabbau: Mengen entstehen aus dem Modellstand und der Teilungslogik', () => {
  it('Bauabschnitt: oberste Lage = Lagenoberkante nächst der Teilungshöhe; alle behaltenen Lagen liegen darunter', () => {
    const kapp = kappeModellAufHoehe(modell, 21.5)!
    const tops = [...new Set(modell.levels.map((l) => Math.round(l.topY * 100) / 100))]
    const naechste = tops.reduce((b, t) => (Math.abs(t - 21.5) < Math.abs(b - 21.5) ? t : b), tops[0])
    expect(kapp.obenM).toBe(naechste)
    for (const l of kapp.model.levels) expect(l.topY).toBeLessThanOrEqual(kapp.obenM + 1e-6)
    expect(kapp.model.levels.length).toBeLessThan(modell.levels.length)
  })
  it('Bauabschnitt: je Artikel gekappt + entfernt = ganz (außer der angepassten Treppe)', () => {
    const kapp = kappeModellAufHoehe(modell, 21.5)!
    const bleibt = new Set(kapp.model.components3D.map((c) => c.id))
    const entfernt = modell.components3D.filter((c) => !bleibt.has(c.id))
    const gekappt = zaehleArtikel(kapp.model.components3D), weg = zaehleArtikel(entfernt), ganz = zaehleArtikel(modell.components3D)
    for (const art of Object.keys(ganz)) if (art !== 'SP-001') expect((gekappt[art] ?? 0) + (weg[art] ?? 0), art).toBe(ganz[art])
  })
  it('Bauabschnitt: kappeMaterial ändert keine Preise je Stück und keine Menge nach oben', () => {
    const materials = generateBillOfMaterials(modell)
    const kapp = kappeModellAufHoehe(modell, 21.5)!
    const m2 = kappeMaterial(materials, modell, kapp.model)
    for (const x of m2) {
      const o = materials.find((y) => y.articleNumber === x.articleNumber)!
      expect(x.quantity).toBeLessThanOrEqual(o.quantity)
      expect(x.unitPrice).toBe(o.unitPrice)
    }
    expect(m2.reduce((s, x) => s + x.totalPrice, 0)).toBeLessThan(materials.reduce((s, x) => s + x.totalPrice, 0))
  })
  it('Teilabbau (Lagen): Material = Stückliste genau der gewählten Bauteile; Bauteile stammen aus dem Modell', () => {
    const r = berechneTeilabbau(modell, { art: 'lagen', anzahl: 2 }, { gesamtAbbauStunden: 1000 })
    const alle = new Map(modell.components3D.map((c) => [c.id, c]))
    const gewaehlt = r.bauteilIds.map((id) => alle.get(id)!)
    expect(gewaehlt.every(Boolean)).toBe(true)
    expect(r.anzahlTeile).toBe(r.bauteilIds.length)
    const aus = Object.fromEntries(r.material.map((x) => [x.articleNumber, x.quantity]))
    expect(aus).toEqual(zaehleArtikel(gewaehlt))
  })
  it('Teilabbau (Lagen): Stunden = Gesamtabbau × Flächenanteil; alle Lagen = ganzes Gerüst', () => {
    const teil = berechneTeilabbau(modell, { art: 'lagen', anzahl: 2 }, { gesamtAbbauStunden: 1000 })
    expect(teil.stundenBerechnet).toBeCloseTo(1000 * teil.anteil, 0)
    expect(teil.anteil).toBeGreaterThan(0); expect(teil.anteil).toBeLessThan(1)
    const alles = berechneTeilabbau(modell, { art: 'lagen', anzahl: modell.levelCount }, { gesamtAbbauStunden: 1000 })
    expect(alles.anteil).toBeCloseTo(1, 2)
    expect(alles.stundenBerechnet).toBeCloseTo(1000, 0)
  })
  it('Teilabbau (Auswahl von Bauteilen): Material und Gewicht stammen genau aus diesen Bauteilen', () => {
    const drei = modell.components3D.filter((c) => c.type === 'frame').slice(0, 3)
    const r = berechneTeilabbau(modell, { art: 'ids', ids: drei.map((c) => c.id) }, { gesamtAbbauStunden: 100 })
    expect(r.anzahlTeile).toBe(3)
    expect(Object.fromEntries(r.material.map((x) => [x.articleNumber, x.quantity]))).toEqual(zaehleArtikel(drei))
  })
})

// ─── 6. Mutationstests ───────────────────────────────────────────────────────
describe('6. Mutationen: hinzufügen, entfernen, verändern → abhängige Ausgaben folgen', () => {
  const rahmen = (m: CADModel) => m.components3D.find((c) => c.type === 'frame' && !c.extern)!

  it('Entfernen eines Rahmens: Stückliste −1 bei genau diesem Artikel, Gewicht sinkt, Regelcheck-Kennzahlen bleiben', () => {
    const r = rahmen(modell)
    const neu = mitBauteilen(modell, modell.components3D.filter((c) => c.id !== r.id))
    const vorher = bomMap(modell), nachher = bomMap(neu)
    expect(nachher[r.articleNumber]).toBe(vorher[r.articleNumber] - 1)
    for (const art of Object.keys(vorher)) if (art !== r.articleNumber) expect(nachher[art], art).toBe(vorher[art])
    expect(calculateLogistics(neu, generateBillOfMaterials(neu), 2).gesamtgewichtKg).toBeLessThan(calculateLogistics(modell, generateBillOfMaterials(modell), 2).gesamtgewichtKg)
    expect(neu.fieldCount).toBe(modell.fieldCount)
  })
  it('Hinzufügen einer Konsole (wie im CAD): Stückliste +1 beim Konsolen-Artikel, Material im LV steigt', () => {
    const neu = mitKonsole(modell)
    const vorher = bomMap(modell), nachher = bomMap(neu)
    const geaendert = Object.keys(nachher).filter((a) => (nachher[a] ?? 0) !== (vorher[a] ?? 0))
    expect(geaendert.length).toBe(1)
    expect(nachher[geaendert[0]] - (vorher[geaendert[0]] ?? 0)).toBe(1)
    expect(neu.components3D.length).toBe(modell.components3D.length + 1)
    const matGes = (m: CADModel) => lvAus(m).materials.reduce((s, x) => s + x.totalPrice, 0)
    expect(matGes(neu)).toBeGreaterThan(matGes(modell))
  })
  it('Verändern der Artikelnummer eines Rahmens: −1 beim alten, +1 beim neuen Artikel, Summe gleich', () => {
    const r = rahmen(modell)
    const neuArt = r.articleNumber === 'RA-003' ? 'RA-002' : 'RA-003'
    const neu = mitBauteilen(modell, modell.components3D.map((c) => (c.id === r.id ? { ...c, articleNumber: neuArt } : c)))
    const vorher = bomMap(modell), nachher = bomMap(neu)
    expect(nachher[r.articleNumber]).toBe(vorher[r.articleNumber] - 1)
    expect(nachher[neuArt]).toBe((vorher[neuArt] ?? 0) + 1)
    expect(Object.values(nachher).reduce((a, b) => a + b, 0)).toBe(Object.values(vorher).reduce((a, b) => a + b, 0))
  })
  it('Verändern auf extern: das Bauteil verschwindet aus der Stückliste, nicht aus dem Modell', () => {
    const r = rahmen(modell)
    const neu = mitBauteilen(modell, modell.components3D.map((c) => (c.id === r.id ? { ...c, extern: true } : c)))
    expect(bomMap(neu)[r.articleNumber]).toBe(bomMap(modell)[r.articleNumber] - 1)
    expect(neu.components3D.length).toBe(modell.components3D.length)
  })
  it('Entfernen wirkt auf das Teilabbau-Material: ein entferntes Bauteil kann nicht mehr abgebaut werden', () => {
    const r = rahmen(modell)
    const neu = mitBauteilen(modell, modell.components3D.filter((c) => c.id !== r.id))
    const mit = berechneTeilabbau(modell, { art: 'ids', ids: [r.id] }, { gesamtAbbauStunden: 100 })
    const ohne = berechneTeilabbau(neu, { art: 'ids', ids: [r.id] }, { gesamtAbbauStunden: 100 })
    expect(mit.anzahlTeile).toBe(1)
    expect(ohne.anzahlTeile).toBe(0)
  })
  it('BEOBACHTUNG (fachlich so gewollt): Entfernen einzelner Bauteile ändert die Abrechnungsfläche des LV nicht – sie hängt am Modell, nicht an den Bauteilen', () => {
    const r = rahmen(modell)
    const neu = mitBauteilen(modell, modell.components3D.filter((c) => c.id !== r.id))
    const flaeche = (m: CADModel) => positionen(lvAus(m).lv).find((x) => x.titel.startsWith('Arbeits- und Schutzgerüst') && x.einheit === 'm²')!.menge
    expect(flaeche(neu)).toBe(flaeche(modell))
  })
})

describe('6b. addManualPlacement', () => {
  it('mit Kopie wie im CAD: das Ausgangsmodell bleibt unverändert', () => {
    const vorher = modellHash(modell)
    mitKonsole(modell)
    expect(modellHash(modell)).toBe(vorher)
  })
  it('addManualPlacement verändert das übergebene Modell nicht (Bauteil- und Ankerliste bleiben unverändert), liefert aber ein neues Modell mit dem Bauteil', () => {
    const f = modell.fields[0]
    const vorher = modellHash(modell), anzahl = modell.components3D.length, anker = modell.anchors.length
    const neu = addManualPlacement(modell, { type: 'console', positionX: f.positionX, positionY: 4, positionZ: f.positionZ, side: f.side, levelIndex: 1, fieldId: f.id })
    expect(modellHash(modell)).toBe(vorher)
    expect(modell.components3D).toHaveLength(anzahl)
    expect(modell.anchors).toHaveLength(anker)
    expect(neu.components3D.length).toBeGreaterThan(anzahl)
    expect(modellHash(neu)).not.toBe(vorher)
  })
})

// ─── 7. Veraltete Ergebnisse ─────────────────────────────────────────────────
describe('7. Veraltete Ergebnisse', () => {
  it('Ein LV, das vor der Änderung erzeugt wurde, unterscheidet sich nach der Änderung (es wird neu gerechnet, nichts zwischengespeichert)', () => {
    const alt = lvAus(modell).lv
    const neu = mitKonsole(modell)
    const lvNeu = lvAus(neu).lv
    expect(lvNeu.summeNetto).not.toBe(alt.summeNetto)
    // dasselbe Modell nochmals: keine Spuren der Zwischenrechnung
    expect(lvAus(modell).lv).toEqual(alt)
  })
  it('Stückliste und Regelcheck aus einem alten Stand werden nicht von einem neuen Modell überschrieben (reine Funktionen)', () => {
    const vorher = generateBillOfMaterials(modell)
    const neu = mitBauteilen(modell, modell.components3D.slice(0, 500))
    generateBillOfMaterials(neu); pruefeGeruest(neu)
    expect(generateBillOfMaterials(modell)).toEqual(vorher)
  })
  it('Das LV erkennt eine Stückliste aus einem anderen Modellstand: Abweichung, verständlicher Hinweis, Entwurf – kein Fehler, keine stille Vermischung', () => {
    const alt = modell
    const neuM = mitBauteilen(modell, modell.components3D.filter((c) => c.type !== 'diagonal'))   // anderer Modellstand
    const materialAlt = generateBillOfMaterials(alt)
    const lg = calculateLogistics(neuM, materialAlt, 2)
    const lv = erzeugeLeistungsverzeichnis({ model: neuM, materials: materialAlt, aufbauStunden: lg.aufbauStunden, abbauStunden: lg.abbauStunden }, PREISE)
    expect(lv.herkunft?.status).toBe('abweichung')
    expect(lv.herkunft?.hinweise.join(' ')).toMatch(/anderen Modellstand/)
    expect(lv.fehlendeAngaben.join(' ')).toMatch(/anderen Modellstand/)
  })
  it('Ein erzeugtes LV trägt den Modellstand, aus dem es entstand', () => {
    const { lv } = lvAus(modell)
    expect(lv.herkunft?.modellHash).toBe(modellHash(modell))
    expect(lv.herkunft?.status).toBe('ok')
  })
})

// ─── 8. Reproduzierbarkeit ───────────────────────────────────────────────────
describe('8. Reproduzierbarkeit: gleiche Eingaben → gleiche Ergebnisse', () => {
  it('zwei unabhängig erzeugte Modelle aus denselben Eingaben haben denselben Hash', () => {
    const a = generateCADModel(GEBAEUDE, SYSTEM), b = generateCADModel(GEBAEUDE, SYSTEM)
    vi.mocked(generateCADModel).mockClear()
    expect(modellHash(a)).toBe(modellHash(b))
    expect(modellHash(a)).toBe(modellHash(modell))
  })
  it('Stückliste, Logistik, Regelcheck, Pläne, Bauabschnitt, Teilabbau und LV sind bei gleichem Modell identisch', () => {
    const lauf = () => {
      const m = generateCADModel(GEBAEUDE, SYSTEM)
      const { lv, materials, lg } = lvAus(m)
      const kapp = kappeModellAufHoehe(m, 21.5)!
      return JSON.stringify({
        materials, lg, protokoll: pruefeGeruest(m), plaene: erzeugeZeichnungen(m),
        kapp: { oben: kapp.obenM, anteil: kapp.flaechenAnteil, mat: kappeMaterial(materials, m, kapp.model) },
        teil: berechneTeilabbau(m, { art: 'lagen', anzahl: 3 }, { gesamtAbbauStunden: lg.abbauStunden }),
        lv,
      })
    }
    const a = lauf(), b = lauf()
    vi.mocked(generateCADModel).mockClear()
    expect(a).toBe(b)
  })
})
