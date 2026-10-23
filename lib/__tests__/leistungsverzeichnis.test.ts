import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, calculateLogistics, type BuildingParams } from '../calculations/cad-engine'
import { rechteckUmriss } from '../calculations/cad-umriss'
import { erzeugeLeistungsverzeichnis, breitenklasse, breitenklasseZuSchmal, LV_STANDARD_EINGABEN, LASTKLASSEN, type LvEingaben } from '../leistungsverzeichnis'
import type { MaterialItem } from '@/types/scaffold'

const gebaeude: BuildingParams = {
  lengthM: 10, widthM: 8, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach',
  floors: 4, floorHeightsM: [3, 3, 3, 3], windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front'], umriss: rechteckUmriss(10, 8),
}

function quelle() {
  const model = generateCADModel(gebaeude, 'layher-allround')
  // Test-Materialwert: jeder Artikel 10 € (nur für den Test, keine echten Preise)
  const materials: MaterialItem[] = generateBillOfMaterials(model).map((m) => ({ ...m, unitPrice: 10, totalPrice: m.quantity * 10 }))
  const log = calculateLogistics(model, materials, 2.0)
  return { model, materials, aufbauStunden: log.aufbauStunden, abbauStunden: log.abbauStunden }
}

const mitPreisen: LvEingaben = { ...LV_STANDARD_EINGABEN, stundensatzFach: 50, stundensatzHelfer: 40, mietsatzProzentJeWoche: 1, zuschlagProzent: 10, statikPauschale: 900 }
const grund: LvEingaben = { ...mitPreisen, stil: 'grundstandzeit' }
const g = (lv: ReturnType<typeof erzeugeLeistungsverzeichnis>) => lv.titel[1].positionen

describe('Leistungsverzeichnis', () => {
  it('Breitenklasse nach Gerüstbreite', () => {
    expect(breitenklasse(0.73)).toBe('W06')
    expect(breitenklasse(0.6)).toBe('W06')
    expect(breitenklasse(0.9)).toBe('W09')
    expect(breitenklasse(1.09)).toBe('W09')
    expect(breitenklasse(1.2)).toBe('W12')
    expect(breitenklasse(0.5)).toBe('kleiner als W06')
    expect(breitenklasse(0)).toBe('unbekannt')
  })

  it('Positionen mit Mengen aus dem CAD, Treppe und Vorhaltung', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), grund)
    const q = quelle()
    const t1 = g(lv)
    expect(t1[0].nr).toBe('02.1')
    expect(t1[0].einheit).toBe('m²')
    expect(t1[0].menge).toBeCloseTo(q.model.totalAreaM2, 2)
    // Standzeit 8 Wochen → 4 Wochen Vorhaltung über die Grundstandzeit
    const vorh = t1.find((p) => p.titel.startsWith('Verlängerung der Vorhaltung Fassadengerüst'))!
    expect(vorh.einheit).toBe('m²Wo')
    expect(vorh.menge).toBeCloseTo(q.model.totalAreaM2 * 4, 1)
    // Treppenturm ist im Modell (Gebäude > 1 Lage) → Position in Stück
    const tr = t1.find((p) => p.einheit === 'St')!
    expect(tr.menge).toBe(1)
  })

  it('Preise: EP × Menge = GP, Summen, MwSt, brutto – alles gerundet auf Cent', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), mitPreisen)
    for (const t of lv.titel) {
      for (const p of t.positionen) {
        expect(p.ep).toBeGreaterThan(0)
        expect(p.gp).toBeCloseTo(Math.round(p.menge * p.ep * 100) / 100, 2)
      }
      expect(t.summe).toBeCloseTo(t.positionen.reduce((s, p) => s + p.gp, 0), 2)
    }
    expect(lv.summeNetto).toBeCloseTo(lv.titel.reduce((s, t) => s + t.summe, 0), 2)
    expect(lv.mwst).toBeCloseTo(lv.summeNetto * 0.19, 2)
    expect(lv.summeBrutto).toBeCloseTo(lv.summeNetto + lv.mwst, 2)
    expect(lv.fehlendeAngaben).toEqual([])
  })

  it('Stundenlohn: Stunden × Stundensatz', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), mitPreisen)
    const [fach, helfer] = lv.titel[2].positionen
    expect(fach.gp).toBe(16 * 50)
    expect(helfer.gp).toBe(16 * 40)
  })

  it('Vorhaltung entfällt bei Standzeit ≤ Grundstandzeit', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), { ...grund, gesamtStandzeitWochen: 4 })
    expect(g(lv).some((p) => p.einheit.endsWith('Wo'))).toBe(false)
  })

  it('Ohne Eingaben: keine erfundenen Preise, Pflichtangaben werden gemeldet', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), LV_STANDARD_EINGABEN)
    expect(lv.summeNetto).toBe(0)
    expect(lv.fehlendeAngaben.join(' ')).toMatch(/Stundensatz Facharbeiter/)
    expect(lv.fehlendeAngaben.join(' ')).toMatch(/Mietsatz/)
  })

  it('Ohne Lagerpreise meldet das LV den fehlenden Materialwert', () => {
    const q = quelle()
    const ohne = { ...q, materials: q.materials.map((m) => ({ ...m, unitPrice: 0, totalPrice: 0 })) }
    const lv = erzeugeLeistungsverzeichnis(ohne, mitPreisen)
    expect(lv.fehlendeAngaben.join(' ')).toMatch(/Materialwert/)
  })

  it('Kopf zeigt Lastklasse und Breitenklasse im Langtext', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), { ...mitPreisen, lastklasse: 4 })
    const text = g(lv)[0].text.join(' ')
    expect(text).toMatch(/Lastklasse 4/)
    expect(text).toMatch(/SW06/)
    expect(LASTKLASSEN[4]).toBe(3)
  })

  it('Abrechnungsregeln: Höhenzuschlag, Öffnungsabzug, Giebel-Zulage, Einbauhöhe', () => {
    const q = quelle()
    const basis = erzeugeLeistungsverzeichnis(q, grund)
    const f0 = g(basis)[0].menge
    expect(g(basis).find((p) => p.titel.startsWith('Einrüsten der Giebelflächen'))).toBeUndefined()
    const lv = erzeugeLeistungsverzeichnis(q, { ...grund, hoehenZuschlagM: 1, oeffnungenAbzugM2: 5, giebelflaecheM2: 25, fanggeruestHoeheM: 1.2 })
    const p = g(lv)
    expect(p[0].menge).toBeCloseTo(f0 + q.model.totalLengthM - 5, 1)
    const giebel = p.find((x) => x.titel.startsWith('Einrüsten der Giebelflächen'))!
    expect(giebel.menge).toBe(25)
    expect(giebel.ep).toBe(p[0].ep)
    // Vorhaltung umfasst die Giebelflächen
    const vor0 = g(basis).find((x) => x.titel.startsWith('Verlängerung der Vorhaltung Fassadengerüst'))!.menge
    const vor1 = p.find((x) => x.titel.startsWith('Verlängerung der Vorhaltung Fassadengerüst'))!.menge
    expect(vor1).toBeGreaterThan(vor0)
    expect(g(basis)[0].menge).toBeCloseTo(q.model.totalAreaM2, 1)
  })

  describe('Aufbau wie ZECH/BVG: Aufbau · Vorhaltung · Abbau getrennt', () => {
    it('Reihenfolge, Einheiten und Mengen (Vorhaltung = Menge × Gesamtstandzeit)', () => {
      const q = quelle()
      const lv = erzeugeLeistungsverzeichnis(q, { ...mitPreisen, gesamtStandzeitWochen: 16 })
      const p = g(lv)
      const idx = (start: string) => p.findIndex((x) => x.titel.startsWith(start))
      const auf = p[idx('Arbeits- und Schutzgerüst, Fassadengerüst – Aufbau')]
      const vorh = p[idx('Vorhaltung Arbeits- und Schutzgerüst')]
      const ab = p[idx('Arbeits- und Schutzgerüst – Abbau')]
      expect(auf.einheit).toBe('m²')
      expect(vorh.einheit).toBe('m²Wo')
      expect(vorh.menge).toBeCloseTo(Math.round(auf.menge * 16 * 100) / 100, 2)
      expect(ab.menge).toBe(auf.menge)
      expect(idx('Arbeits- und Schutzgerüst, Fassadengerüst – Aufbau')).toBeLessThan(idx('Vorhaltung Arbeits- und Schutzgerüst'))
      expect(idx('Vorhaltung Arbeits- und Schutzgerüst')).toBeLessThan(idx('Arbeits- und Schutzgerüst – Abbau'))
      // Treppe: Aufbau in St, Vorhaltung in StWo
      expect(p.find((x) => x.titel === 'Vorhaltung Treppenaufgang')!.einheit).toBe('StWo')
    })
    it('Aufbau-EP aus Aufbaustunden, Abbau-EP aus Abbaustunden (Abbau kürzer)', () => {
      const lv = erzeugeLeistungsverzeichnis(quelle(), mitPreisen)
      const p = g(lv)
      const auf = p.find((x) => x.titel.endsWith('Fassadengerüst – Aufbau'))!
      const ab = p.find((x) => x.titel === 'Arbeits- und Schutzgerüst – Abbau')!
      expect(auf.ep).toBeGreaterThan(0)
      expect(ab.ep).toBeGreaterThan(0)
      expect(ab.ep).toBeLessThan(auf.ep)
    })
    it('Textbausteine: Klassen, Wandabstand, Untergrund, Aufstellung, Höhe', () => {
      const lv = erzeugeLeistungsverzeichnis(quelle(), { ...mitPreisen, lastklasse: 4, hoehenklasse: 'H1', untergrundBefestigung: 'Mauerwerk' })
      const t = g(lv)[0].text.join(' ')
      expect(t).toMatch(/Lastklasse 4 \(3 kN\/m²\)/)
      expect(t).toMatch(/Höhenklasse H1/)
      expect(t).toMatch(/Abstand zum Gebäude 0,30 m/)
      expect(t).toMatch(/Untergrund der Befestigung Mauerwerk/)
      expect(t).toMatch(/Aufstellung: auf befestigtem Gelände/)
      expect(t).toMatch(/Modulgerüst/)
      expect(t).toMatch(/Abbau und Vorhaltung werden gesondert vergütet/)
    })
    it('Statik-Pauschale in Titel 01, fehlt sie → Hinweis', () => {
      const lv = erzeugeLeistungsverzeichnis(quelle(), mitPreisen)
      expect(lv.titel[0].positionen[0]).toMatchObject({ nr: '01.1', einheit: 'psch', menge: 1, ep: 900, gp: 900 })
      const ohne = erzeugeLeistungsverzeichnis(quelle(), { ...mitPreisen, statikPauschale: 0 })
      expect(ohne.fehlendeAngaben.join(' ')).toMatch(/statische Berechnung/)
    })
    it('Zusatzleistungen: Dachfang (m), Seitenschutz (m), Überbrückung (St) – je Aufbau, Vorhaltung (Wochen), Abbau', () => {
      const z = (art: 'dachfang' | 'seitenschutz' | 'ueberbrueckung', menge: number) => ({ art, menge, epAuf: 5, epVorh: 0.5, epAb: 3 })
      const lv = erzeugeLeistungsverzeichnis(quelle(), { ...mitPreisen, gesamtStandzeitWochen: 16, zusatz: [z('dachfang', 27), z('seitenschutz', 27), z('ueberbrueckung', 1)] })
      const p = g(lv)
      expect(p.find((x) => x.titel.startsWith('Dachfanggerüst') && x.titel.endsWith('Aufbau'))).toMatchObject({ einheit: 'm', menge: 27, ep: 5 })
      expect(p.find((x) => x.titel === 'Vorhaltung Dachfanggerüst DIN 4420-1')).toMatchObject({ einheit: 'mWo', menge: 432, ep: 0.5 })
      expect(p.find((x) => x.titel.startsWith('Vorhaltung Überbrückung'))).toMatchObject({ einheit: 'StWo', menge: 16 })
      expect(p.find((x) => x.titel.startsWith('Dachfanggerüst') && x.titel.endsWith('Abbau'))).toMatchObject({ einheit: 'm', ep: 3 })
    })
    it('Strahlnetze (m²), Aufzug (St) und Bauzaun (m) nach dem Muster-LV Kirche', () => {
      const z = (art: 'strahlnetze' | 'aufzug' | 'bauzaun', menge: number) => ({ art, menge, epAuf: 4, epVorh: 0.2, epAb: 2 })
      const lv = erzeugeLeistungsverzeichnis(quelle(), { ...mitPreisen, gesamtStandzeitWochen: 16, zusatz: [z('strahlnetze', 500), z('aufzug', 1), z('bauzaun', 160)] })
      const p = g(lv)
      expect(p.find((x) => x.titel === 'Strahlnetze – Aufbau')).toMatchObject({ einheit: 'm²', menge: 500, ep: 4 })
      expect(p.find((x) => x.titel === 'Vorhaltung Strahlnetze')).toMatchObject({ einheit: 'm²Wo', menge: 8000, ep: 0.2 })
      expect(p.find((x) => x.titel === 'Vorhaltung Personen- und Lastenaufzug')).toMatchObject({ einheit: 'StWo', menge: 16 })
      expect(p.find((x) => x.titel === 'Bauzaunelemente – Abbau')).toMatchObject({ einheit: 'm', menge: 160, ep: 2 })
      const aufbau = lv.titel.flatMap((t) => t.positionen).find((x) => x.titel === 'Personen- und Lastenaufzug – Aufbau')!
      expect(aufbau.text.join(' ')).toContain('nach Angabe des Auftraggebers')
    })
    it('Zusatzleistung ohne EP wird als fehlende Angabe gemeldet', () => {
      const lv = erzeugeLeistungsverzeichnis(quelle(), { ...mitPreisen, zusatz: [{ art: 'dachfang', menge: 10, epAuf: 0, epVorh: 0, epAb: 0 }, ...LV_STANDARD_EINGABEN.zusatz.slice(1)] })
      expect(lv.fehlendeAngaben.join(' ')).toMatch(/Dachfanggerüst/)
    })
    it('Stundenlohn: Anfahrtspauschale nur mit Preis', () => {
      expect(erzeugeLeistungsverzeichnis(quelle(), mitPreisen).titel[2].positionen).toHaveLength(2)
      const lv = erzeugeLeistungsverzeichnis(quelle(), { ...mitPreisen, anfahrtspauschale: 80, anfahrtAnzahl: 3 })
      expect(lv.titel[2].positionen[2]).toMatchObject({ einheit: 'St', menge: 3, ep: 80, gp: 240 })
    })
  })

  it('Handeingaben: eigene Stunden, Menge und EP ersetzen die berechneten Werte', () => {
    const q = quelle()
    const basis = erzeugeLeistungsverzeichnis(q, mitPreisen)
    const aufbau = g(basis).find((p) => p.titel.endsWith('Fassadengerüst – Aufbau'))!
    expect(aufbau.manuell).toBeUndefined()

    // Doppelte Aufbaustunden → Aufbau-EP verdoppelt sich (Zuschlag und Stundensatz bleiben)
    const mehr = erzeugeLeistungsverzeichnis(q, { ...mitPreisen, aufbauStundenManuell: q.aufbauStunden * 2 })
    const a2 = g(mehr).find((p) => p.titel === aufbau.titel)!
    expect(a2.ep).toBeCloseTo(aufbau.ep * 2, 1)
    const ab1 = g(basis).find((p) => p.titel === 'Arbeits- und Schutzgerüst – Abbau')!
    expect(g(mehr).find((p) => p.titel === ab1.titel)!.ep).toBeCloseTo(ab1.ep, 2)

    // EP und Menge einer Position von Hand: GP = Menge × EP, Summen folgen, Markierung gesetzt
    const lv = erzeugeLeistungsverzeichnis(q, { ...mitPreisen, epUeberschreibung: { [aufbau.titel]: 7.5 }, mengeUeberschreibung: { [aufbau.titel]: 100 } })
    const p = g(lv).find((x) => x.titel === aufbau.titel)!
    expect(p.ep).toBe(7.5)
    expect(p.menge).toBe(100)
    expect(p.gp).toBe(750)
    expect(p.manuell).toEqual({ ep: true, menge: true })
    expect(p.berechnet).toEqual({ ep: aufbau.ep, menge: aufbau.menge })
    expect(lv.summeNetto).not.toBe(basis.summeNetto)
    expect(lv.annahmen.some((a) => a.includes('von Hand geändert'))).toBe(true)
  })

  it('Stundenlohn-Positionen lassen sich ebenfalls von Hand anpassen', () => {
    const lv = erzeugeLeistungsverzeichnis(quelle(), { ...mitPreisen, mengeUeberschreibung: { 'Fachmonteurstunden für nicht vertraglich geregelte Leistungen': 40 } })
    const p = lv.titel[2].positionen[0]
    expect(p.menge).toBe(40)
    expect(p.gp).toBe(2000)
  })

  describe('Breitenklasse-Warnung', () => {
  it('warnt, wenn die geforderte Klasse breiter ist als das CAD-Gerüst', () => {
    expect(breitenklasseZuSchmal('W09', 0.73)).toBe(true)
    expect(breitenklasseZuSchmal('w09', 0.9)).toBe(false)
    expect(breitenklasseZuSchmal('W06', 0.73)).toBe(false)
    expect(breitenklasseZuSchmal('', 0.73)).toBe(false)
    expect(breitenklasseZuSchmal('W09', 0)).toBe(false)
  })
})

describe('Stil „Statiker-LV“ (Wuppertal)', () => {
    const stat: LvEingaben = { ...mitPreisen, stil: 'statiker', gesamtStandzeitWochen: 50, lastklasse: 4, breitenklasseManuell: 'w09', geruestHoeheAusschreibungM: 32 }
    const alle = (lv: ReturnType<typeof erzeugeLeistungsverzeichnis>) => lv.titel.flatMap((t) => t.positionen)

    it('hat die Titel und Positionsnummern des Statiker-LV', () => {
      const lv = erzeugeLeistungsverzeichnis(quelle(), stat)
      expect(lv.titel.map((t) => t.nrText)).toEqual(['01', '02', '03', '11', '12'])
      expect(lv.titel[0].positionen).toHaveLength(14) // 01.1–01.13 + Vorhaltung Verkehrssicherung (im Statiker-LV doppelt als „01.10“ beziffert, hier 01.14)
      expect(lv.titel[1].positionen).toHaveLength(26)
      expect(lv.titel[2].positionen.map((p) => p.nr)).toEqual(['03.01', '03.02', '03.03', '03.04', '03.05', '03.06'])
      expect(lv.titel[3].positionen[0].nr).toBe('11.1')
      expect(lv.titel[4].positionen).toHaveLength(5)
      expect(lv.titel[1].positionen[0].titel).toBe('Arbeitsgerüste mit integrierten Traggerüsten am Turmschaft bis 32 m Höhe')
      const nummern = alle(lv).map((p) => p.nr)
      expect(new Set(nummern).size).toBe(nummern.length)
      const titel = alle(lv).map((p) => p.titel)
      expect(new Set(titel).size).toBe(titel.length)
    })

    it('Standardpreise aus der Datenpflege füllen Positionen ohne CAD-Wert, Handeingaben gewinnen', () => {
      const ohne = erzeugeLeistungsverzeichnis(quelle(), stat)
      const std: LvEingaben = { ...stat, standzeitBa2Wochen: 50, standardpreise: { 'Haltestellenausstattung 2. BA': { ep: 100, epJeWoche: 2 }, 'Baustellen-Container-WC': { ep: 250 } } }
      const mit = erzeugeLeistungsverzeichnis(quelle(), std)
      const pos = (lv: typeof ohne, t: string) => alle(lv).find((p) => p.titel === t)!
      expect(pos(ohne, 'Haltestellenausstattung 2. BA').ep).toBe(0)
      expect(pos(mit, 'Haltestellenausstattung 2. BA').ep).toBe(100)
      expect(pos(mit, 'Baustellen-Container-WC').ep).toBe(250)
      const vh = alle(mit).find((p) => p.titel.startsWith('Vorhaltung zur Vorposition') && p.nr === pos(mit, 'Haltestellenausstattung 2. BA').nr.replace(/\.(\d+)$/, (_m, n) => '.' + (Number(n) + 1)))
      expect(vh?.ep).toBe(2)
      expect(vh?.menge).toBe(500) // 10 Haltestellen × 50 Wochen (Standzeit 2. BA)
      const hand = erzeugeLeistungsverzeichnis(quelle(), { ...std, epUeberschreibung: { 'Baustellen-Container-WC': 99 } })
      expect(pos(hand, 'Baustellen-Container-WC').ep).toBe(99)
      expect(mit.summeNetto).toBeGreaterThan(ohne.summeNetto)
    })

    it('Vorhaltung aus Standardpreisen: bei Menge 0 nichts, 2. BA nur mit deren Standzeit', () => {
      const std: LvEingaben = { ...stat, gesamtStandzeitWochen: 2, standzeitBa2Wochen: 0, standardpreise: { 'Bauzauntor': { ep: 60, epJeWoche: 3 }, 'Personen- und Lastenaufzug 500/800kg 2.BA': { ep: 1800, epJeWoche: 80 }, 'Baustellen-Container-WC': { epJeWoche: 25 } } }
      const lv = erzeugeLeistungsverzeichnis(quelle(), std)
      const pos = alle(lv)
      const nach = (t: string) => { const i = pos.findIndex((p) => p.titel === t); return pos[i + 1] }
      expect(nach('Bauzauntor').menge).toBe(0) // 0 Tore → keine Vorhaltung
      expect(nach('Personen- und Lastenaufzug 500/800kg 2.BA H = ca. 21,5m').menge).toBe(0) // Standzeit 2. BA nicht eingetragen
      expect(nach('Baustellen-Container-WC').menge).toBe(2) // 1 Stück × 2 Wochen
      expect(nach('Baustellen-Container-WC').ep).toBe(25)
      const mit = erzeugeLeistungsverzeichnis(quelle(), { ...std, standzeitBa2Wochen: 3 })
      const p2 = alle(mit); const i = p2.findIndex((p) => p.titel === 'Personen- und Lastenaufzug 500/800kg 2.BA H = ca. 21,5m')
      expect(p2[i + 1].menge).toBe(3)
    })

    it('Wochenmieten für Baustelleneinrichtung, Gerüst, Schutzdach und Treppenturm aus den Standardpreisen (ohne Mietsatz)', () => {
      const std: LvEingaben = {
        ...stat, gesamtStandzeitWochen: 16, mietsatzProzentJeWoche: 0,
        standardpreise: {
          Baustelleneinrichtung: { epJeWoche: 1 },
          'Arbeitsgerüste mit integrierten': { epJeWoche: 400 },
          Schutzdächer: { ep: 400, epJeWoche: 10 },
          'Gerüsttreppenturm 1. BA': { ep: 2400, epJeWoche: 80 },
        },
      }
      const pos = alle(erzeugeLeistungsverzeichnis(quelle(), std))
      const nach = (start: string) => { const i = pos.findIndex((p) => p.titel.startsWith(start)); return { vor: pos[i], vorh: pos[i + 1] } }
      const be = nach('Baustelleneinrichtung')
      expect(be.vorh.ep).toBe(1); expect(be.vorh.menge).toBe(16)
      const g = nach('Arbeitsgerüste mit integrierten')
      expect(g.vorh.ep).toBe(400); expect(g.vorh.menge).toBe(16)
      const t = nach('Gerüsttreppenturm 1. BA')
      if (t.vor.menge > 0) { expect(t.vorh.ep).toBe(80); expect(t.vorh.menge).toBe(16 * t.vor.menge) }
      const sd = nach('Schutzdächer')
      if (sd.vor.menge > 0) { expect(sd.vorh.ep).toBe(10); expect(sd.vorh.menge).toBe(16 * sd.vor.menge) }
    })

    it('Faktor in % gilt für alle Positionen außer Vorhaltung und Stundenlohn; Standard 100 ändert nichts', () => {
      const basis = erzeugeLeistungsverzeichnis(quelle(), { ...stat, pauschalFaktorProzent: 100 })
      const f80 = erzeugeLeistungsverzeichnis(quelle(), { ...stat, pauschalFaktorProzent: 80 })
      const b = alle(basis); const f = alle(f80)
      expect(f.length).toBe(b.length)
      b.forEach((p, i) => {
        const q = f[i]
        if (p.titel.startsWith('Vorhaltung') || p.nr.startsWith('12.')) { expect(q.gp).toBe(p.gp); expect(q.faktorProzent).toBeUndefined() }
        else { expect(q.faktorProzent).toBe(80); expect(q.gp).toBeCloseTo(Math.round(p.menge * p.ep * 0.8 * 100) / 100, 2) }
      })
      expect(b.every((p) => p.faktorProzent === undefined)).toBe(true)
      expect(f80.summeNetto).toBeLessThan(basis.summeNetto)
    })

    it('Faktor je Position: von Hand > Datenpflege > allgemeiner Faktor', () => {
      const std = { 'Bauzaun': { ep: 10, faktorProzent: 50 } }
      const lv = alle(erzeugeLeistungsverzeichnis(quelle(), { ...stat, pauschalFaktorProzent: 80, standardpreise: std }))
      const f = (t: string) => lv.find((p) => p.titel === t)!
      expect(f('Bauzaun').faktorProzent).toBe(50) // Datenpflege schlägt allgemeinen Faktor
      expect(f('Verkehrssicherung').faktorProzent).toBe(80) // allgemeiner Faktor
      const hand = alle(erzeugeLeistungsverzeichnis(quelle(), { ...stat, pauschalFaktorProzent: 80, standardpreise: std, faktorUeberschreibung: { Bauzaun: 90, Verkehrssicherung: 100 } }))
      const h = (t: string) => hand.find((p) => p.titel === t)!
      expect(h('Bauzaun').faktorProzent).toBe(90)
      expect(h('Bauzaun').manuell?.faktor).toBe(true)
      expect(h('Verkehrssicherung').faktorProzent).toBeUndefined() // 100 von Hand = kein Faktor
      expect(h('Verkehrssicherung').manuell?.faktor).toBe(true)
      expect(h('Bauzaun').berechnet?.faktor).toBe(50)
      expect(lv.find((p) => p.titel.startsWith('Vorhaltung'))!.faktorProzent).toBeUndefined()
    })

    it('Modelldaten im LV: Dachfläche, Überbrückungslänge, Schutzdach-Größe, Aufzug-Tragkraft', () => {
      const q = quelle()
      const ohne = alle(erzeugeLeistungsverzeichnis(q, stat))
      const text = (lv: typeof ohne, start: string) => lv.find((p) => p.titel.startsWith(start))!.text.join(' ')
      expect(text(ohne, 'Schutz von Dachflächen')).toContain('Nicht aus dem CAD')
      expect(text(ohne, 'Personen- und Lastenaufzug 500/800kg 1.BA')).toContain('500 kg (Personen) / 800 kg (Lasten)')
      const mit = alle(erzeugeLeistungsverzeichnis({ ...q, model: { ...q.model, building: { ...q.model.building, anbauDaecher: [{ seite: 'left', flaecheM2: 12.5, breiteM: 5, tiefeM: 2.5, hoeheM: 4 }], geruestOptionen: { ...(q.model.building.geruestOptionen ?? {}), aufzug: { seite: 'front', gemietet: false, tragkraftPersonenKg: 400, tragkraftLastKg: 600 } } } } } as typeof q, stat))
      expect(text(mit, 'Schutz von Dachflächen')).toContain('12,50 m²')
      expect(text(mit, 'Überbrückungen')).toContain('5,00 m')
      expect(text(mit, 'Personen- und Lastenaufzug 500/800kg 1.BA')).toContain('400 kg (Personen) / 600 kg (Lasten)')
      const sd = ohne.find((p) => p.titel.startsWith('Schutzdächer'))!
      if (sd.menge > 0) expect(sd.text.join(' ')).toMatch(/je ca\. \d+,\d\d m × \d+,\d\d m/)
    })

    it('Position streichen: Menge 0, Nummer bleibt, Vorhaltung der Position entfällt mit', () => {
      const std: LvEingaben = { ...stat, standardpreise: { 'Baustellen-Container-WC': { ep: 250, epJeWoche: 52 } } }
      const ohne = alle(erzeugeLeistungsverzeichnis(quelle(), std))
      const i0 = ohne.findIndex((p) => p.titel === 'Baustellen-Container-WC')
      expect(ohne[i0].menge).toBe(1); expect(ohne[i0 + 1].gp).toBeGreaterThan(0)
      const mit = alle(erzeugeLeistungsverzeichnis(quelle(), { ...std, gestrichen: { 'Baustellen-Container-WC': true } }))
      expect(mit.map((p) => p.nr)).toEqual(ohne.map((p) => p.nr))
      expect(mit[i0].menge).toBe(0); expect(mit[i0].gp).toBe(0); expect(mit[i0].entfaellt).toBe(true)
      expect(mit[i0 + 1].menge).toBe(0); expect(mit[i0 + 1].gp).toBe(0)
    })

    it('Gerüst 1. BA = Aufbau + Abbau aus dem CAD, Vorhaltung = Standzeit in Wochen', () => {
      const q = quelle()
      const lv = erzeugeLeistungsverzeichnis(q, stat)
      const p = lv.titel[1].positionen
      expect(p[0].einheit).toBe('Stück')
      expect(p[0].menge).toBe(1)
      expect(p[0].ep).toBeGreaterThan(0)
      expect(p[1].einheit).toBe('Wo')
      expect(p[1].menge).toBe(50)
      expect(p[1].ep).toBeGreaterThan(0)
      expect(p[0].text.join(' ')).toContain('W09')
      expect(p[0].text.join(' ')).toContain('Lastklasse 4')
      expect(p[0].text.join(' ')).toContain('32,00 m')
    })

    it('Positionen ohne CAD-Wert haben Preis 0 und lassen sich in der Tabelle befüllen', () => {
      const q = quelle()
      const lv = erzeugeLeistungsverzeichnis(q, stat)
      const kederplane = alle(lv).find((p) => p.titel.startsWith('Vertikale Bekleidung der Gerüste 1. BA'))!
      expect(kederplane.ep).toBe(0)
      const lv2 = erzeugeLeistungsverzeichnis(q, { ...stat, epUeberschreibung: { [kederplane.titel]: 4200 } })
      const k2 = alle(lv2).find((p) => p.titel === kederplane.titel)!
      expect(k2.gp).toBe(4200)
      expect(lv2.summeNetto).toBeCloseTo(lv.summeNetto + 4200, 2)
    })

    it('Pauschalen und Stundensätze kommen aus den Eingaben', () => {
      const lv = erzeugeLeistungsverzeichnis(quelle(), stat)
      expect(lv.titel[3].positionen[0].ep).toBe(900)
      expect(lv.titel[4].positionen[0].ep).toBe(50)
      expect(lv.titel[4].positionen[2].ep).toBe(40)
    })
  })

  it('Gerüsthöhe im Langtext = oberste Lage (Raster), nicht die Gebäudehöhe', () => {
    const b: BuildingParams = { ...gebaeude, heightM: 11.2, eavesHeightM: 11.2, floorHeightsM: [2.8, 2.8, 2.8, 2.8] }
    const model = generateCADModel(b, 'layher-allround')
    const oben = Math.max(...model.levels.map((l) => l.topY))
    expect(oben).toBeGreaterThan(11.2)
    const materials: MaterialItem[] = generateBillOfMaterials(model).map((m) => ({ ...m, unitPrice: 10, totalPrice: m.quantity * 10 }))
    const log = calculateLogistics(model, materials, 2.0)
    const lv = erzeugeLeistungsverzeichnis({ model, materials, aufbauStunden: log.aufbauStunden, abbauStunden: log.abbauStunden }, mitPreisen)
    const text = lv.titel[1].positionen[0].text.join(' ')
    expect(text).toContain(`Höhe der obersten Gerüstlage ca. ${oben.toLocaleString('de-DE', { minimumFractionDigits: 2 })} m`)
  })
})
