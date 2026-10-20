import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, calculateLogistics, type BuildingParams } from '../calculations/cad-engine'
import { rechteckUmriss } from '../calculations/cad-umriss'
import { erzeugeLeistungsverzeichnis, breitenklasse, LV_STANDARD_EINGABEN, LASTKLASSEN, type LvEingaben } from '../leistungsverzeichnis'
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
})
