import { describe, it, expect } from 'vitest'
import { geruestPositionen } from '@/lib/aufmass-rechnung'
import { berechneM2Abrechnung, pruefeAbrechnungEintrag } from '@/lib/calculations/m2-abrechnung'
import { rechnungAusLv, artAusTitel } from '@/lib/lv-zu-rechnung'
import { rechneLvNeu } from '@/lib/projekt-lv'
import { neuesZwischenaufmass, baueTeilleistungsPosition, markiereAbgerechnet, neueMengeM2, type Zwischenaufmass } from '@/lib/zwischenaufmass'
import { bereinigePosition, aktualisierePosition, preisMitFaktor, mengenVorschlaege } from '@/lib/rechnung-position'
import { zahlAusEingabe, zahlAusEingabeStreng } from '@/lib/zahl-eingabe'
import { lieferMengenAusMaterialliste } from '@/lib/lieferung-mengen'
import { calculateScaffoldMaterial } from '@/lib/calculations/scaffold-engine'
import type { Leistungsverzeichnis } from '@/lib/leistungsverzeichnis'
import type { ScaffoldInput } from '@/types/scaffold'

// Kleiner, wiederholbarer Zufallsgenerator (damit Fehlschläge reproduzierbar sind)
function zufall(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 } }
const cent = (n: number) => Math.round(n * 100) / 100

describe('Zahlen aus Formularen: eine Regel überall', () => {
  it.each([['1500.5', 1500.5], ['1500,5', 1500.5], ['1.500,50', 1500.5], ['12,5', 12.5], ['12.5', 12.5], ['0,99', 0.99], [' 7 ', 7], ['', 0], ['abc', 0]])('%s → %s', (eingabe, erwartet) => {
    expect(zahlAusEingabe(eingabe)).toBe(erwartet)
  })
  it('Preis je m² im deutschen Format wird nicht mehr als 1,5 gelesen (war: "1.500,50" → 1,5)', () => {
    expect(pruefeAbrechnungEintrag({ art: 'grundpreis', name: 'Test', preis_m2: '1.500,50' })).toBeNull()
    // und zu hoch bleibt zu hoch:
    expect(pruefeAbrechnungEintrag({ art: 'grundpreis', name: 'Test', preis_m2: '10.000,01' })).toContain('zwischen')
    expect(pruefeAbrechnungEintrag({ art: 'grundpreis', name: 'Test', preis_m2: 'zwölf' })).toContain('keine Zahl')
    expect(pruefeAbrechnungEintrag({ art: 'grundpreis', name: 'Test', preis_m2: '12,5' })).toBeNull()
    expect(zahlAusEingabeStreng('1.500,50')).toBe(1500.5)
    expect(zahlAusEingabeStreng('x1')).toBeNaN()
  })
  it('Rechnungsposition: Menge/Preis "1.500,50" wird nicht mehr zu 0 (war: 0)', () => {
    const p = bereinigePosition({ bezeichnung: 'A', menge: '1.500,50', einheit: 'm²', einzelpreis: '2,5' })
    expect(p.menge).toBe(1500.5)
    expect(p.einzelpreis).toBe(2.5)
    expect(aktualisierePosition({ bezeichnung: 'A', menge: 1, einheit: 'm²', einzelpreis: 1 }, 'menge', '1.500,50').menge).toBe(1500.5)
    expect(aktualisierePosition({ bezeichnung: 'A', menge: 1, einheit: 'm²', einzelpreis: 1 }, 'einzelpreis', '3,25').einzelpreis).toBe(3.25)
  })
  it('Listenpreis × Faktor ergibt den Einzelpreis, auf Cent gerundet', () => {
    expect(preisMitFaktor(10, 85)).toBe(8.5)
    expect(preisMitFaktor(9.99, 33)).toBe(3.3)
    const p = aktualisierePosition({ bezeichnung: 'A', menge: 1, einheit: 'm²', einzelpreis: 0, listenpreis: 20 }, 'faktorProzent', '75')
    expect(p.einzelpreis).toBe(15)
  })
})

describe('Gerüstpositionen aus dem Aufmaß: Summe bleibt exakt der Angebotspreis', () => {
  it('bei beliebigen Abschnitten und Preisen (Zufallstest, 500 Fälle)', () => {
    const z = zufall(42)
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(z() * 5)
      const abschnitte = Array.from({ length: n }, (_, k) => ({ bezeichnung: `Fassade ${k + 1}`, areaM2: cent(z() * 300 + (z() < 0.1 ? -50 : 1)) }))
      const flaeche = cent(abschnitte.reduce((s, a) => s + Math.max(0, a.areaM2), 0))
      const basis = cent(z() * 50000 + 100)
      const festpreis = z() < 0.5 ? cent(z() * 40 + 1) : undefined
      const pos = geruestPositionen({ basis, flaecheM2: flaeche, festpreisProM2: festpreis, abschnitte, pauschaleText: 'Gerüstbau' })
      const summe = cent(pos.reduce((s, p) => s + p.menge * p.einzelpreis, 0))
      expect(Math.abs(summe - basis), `Fall ${i}`).toBeLessThan(0.011)
      expect(pos.every((p) => p.einzelpreis >= 0 && p.menge > 0)).toBe(true)
    }
  })
  it('ohne gültigen Preis gibt es nur die Pauschale (kein Rechnen mit 0)', () => {
    const pos = geruestPositionen({ basis: 0, flaecheM2: 100, pauschaleText: 'P' })
    expect(pos).toHaveLength(1)
    expect(pos[0].einzelpreis).toBe(0)
  })
  it('Festpreis je m² passt genau → Positionen je Fassade mit m²', () => {
    const pos = geruestPositionen({ basis: 1000, flaecheM2: 100, festpreisProM2: 10, abschnitte: [{ bezeichnung: 'Nord', areaM2: 60 }, { bezeichnung: 'Süd', areaM2: 40 }], pauschaleText: 'P' })
    expect(pos.map((p) => [p.menge, p.einheit, p.einzelpreis])).toEqual([[60, 'm²', 10], [40, 'm²', 10]])
  })
})

describe('Abrechnung nach m²', () => {
  it('Fläche × (Grundpreis + Aufpreise), Ungültiges zählt als 0', () => {
    expect(berechneM2Abrechnung({ flaecheM2: 100, grundpreisM2: 5, aufpreiseM2: [1.5, 0.5] })).toEqual({ preisProM2: 7, summe: 700 })
    expect(berechneM2Abrechnung({ flaecheM2: -5, grundpreisM2: 5, aufpreiseM2: [] }).summe).toBe(0)
    expect(berechneM2Abrechnung({ flaecheM2: 10, grundpreisM2: NaN, aufpreiseM2: [-3, 2] })).toEqual({ preisProM2: 2, summe: 20 })
  })
})

function zufaelligesLv(z: () => number): Leistungsverzeichnis {
  const titel = Array.from({ length: 1 + Math.floor(z() * 3) }, (_, t) => ({
    nr: String(t + 1), titel: `Titel ${t + 1}`, summe: 0,
    positionen: Array.from({ length: 1 + Math.floor(z() * 6) }, (_, p) => {
      const menge = z() < 0.1 ? 0 : cent(z() * 500)
      const ep = z() < 0.1 ? 0 : cent(z() * 90 + 0.5)
      const faktor = z() < 0.3 ? Math.round(50 + z() * 100) : undefined
      return { nr: `${t + 1}.${p + 1}`, titel: ['Gerüst Modul', 'Aufbau', 'Vorhaltung je Woche', 'Abbau', 'Stundenlohn', 'Sonstiges'][Math.floor(z() * 6)], einheit: 'm²', menge, ep, gp: cent(menge * ep * ((faktor ?? 100) / 100)), faktorProzent: faktor, entfaellt: z() < 0.1 }
    }),
  }))
  return { titel, summeNetto: 0, mwst: 0, summeBrutto: 0 } as unknown as Leistungsverzeichnis
}

describe('Leistungsverzeichnis → Rechnung', () => {
  it('jede Position mit Menge und Preis wird übernommen, Rest steht in "übersprungen"; Rundung höchstens ½ Cent je Position', () => {
    const z = zufall(7)
    for (let i = 0; i < 300; i++) {
      const lv = rechneLvNeu(zufaelligesLv(z))
      const alle = lv.titel.flatMap((t) => t.positionen)
      const gueltig = alle.filter((p) => !p.entfaellt && p.menge > 0 && p.ep > 0)
      const r = rechnungAusLv(lv)
      expect(r.positions).toHaveLength(gueltig.length)
      expect(r.uebersprungen).toHaveLength(alle.length - gueltig.length)
      // Summe = Summe aus Menge × Einzelpreis
      expect(r.summeNetto).toBeCloseTo(r.positions.reduce((s, p) => s + p.menge * p.einzelpreis, 0), 1)
      // Abweichung zur LV-Summe nur durch das Runden des Einzelpreises
      const grenze = gueltig.reduce((s, p) => s + p.menge * 0.005, 0) + 0.011
      expect(Math.abs(r.rundungsDifferenz), `Fall ${i}`).toBeLessThanOrEqual(grenze)
    }
  })
  it('Art der Position aus dem Titel; Vorhaltung hat Vorrang vor Gerüst', () => {
    expect(artAusTitel('Gerüst Vorhaltung je Woche')).toBe('miete')
    expect(artAusTitel('Aufbau Fassadengerüst')).toBe('aufbau')
    expect(artAusTitel('Fassadengerüst Modul')).toBe('geruest')
    expect(artAusTitel('Irgendwas', 'Std.')).toBe('regie')
    expect(artAusTitel('Kederplane')).toBe('plane')
  })
})

describe('LV von Hand ändern → neu rechnen', () => {
  it('ist idempotent, entfallene Positionen zählen 0, Summen stimmen, MwSt = 19 % der Netto-Summe', () => {
    const z = zufall(11)
    for (let i = 0; i < 200; i++) {
      const lv = rechneLvNeu(zufaelligesLv(z))
      expect(rechneLvNeu(lv)).toEqual(lv)
      for (const t of lv.titel) {
        expect(t.summe).toBeCloseTo(t.positionen.reduce((s, p) => s + p.gp, 0), 1)
        for (const p of t.positionen) if (p.entfaellt) expect(p.gp).toBe(0)
      }
      expect(lv.summeNetto).toBeCloseTo(lv.titel.reduce((s, t) => s + t.summe, 0), 1)
      expect(lv.mwst).toBeCloseTo(lv.summeNetto * 0.19, 1)
      expect(lv.summeBrutto).toBeCloseTo(lv.summeNetto + lv.mwst, 1)
    }
  })
  it('MwSt folgt dem Satz des LV (z. B. 7 %), nicht fest 19 % (war: immer 19 %)', () => {
    const roh = zufaelligesLv(zufall(3)) as unknown as { eingaben?: { mwstProzent: number } }
    roh.eingaben = { mwstProzent: 7 }
    const lv = rechneLvNeu(roh as unknown as Leistungsverzeichnis)
    expect(lv.mwst).toBeCloseTo(lv.summeNetto * 0.07, 1)
  })
  it('negative oder unlesbare Mengen/Preise werden zu 0', () => {
    const lv = rechneLvNeu({ titel: [{ nr: '1', titel: 'T', summe: 0, positionen: [{ nr: '1.1', titel: 'A', einheit: 'm²', menge: -5, ep: 'x' as unknown as number, gp: 99 }] }], summeNetto: 0, mwst: 0, summeBrutto: 0 } as unknown as Leistungsverzeichnis)
    expect(lv.titel[0].positionen[0]).toMatchObject({ menge: 0, ep: 0, gp: 0 })
  })
})

describe('Zwischenaufmaß: abgerechnet wird jede Fläche genau einmal', () => {
  it('Summe der abgerechneten Mengen = letzte kumulierte Fläche (Zufallsabfolge)', () => {
    const z = zufall(5)
    for (let i = 0; i < 200; i++) {
      let liste: Zwischenaufmass[] = []
      let kum = 0
      let abgerechnet = 0
      const schritte = 1 + Math.floor(z() * 6)
      for (let k = 0; k < schritte; k++) {
        kum = cent(kum + z() * 100 + 0.5)
        const e = neuesZwischenaufmass(liste, { stichtag: `2026-0${1 + k}-15`, flaecheM2: kum }, `z${k}`)
        expect(e.ok).toBe(true)
        if (!e.ok) return
        liste = [...liste, e.eintrag]
        if (z() < 0.7) {
          const pos = baueTeilleistungsPosition({ z: e.eintrag, liste, preisProM2: 12.5 })
          expect(pos.fehler).toBeNull()
          abgerechnet = cent(abgerechnet + pos.position!.menge)
          liste = markiereAbgerechnet(liste, e.eintrag.id, { id: `r${k}`, nummer: `R${k}` }, '2026-09-01')
        }
      }
      const letzteAbgerechnet = Math.max(0, ...liste.filter((x) => x.rechnungId).map((x) => x.flaecheM2))
      expect(abgerechnet).toBeCloseTo(letzteAbgerechnet, 1)
    }
  })
  it('weniger oder gleich viel kumuliert wie zuvor wird abgelehnt; doppelt abrechnen auch', () => {
    let liste: Zwischenaufmass[] = []
    const a = neuesZwischenaufmass(liste, { stichtag: '2026-01-31', flaecheM2: 100 }, 'a')
    if (!a.ok) throw new Error('x')
    liste = [a.eintrag]
    expect(neuesZwischenaufmass(liste, { stichtag: '2026-02-28', flaecheM2: 100 }, 'b').ok).toBe(false)
    expect(neuesZwischenaufmass(liste, { stichtag: '2026-02-28', flaecheM2: 80 }, 'b').ok).toBe(false)
    liste = markiereAbgerechnet(liste, 'a', { id: 'r', nummer: 'R1' }, '2026-02-01')
    expect(baueTeilleistungsPosition({ z: liste[0], liste, preisProM2: 10 }).fehler).toContain('bereits')
    expect(neueMengeM2(liste[0], liste.map((x) => ({ ...x })))).toBe(100)
  })
})

describe('Mengenvorschläge aus Maßen', () => {
  it('L×H, L×B×H, L×B, Länge – je nach vorhandenen Maßen', () => {
    expect(mengenVorschlaege({ laengeM: 10, hoeheM: 5 })[0]).toMatchObject({ menge: 50, einheit: 'm²' })
    expect(mengenVorschlaege({ laengeM: 10, breiteM: 2, hoeheM: 5 }).map((v) => v.einheit)).toEqual(['m²', 'm³'])
    expect(mengenVorschlaege({ laengeM: 10, breiteM: 2 })[0]).toMatchObject({ menge: 20, einheit: 'm²' })
    expect(mengenVorschlaege({ laengeM: 10 })[0]).toMatchObject({ menge: 10, einheit: 'm' })
    expect(mengenVorschlaege({})).toEqual([])
  })
})

describe('Liefermengen aus der Materialliste (echte Kalkulation)', () => {
  const eingabe: ScaffoldInput = {
    customer: 'T', address: 'x', trade: 'fassade', projectDurationDays: 14, lengthM: 15, heightM: 10, widthM: 8, eavesHeightM: 10,
    roofForm: 'satteldach', roofOverhangM: 0.3, facadeType: 'mauerwerk', obstacles: [], scaffoldType: 'rahmen', deckingType: 'stahl',
    fieldLengthM: 2.57, groundType: 'beton', anchorType: 'fassadenanker', groundCondition: 'beton', hasSlope: false, hasLightShafts: false,
    hasBasement: false, needsLoadDistribution: false,
    environment: { hasPowerLines: false, hasVegetation: false, hasNeighborProperty: false, hasPublicTraffic: false, needsNoParkingZone: false, needsSpecialUse: false, hasStorageArea: false, hasTruckAccess: false, needsCrane: false, needsProtectionRoof: false, needsSafetyNet: false },
    windZone: 2, hazards: [], additionalNotes: '',
  }
  const begriffe: Record<string, string[]> = {
    arbeitsbuehnen: ['bühne', 'buehne', 'plattform'], rahmen: ['rahmen'], diagonale: ['diagonal'], spindeltreppe: ['treppe'], gelander: ['geländ', 'gelaend', 'handlauf'], anker: ['anker'],
  }
  it('kein Bauteil der Materialliste wird in zwei Lieferfeldern doppelt gezählt', () => {
    for (const typ of ['rahmen', 'modul'] as const) {
      const r = calculateScaffoldMaterial({ ...eingabe, scaffoldType: typ })
      for (const m of r.materialList) {
        const treffer = Object.entries(begriffe).filter(([, ks]) => ks.some((k) => String(m.name).toLowerCase().includes(k) || String((m as { category?: string }).category ?? '').toLowerCase().includes(k)))
        expect(treffer.length, `${m.name} / ${(m as { category?: string }).category} zählt in ${treffer.map((t) => t[0]).join(' + ')}`).toBeLessThanOrEqual(1)
      }
    }
  })
  it('Summe je Feld = Summe der passenden Zeilen; leere Liste → leere Felder', () => {
    const r = calculateScaffoldMaterial(eingabe)
    const l = lieferMengenAusMaterialliste(r.materialList as never)
    const rahmen = r.materialList.filter((m) => String(m.name).toLowerCase().includes('rahmen')).reduce((s, m) => s + m.quantity, 0)
    expect(Number(l.rahmen || 0)).toBe(rahmen)
    expect(lieferMengenAusMaterialliste(null).rahmen).toBe('')
  })
})
