import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, type BuildingParams } from '../../calculations/cad-engine'
import { waehleFeld, waehleBereich, erweitereSeite, stockeAuf, wendeAenderungenAn, seitenMasse, istUmrissModell, kantenListe } from '../bereiche'
import { lFormUmriss } from '../../calculations/cad-umriss'

const basis: BuildingParams = {
  lengthM: 12, widthM: 9, heightM: 9, eavesHeightM: 9, roofHeightM: 0, roofForm: 'flachdach',
  floors: 3, floorHeightsM: [3, 3, 3], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
}
const modell = () => generateCADModel(basis, 'layher-allround')

describe('Bereich wählen', () => {
  it('ganze Seite = alle Felder der Seite, alle Lagen', () => {
    const m = modell()
    const r = waehleBereich(m, { seite: 'front' })!
    const erwartet = m.fields.filter((f) => f.side === 'front').length
    expect(r.anzahlFelder).toBe(erwartet)
    expect(r.bauteilIds.length).toBeGreaterThan(0)
  })

  it('ein Stück der Seite wählt weniger Felder als die ganze Seite', () => {
    const m = modell()
    const ganz = waehleBereich(m, { seite: 'front' })!
    const teil = waehleBereich(m, { seite: 'front', vonM: 0, bisM: 4 })!
    expect(teil.anzahlFelder).toBeGreaterThan(0)
    expect(teil.anzahlFelder).toBeLessThan(ganz.anzahlFelder)
    expect(teil.flaecheM2).toBeLessThan(ganz.flaecheM2)
  })

  it('Lagen von/bis begrenzen die Auswahl', () => {
    const m = modell()
    const nurUnten = waehleBereich(m, { seite: 'front', vonLage: 1, bisLage: 1 })!
    expect(nurUnten.anzahlLagen).toBe(1)
    const alle = waehleBereich(m, { seite: 'front' })!
    expect(nurUnten.anzahlFelder).toBeLessThan(alle.anzahlFelder)
  })

  it('zwei getrennte Stücke ergeben zusammen die ganze Seite', () => {
    const m = modell()
    const l = seitenMasse(m, 'front')!.laenge
    const a = waehleBereich(m, { seite: 'front', vonM: 0, bisM: l / 2 })!
    const b = waehleBereich(m, { seite: 'front', vonM: l / 2, bisM: l })!
    const ganz = waehleBereich(m, { seite: 'front' })!
    expect(a.anzahlFelder + b.anzahlFelder).toBe(ganz.anzahlFelder)
    expect(new Set([...a.feldIds, ...b.feldIds]).size).toBe(ganz.anzahlFelder)
  })
})

describe('Felder anhängen', () => {
  it('verlängert die Seite und erzeugt Bauteile für alle Lagen', () => {
    const m = modell()
    const vorher = seitenMasse(m, 'front')!.laenge
    const n = erweitereSeite(m, { art: 'erweitern', seite: 'front', ende: 'ende', anzahl: 2 })
    expect(seitenMasse(n, 'front')!.laenge).toBeGreaterThan(vorher + 2)
    expect(n.components3D.length).toBeGreaterThan(m.components3D.length)
    const lagenAnSeite = new Set(m.fields.filter((f) => f.side === 'front').map((f) => f.levelIndex)).size
    expect(n.fields.length).toBe(m.fields.length + 2 * lagenAnSeite)
    expect(m.fields.length).toBe(modell().fields.length) // Original unverändert
  })

  it('am Anfang anhängen verschiebt den Seitenanfang nach vorn', () => {
    const m = modell()
    const a0 = seitenMasse(m, 'front')!
    const n = erweitereSeite(m, { art: 'erweitern', seite: 'front', ende: 'anfang', anzahl: 1 })
    const a1 = seitenMasse(n, 'front')!
    expect(a1.start).toBeLessThan(a0.start)
    expect(a1.laenge).toBeGreaterThan(a0.laenge)
  })

  it('nur die untersten N Lagen', () => {
    const m = modell()
    const n = erweitereSeite(m, { art: 'erweitern', seite: 'left', ende: 'ende', anzahl: 1, lagen: 2 })
    expect(n.fields.length).toBe(m.fields.length + 2)
  })

  it('neue Felder erhöhen die Stückliste', () => {
    const m = modell()
    const n = erweitereSeite(m, { art: 'erweitern', seite: 'back', ende: 'ende', anzahl: 3 })
    const summe = (x: typeof m) => generateBillOfMaterials(x).reduce((s, i) => s + i.quantity, 0)
    expect(summe(n)).toBeGreaterThan(summe(m))
  })
})

describe('Anker neuer Felder', () => {
  it('angehängte Felder bekommen Anker nach der Regel der Hauptplanung', () => {
    const m = modell()
    const n = erweitereSeite(m, { art: 'erweitern', seite: 'front', ende: 'ende', anzahl: 3 })
    const neu = n.anchors.filter((a) => !m.anchors.some((b) => b.id === a.id))
    expect(neu.length).toBeGreaterThan(0)
    expect(neu.every((a) => a.side === 'front' && a.positionY > 0)).toBe(true)
    // gleicher Abstand quer zur Fassade wie bei den vorhandenen Ankern
    const alt = m.anchors.find((a) => a.side === 'front')!
    expect(neu[0].positionZ).toBeCloseTo(alt.positionZ, 2)
  })
  it('niedriges Gebäude (bis 6 m) bekommt keine Anker', () => {
    const m = generateCADModel({ ...basis, heightM: 5, eavesHeightM: 5, floors: 2, floorHeightsM: [2.5, 2.5] }, 'layher-allround')
    const n = erweitereSeite(m, { art: 'erweitern', seite: 'front', ende: 'ende', anzahl: 2 })
    expect(n.anchors.length).toBe(m.anchors.length)
  })
})

describe('Bereich aufstocken', () => {
  it('setzt über dem Bereich weitere Lagen auf', () => {
    const m = modell()
    const lagenVorher = new Set(m.levels.map((l) => l.index)).size
    const n = stockeAuf(m, { art: 'aufstocken', seite: 'front', vonM: 0, bisM: 4, lagen: 2 })
    expect(new Set(n.levels.map((l) => l.index)).size).toBe(lagenVorher + 2)
    // die neuen Felder hängen an der Lage ihrer eigenen Seite
    for (const l of n.levels) for (const f of l.fields) expect(l.id.includes(f.side)).toBe(true)
    const neu = n.fields.filter((f) => !m.fields.some((g) => g.id === f.id))
    expect(neu.length).toBeGreaterThan(0)
    expect(neu.every((f) => f.levelIndex >= lagenVorher)).toBe(true)
    // neue Felder stehen höher als alle alten
    const maxAlt = Math.max(...m.levels.map((l) => l.topY))
    expect(Math.min(...neu.map((f) => f.positionY))).toBeGreaterThanOrEqual(maxAlt - 0.01)
  })
})

describe('Änderungsliste', () => {
  it('gleiche Eingaben ergeben gleiche Bauteil-IDs', () => {
    const liste = [{ art: 'erweitern' as const, seite: 'front' as const, ende: 'ende' as const, anzahl: 1 }]
    const a = wendeAenderungenAn(modell(), liste).components3D.map((c) => c.id)
    const b = wendeAenderungenAn(modell(), liste).components3D.map((c) => c.id)
    expect(a).toEqual(b)
  })
})

describe('Projektdatei', () => {
  it('speichert und liest Bereichsänderungen', async () => {
    const { erzeugeProjektdatei, liesProjektdatei } = await import('../projektdatei')
    const { bereinigeStatikDaten } = await import('../../statik-daten')
    const bereiche = [
      { art: 'erweitern' as const, seite: 'front' as const, ende: 'ende' as const, anzahl: 2, feldlaengeM: 2.5 },
      { art: 'aufstocken' as const, seite: 'left' as const, lagen: 2, vonM: 1, bisM: 4 },
    ]
    const datei = erzeugeProjektdatei({ building: basis, systemId: 'layher-allround', statikDaten: bereinigeStatikDaten(undefined), notizen: [], bereiche })
    const e = liesProjektdatei(JSON.stringify(datei))
    expect(e.ok).toBe(true)
    if (e.ok) expect(e.daten.bereiche).toEqual(bereiche)
  })
  it('verwirft ungültige Bereichsänderungen', async () => {
    const { erzeugeProjektdatei, liesProjektdatei } = await import('../projektdatei')
    const { bereinigeStatikDaten } = await import('../../statik-daten')
    const datei = erzeugeProjektdatei({ building: basis, systemId: 'layher-allround', statikDaten: bereinigeStatikDaten(undefined), notizen: [] })
    const roh = JSON.parse(JSON.stringify(datei))
    roh.bereiche = [{ art: 'erweitern', seite: 'oben', ende: 'ende', anzahl: 1 }, { art: 'erweitern', seite: 'front', ende: 'ende', anzahl: 9999 }]
    const e = liesProjektdatei(JSON.stringify(roh))
    expect(e.ok).toBe(true)
    if (e.ok) { expect(e.daten.bereiche).toBeUndefined(); expect(e.verworfen.length).toBe(2) }
  })
})

describe('Feld per Klick wählen', () => {
  const m = modell()
  const bauteil = m.components3D.find((c) => c.id.startsWith('deck-field-front-1-'))!
  it('dieses Feld ist kleiner als Spalte, Spalte kleiner als ganze Lage', () => {
    const feld = waehleFeld(m, bauteil.id, 'feld')!
    const spalte = waehleFeld(m, bauteil.id, 'spalte')!
    const lage = waehleFeld(m, bauteil.id, 'lage')!
    expect(feld.anzahlFelder).toBe(1)
    expect(spalte.anzahlFelder).toBe(new Set(m.fields.filter((f) => f.side === 'front').map((f) => f.levelIndex)).size)
    expect(lage.anzahlFelder).toBe(m.fields.filter((f) => f.side === 'front' && f.levelIndex === 1).length)
    expect(feld.bauteilIds.length).toBeLessThan(spalte.bauteilIds.length)
    expect(feld.bauteilIds).toContain(bauteil.id)
  })
  it('Bauteil ohne Feld liefert null', () => {
    expect(waehleFeld(m, 'gibt-es-nicht', 'feld')).toBeNull()
  })
})

describe('Umriss-Modus (Gebäudekanten)', () => {
  const u = () => generateCADModel({ ...basis, sides: ['front'], umriss: lFormUmriss(12, 9, 5, 4) }, 'layher-allround')
  it('erkennt den Umriss-Modus und listet die Kanten', () => {
    const m = u()
    expect(istUmrissModell(m)).toBe(true)
    expect(istUmrissModell(modell())).toBe(false)
    expect(kantenListe(m)).toEqual([0, 1, 2, 3, 4, 5])
  })
  it('ein Stück einer Kante entfernen wählt weniger als die ganze Kante', () => {
    const m = u()
    const ganz = waehleBereich(m, { seite: 'front', kante: 0 })!
    const teil = waehleBereich(m, { seite: 'front', kante: 0, vonM: 0, bisM: 4 })!
    expect(ganz.anzahlFelder).toBe(m.fields.filter((f) => f.kante === 0).length)
    expect(teil.anzahlFelder).toBeGreaterThan(0)
    expect(teil.anzahlFelder).toBeLessThan(ganz.anzahlFelder)
    expect(teil.feldIds.every((id) => m.fields.find((f) => f.id === id)?.kante === 0)).toBe(true)
  })
  it('Aufstocken einer Kante setzt Felder nur auf dieser Kante und verändert andere nicht', () => {
    const m = u()
    const hoechst = Math.max(...m.fields.map((f) => f.levelIndex))
    const neu = stockeAuf(m, { art: 'aufstocken', seite: 'front', kante: 2, lagen: 1 })
    const dazu = neu.fields.filter((f) => !m.fields.includes(f))
    expect(dazu.length).toBe(m.fields.filter((f) => f.kante === 2 && f.levelIndex === hoechst).length)
    expect(dazu.every((f) => f.kante === 2 && f.levelIndex === hoechst + 1)).toBe(true)
    expect(neu.components3D.length).toBeGreaterThan(m.components3D.length)
    expect(new Set(neu.components3D.map((c) => c.id)).size).toBe(neu.components3D.length)
  })
})

describe('Keine doppelten Bauteile', () => {
  it('Felder anhängen im Rechteck erzeugt keine doppelten Bauteil-IDs und je Anker genau ein Ankerbauteil', () => {
    const m = modell()
    const neu = erweitereSeite(m, { art: 'erweitern', seite: 'front', ende: 'ende', anzahl: 2 })
    expect(new Set(neu.components3D.map((c) => c.id)).size).toBe(neu.components3D.length)
    expect(neu.components3D.filter((c) => c.type === 'anchor').length).toBe(neu.anchors.length)
  })
})
