import { describe, it, expect } from 'vitest'
import {
  neuesZwischenaufmassJePosition, markiereAbgerechnet, baueSchlussaufmassPositionen, baueTeilleistungsPositionen, istLetzterStand,
  type Zwischenaufmass, type ZaPositionEingabe,
} from '../zwischenaufmass'
import { aufmassStand, pruefeAufmassBezug } from '../aufmass-integritaet'
import { abschlagAbzug, baueAbzugsPositionen, summeNetto, type AbschlagLike } from '../schlussrechnung'

// Schritt 4: Schlussaufmaß als Differenz. Die Schlussrechnung weist die Gesamtleistung aus und zieht die Abschläge netto ab.
const P = (menge: number, vertragsmenge?: number, bezeichnung = 'Fassadengerüst', einzelpreis = 10): ZaPositionEingabe => ({ bezeichnung, einheit: 'm²', einzelpreis, menge, ...(vertragsmenge ? { vertragsmenge } : {}) })
const erfasse = (liste: Zwischenaufmass[], pos: ZaPositionEingabe[], id: string, notiz = '') => {
  const r = neuesZwischenaufmassJePosition(liste, { stichtag: '2026-03-01', positionen: pos, notiz }, id)
  if (!r.ok) throw new Error(r.fehler)
  return [...liste, r.eintrag]
}
const ab = (l: Zwischenaufmass[], id: string) => markiereAbgerechnet(l, id, { id: 'r-' + id, nummer: 'RE-' + id }, '2026-03-02')
const roh = (l: Zwischenaufmass[]) => JSON.parse(JSON.stringify(l))
// 800 → 1.000 → 1.200 (je als Abschlag abgerechnet) → Schlussaufmaß 1.250
const kette = () => {
  let l = ab(erfasse([], [P(800, 1250)], 'a'), 'a')
  l = ab(erfasse(l, [P(1000)], 'b'), 'b')
  l = ab(erfasse(l, [P(1200)], 'c'), 'c')
  return erfasse(l, [P(1250)], 'd')
}

describe('Schlussaufmaß: Positionen der Schlussrechnung', () => {
  it('Gesamtleistung 1.250 m² × 10 €; davon bereits abgerechnet 1.200 m²; Rest 50 m² (Mengenübersicht und Vergleichswert)', () => {
    const l = kette()
    const r = baueSchlussaufmassPositionen(l[3], l)
    expect(r.fehler).toBeNull()
    expect(r.positionen).toHaveLength(1)
    expect(r.positionen[0]).toMatchObject({ menge: 1250, einheit: 'm²', einzelpreis: 10 })
    expect(r.gesamtNetto).toBe(12500)
    expect(r.bisherNetto).toBe(12000)
    expect(r.mengenuebersicht).toMatch(/1\.250,00 m² gesamt, davon bereits abgerechnet 1\.200,00 m², Rest 50,00 m²/)
  })
  it('Zahlbetrag nach Abzug der Abschläge = nur die Differenz (50 m² × 10 €) – ohne doppelte Abrechnung', () => {
    const l = kette()
    const r = baueSchlussaufmassPositionen(l[3], l)
    // drei Abschläge: 800, 200, 200 m² × 10 € netto, bezahlt
    const inv = (id: string, netto: number): AbschlagLike => ({ id, invoice_number: 'RE-' + id, invoice_date: '2026-03-02', net_amount: netto, tax_rate: 19, tax_amount: netto * 0.19, gross_amount: netto * 1.19, status: 'bezahlt' })
    const abzuege = [inv('a', 8000), inv('b', 2000), inv('c', 2000)].map((i) => abschlagAbzug(i))
    expect(summeNetto([...r.positionen, ...baueAbzugsPositionen(abzuege)])).toBe(500)
  })
  it('ohne Abschläge: Schlussrechnung = Gesamtleistung', () => {
    const l = erfasse([], [P(300)], 'a')
    const r = baueSchlussaufmassPositionen(l[0], l)
    expect(r.bisherNetto).toBe(0)
    expect(summeNetto(r.positionen)).toBe(3000)
  })
  it('nur das aktuellste Zwischenaufmaß kann Schlussaufmaß sein', () => {
    const l = kette()
    expect(istLetzterStand(l[3], l)).toBe(true)
    expect(istLetzterStand(l[2], l)).toBe(false)
    const offen = erfasse(erfasse([], [P(100)], 'a'), [P(200)], 'b')
    expect(baueSchlussaufmassPositionen(offen[0], offen).fehler).toMatch(/nicht der letzte Stand/)
  })
  it('bereits abgerechnetes Zwischenaufmaß, nur Gesamtfläche, fehlender Preis, leer: jeweils Fehler', () => {
    const l = kette()
    expect(baueSchlussaufmassPositionen(ab(l, 'd')[3], ab(l, 'd')).fehler).toMatch(/bereits mit Rechnung/)
    const alt: Zwischenaufmass[] = [{ id: 'x', nr: 1, stichtag: '2026-01-01', flaecheM2: 80, notiz: '', erstelltAm: '' }]
    expect(baueSchlussaufmassPositionen(alt[0], alt).fehler).toMatch(/nur mit der Gesamtfläche/)
    const ohnePreis = erfasse([], [P(100, undefined, 'A', 0)], 'a')
    expect(baueSchlussaufmassPositionen(ohnePreis[0], ohnePreis).fehler).toMatch(/fehlt der Preis/)
  })
  it('Mehrmenge und zu viel abgerechnet werden gemeldet; entfallene Position (Menge 0) erscheint nicht auf der Rechnung', () => {
    let l = ab(erfasse([], [P(800, 1000), P(10, 10, 'Treppe', 100)], 'a'), 'a')
    l = erfasse(l, [P(1200), P(0, undefined, 'Treppe', 100)], 'b', 'Treppe entfällt')
    const r = baueSchlussaufmassPositionen(l[1], l)
    expect(r.positionen.map((p) => p.bezeichnung.split(' – ')[0])).toEqual(['Fassadengerüst'])
    expect(r.hinweise.join(' ')).toMatch(/Mehrmenge 200,00 m²/)
    expect(r.hinweise.join(' ')).toMatch(/„Treppe“: 10,00 m² mehr abgerechnet/)
  })
})

describe('Serverprüfung: Schlussrechnung nach Schlussaufmaß', () => {
  const bezug = (l: Zwischenaufmass[], id: string, positionen: any[], art = 'schluss', stand?: string) => pruefeAufmassBezug({ rohListe: roh(l), zaId: id, stand: stand ?? aufmassStand(l.find((x) => x.id === id)!), positionen, rechnungsart: art })
  const gesamt = (l: Zwischenaufmass[]) => baueSchlussaufmassPositionen(l[l.length - 1], l).positionen
  it('akzeptiert Gesamtleistung, auch mit Zusatzpositionen und Abzug der Abschläge dahinter', () => {
    const l = kette()
    const extra = [{ bezeichnung: 'Kran', menge: 1, einheit: 'Pauschale', einzelpreis: 850 }, { bezeichnung: 'abzüglich Abschlagsrechnung RE-1', menge: 1, einheit: 'Pauschale', einzelpreis: -12000 }]
    expect(bezug(l, 'd', [...gesamt(l), ...extra]).ok).toBe(true)
  })
  it('nur die Differenz statt der Gesamtleistung, falsche Menge, anderer Preis oder fehlende Position: Abweichung', () => {
    const l = kette()
    const g = gesamt(l)
    for (const falsch of [[{ ...g[0], menge: 50 }], [{ ...g[0], menge: 1300 }], [{ ...g[0], einzelpreis: 1 }], []]) {
      expect(bezug(l, 'd', falsch)).toMatchObject({ ok: false, fehler: { code: 'AUFMASS_SCHLUSS_ABWEICHUNG' } })
    }
  })
  it('nicht das letzte Zwischenaufmaß: abgelehnt', () => {
    const l = kette()
    const g = baueSchlussaufmassPositionen(l[3], l).positionen
    // l[2] ist abgerechnet → bereits abgerechnet; ein offenes, aber nicht letztes ZA:
    const offen = erfasse(erfasse([], [P(100)], 'a'), [P(200)], 'b')
    expect(bezug(offen, 'a', g)).toMatchObject({ ok: false, fehler: { code: 'AUFMASS_SCHLUSS_ABWEICHUNG' } })
    expect(bezug(l, 'c', g)).toMatchObject({ ok: false, fehler: { code: 'AUFMASS_BEREITS_ABGERECHNET' } })
  })
  it('Doppelabrechnung: ein bereits abgerechnetes Schlussaufmaß wird nicht noch einmal angenommen', () => {
    const l = ab(kette(), 'd')
    expect(bezug(l, 'd', gesamt(kette()))).toMatchObject({ ok: false, fehler: { code: 'AUFMASS_BEREITS_ABGERECHNET' } })
  })
  it('Aufmaß zwischen Dialog und Anlegen geändert: abgelehnt', () => {
    const l = kette()
    const stand = aufmassStand(l[3])
    const geaendert = roh(l); geaendert[3].positionen[0].menge = 1300
    expect(pruefeAufmassBezug({ rohListe: geaendert, zaId: 'd', stand, positionen: gesamt(l), rechnungsart: 'schluss' })).toMatchObject({ ok: false, fehler: { code: 'AUFMASS_GEAENDERT' } })
  })
  it('Standardrechnung mit Zwischenaufmaß bleibt gesperrt; Abschlag funktioniert unverändert', () => {
    const l = kette()
    expect(bezug(l, 'd', gesamt(l), 'standard')).toMatchObject({ ok: false, fehler: { code: 'AUFMASS_NUR_ABSCHLAG' } })
    expect(bezug(l, 'd', baueTeilleistungsPositionen(l[3], l).positionen, 'abschlag').ok).toBe(true)
  })
  it('nach der Schlussrechnung: neue Abrechnung nur über ein neues Zwischenaufmaß; Differenz bezieht sich auf die Schlussmenge', () => {
    const l = erfasse(ab(kette(), 'd'), [P(1300)], 'e')
    expect(baueTeilleistungsPositionen(l[4], l).positionen[0].menge).toBe(50)
  })
})
