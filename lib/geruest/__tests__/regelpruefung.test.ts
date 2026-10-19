import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams, type CADModel } from '@/lib/calculations/cad-engine'
import { pruefeGeruest, abschnittsListe, type Pruefprotokoll } from '../regelpruefung'

const niedrig: BuildingParams = {
  lengthM: 12, widthM: 8, heightM: 14, eavesHeightM: 14, roofHeightM: 0, roofForm: 'flachdach',
  floors: 5, floorHeightsM: Array(5).fill(2.8), windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'], lastklasse: 3,
}
const windOk = { windnorm: 'DIN EN 1991-1-4 mit Nationalem Anhang', vrefMs: 25, gelaende: 'III' as const }

function ergebnis(p: Pruefprotokoll, id: string, abschnitt?: string) {
  return p.ergebnisse.filter((r) => r.id === id && (abschnitt === undefined || r.abschnitt === abschnitt))
}

describe('Regelprüfung – Normalfall', () => {
  const model = generateCADModel(niedrig, 'layher-allround')
  const p = pruefeGeruest(model, windOk)

  it('ein sauberes Modell hat Ampel grün und keine Fehler', () => {
    expect(p.anzahl.fehler).toBe(0)
    expect(p.ampel).toBe('ok')
    expect(p.hinweis).toContain('Kein Standsicherheitsnachweis')
  })
  it('jedes Ergebnis hat Regel, Begründung und Quelle', () => {
    for (const r of p.ergebnisse) {
      expect(r.regel.length).toBeGreaterThan(0)
      expect(r.begruendung.length).toBeGreaterThan(0)
      expect(r.quelle.length).toBeGreaterThan(0)
      expect(['ok', 'warnung', 'fehler']).toContain(r.status)
    }
  })
  it('Ankerabstand wird nur gemessen und als Hinweis ausgegeben, nie als Grenzwertprüfung', () => {
    const a = ergebnis(p, 'ANKER_ABSTAND')[0]
    expect(a.art).toBe('hinweis')
    expect(a.begruendung).toMatch(/größter senkrechter Abstand/)
    expect(a.begruendung).toMatch(/nicht hinterlegt/)
  })
})

describe('Regel: Regelausführung der Zulassung', () => {
  it('positiv: Layher Allround bis 24 m ist innerhalb der Grenzen', () => {
    const p = pruefeGeruest(generateCADModel(niedrig, 'layher-allround'), windOk)
    expect(ergebnis(p, 'REGELAUSFUEHRUNG')[0].status).toBe('ok')
  })
  it('negativ: 45 m Höhe ist außerhalb, Fehler mit Zulassungs-Text', () => {
    const hoch = { ...niedrig, heightM: 45, eavesHeightM: 45, floors: 15, floorHeightsM: Array(15).fill(3) }
    const p = pruefeGeruest(generateCADModel(hoch, 'layher-allround'), windOk)
    const r = ergebnis(p, 'REGELAUSFUEHRUNG_GRENZE_LAYHER_ALLROUND')[0]
    expect(r.status).toBe('fehler')
    expect(r.begruendung).toContain('Z-8.1-919')
    expect(p.ampel).toBe('fehler')
  })
  it('ein System ohne hinterlegte Grenzen bekommt einen Hinweis statt einer erfundenen Prüfung', () => {
    const p = pruefeGeruest(generateCADModel(niedrig, 'plettac-sl70'), windOk)
    const r = ergebnis(p, 'REGELAUSFUEHRUNG_UNBEKANNT')[0]
    expect(r.art).toBe('hinweis')
    expect(r.begruendung).toMatch(/keine Grenzen .* hinterlegt/)
    expect(ergebnis(p, 'REGELAUSFUEHRUNG')).toHaveLength(0)
  })
})

describe('Regel: Verankerung', () => {
  it('positiv: Anker vorhanden', () => {
    const p = pruefeGeruest(generateCADModel(niedrig, 'layher-allround'), windOk)
    expect(ergebnis(p, 'ANKER_VORHANDEN')[0].status).toBe('ok')
  })
  it('negativ: ohne Anker Warnung, kein Ankerabstand-Hinweis', () => {
    const model = generateCADModel(niedrig, 'layher-allround')
    model.anchors = []
    const p = pruefeGeruest(model, windOk)
    expect(ergebnis(p, 'ANKER_VORHANDEN')[0].status).toBe('warnung')
    expect(ergebnis(p, 'ANKER_ABSTAND')).toHaveLength(0)
  })
})

describe('Regel: Geländer an Arbeitsbühnen', () => {
  it('positiv: alle Lagen mit Belag haben Geländer', () => {
    const p = pruefeGeruest(generateCADModel(niedrig, 'layher-allround'), windOk)
    expect(ergebnis(p, 'GELAENDER')[0].status).toBe('ok')
  })
  it('negativ: Lage ohne Geländer wird als Fehler genannt', () => {
    const model = generateCADModel(niedrig, 'layher-allround')
    const lageVonId = new Map(model.levels.map((l) => [l.id, l.index]))
    model.components3D = model.components3D.filter((c) => !(c.type === 'railing' && c.levelId && lageVonId.get(c.levelId) === 2))
    const r = ergebnis(pruefeGeruest(model, windOk), 'GELAENDER')[0]
    expect(r.status).toBe('fehler')
    expect(r.begruendung).toContain('Lage 3')
  })
})

describe('Regel: Diagonalen', () => {
  it('positiv: Diagonalen vorhanden', () => {
    const p = pruefeGeruest(generateCADModel(niedrig, 'layher-allround'), windOk)
    expect(ergebnis(p, 'DIAGONALEN')[0].status).toBe('ok')
  })
  it('negativ: ohne jede Diagonale ist das ein Fehler', () => {
    const model = generateCADModel(niedrig, 'layher-allround')
    model.components3D = model.components3D.filter((c) => c.type !== 'diagonal')
    expect(ergebnis(pruefeGeruest(model, windOk), 'DIAGONALEN')[0].status).toBe('fehler')
  })
  it('nicht jedes Feld ausgesteift: nur Hinweis mit Quote, Grenzwert nicht erfunden', () => {
    const model = generateCADModel(niedrig, 'layher-allround')
    const r = ergebnis(pruefeGeruest(model, windOk), 'DIAGONAL_RASTER')
    if (r.length > 0) { expect(r[0].art).toBe('hinweis'); expect(r[0].begruendung).toMatch(/\d+ von \d+ Feldern/) }
  })
})

describe('Regeln: Lastklasse, Wind, Mischsysteme', () => {
  it('Lastklasse fehlt: Warnung; angegeben: ok', () => {
    const ohne = generateCADModel({ ...niedrig, lastklasse: undefined }, 'layher-allround')
    expect(ergebnis(pruefeGeruest(ohne, windOk), 'LASTKLASSE')[0].status).toBe('warnung')
    expect(ergebnis(pruefeGeruest(generateCADModel(niedrig, 'layher-allround'), windOk), 'LASTKLASSE')[0].status).toBe('ok')
  })
  it('Wind-Angaben fehlen: Warnung mit Namen; vollständig: ok', () => {
    const model = generateCADModel(niedrig, 'layher-allround')
    const r = ergebnis(pruefeGeruest(model, { windzone: '2' }), 'WIND_ANGABEN')[0]
    expect(r.status).toBe('warnung')
    expect(r.begruendung).toContain('Referenzwindgeschwindigkeit')
    expect(ergebnis(pruefeGeruest(model, windOk), 'WIND_ANGABEN')[0].status).toBe('ok')
  })
  it('Mischsystem: Warnung nur wenn angegeben', () => {
    const model = generateCADModel(niedrig, 'layher-allround')
    expect(ergebnis(pruefeGeruest(model, { ...windOk, systemmischung: true }), 'SYSTEMMISCHUNG')).toHaveLength(1)
    expect(ergebnis(pruefeGeruest(model, windOk), 'SYSTEMMISCHUNG')).toHaveLength(0)
  })
})

describe('Regel je Abschnitt: Höhe und Typenstatik', () => {
  const gestuft: CADModel = generateCADModel({
    ...niedrig, lengthM: 39, heightM: 45, sections: [
      { laengeM: 9.5, hoeheM: 45, roofForm: 'flachdach', roofHoeheM: 0 },
      { laengeM: 29.5, hoeheM: 20, roofForm: 'flachdach', roofHoeheM: 0 },
      { laengeM: 8, hoeheM: 30, roofForm: 'flachdach', roofHoeheM: 0, geruest: false },
    ],
  }, 'layher-allround')
  const p = pruefeGeruest(gestuft, windOk)

  it('nennt den Abschnitt mit Länge und Höhe', () => {
    const namen = abschnittsListe(gestuft).map((a) => a.name)
    expect(namen[0]).toBe('Abschnitt 1 (9,5 m × 45 m)')
    expect(ergebnis(p, 'TYPENSTATIK_HOEHE', namen[0])[0].status).toBe('warnung')
  })
  it('Abschnitt unter 24 m ist ok', () => {
    const namen = abschnittsListe(gestuft).map((a) => a.name)
    expect(ergebnis(p, 'TYPENSTATIK_HOEHE', namen[1])[0].status).toBe('ok')
  })
  it('Abschnitt ohne Gerüst wird nicht geprüft', () => {
    const namen = abschnittsListe(gestuft).map((a) => a.name)
    expect(ergebnis(p, 'TYPENSTATIK_HOEHE', namen[2])).toHaveLength(0)
  })
  it('die Ampel ignoriert Hinweise, zählt aber Fehler', () => {
    // Hinweis (24 m, nicht regelbar) allein macht nicht rot; die Regelausführung (45 m) schon
    expect(p.ampel).toBe('fehler')
    const nurHinweis = pruefeGeruest(generateCADModel(niedrig, 'plettac-sl70'), windOk)
    expect(nurHinweis.ergebnisse.some((r) => r.art === 'hinweis' && r.status === 'warnung')).toBe(true)
    expect(nurHinweis.ampel).toBe('ok')
  })
})
