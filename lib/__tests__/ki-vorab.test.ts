import { describe, it, expect } from 'vitest'
import { baueVorabEingabe } from '../ki-vorab'
import { pruefeKiAntwort } from '../ki-anfrage'
import { calculateScaffoldMaterial } from '../calculations/scaffold-engine'

const ANRUF = `Hier ist Thomas Müller von der Müller Bau GmbH. Baustelle in Vreden, Fassadengerüst. Das Gebäude ist ungefähr 18 Meter lang und 12 Meter breit. Die Traufhöhe liegt bei etwa 8 Metern. Gerüst rund um das Gebäude, sechs bis acht Wochen. An einer Seite befindet sich eine Einfahrt, die möglichst frei bleiben muss. Außerdem brauchen wir einen Treppenaufgang. Arbeitshöhe 10 Meter.`
const ki = { kunde: 'Müller Bau GmbH', ort: 'Vreden', leistung: 'Fassadengerüst', gebaeude_laenge_m: 18, gebaeude_breite_m: 12, umlaufend: true, traufhoehe_m: 8, arbeitshoehe_m: 10, standzeit_wochen: 8 }

describe('Vorab-Eingabe', () => {
  it('ohne Arbeitshöhe keine Berechnung; die Traufhöhe wird nicht ersatzweise genommen', () => {
    const e = pruefeKiAntwort({ ...ki, arbeitshoehe_m: null }, ANRUF.replace(' Arbeitshöhe 10 Meter.', '')).entwurf
    const v = baueVorabEingabe(e, 'Müller Bau GmbH')
    expect(v.eingabe).toBeNull()
    expect(v.fehlt[0]).toContain('Arbeitshöhe')
    expect(v.fehlt[0]).toContain('Traufhöhe')
  })
  it('ohne Länge keine Berechnung', () => {
    const e = pruefeKiAntwort({ kunde: 'A', arbeitshoehe_m: 10 }, 'Arbeitshöhe 10 Meter').entwurf
    expect(baueVorabEingabe(e, 'A').fehlt.join(' ')).toContain('Länge')
  })
  it('baut die Eingabe: Umfang 60 m, Arbeitshöhe 10 m, Traufhöhe getrennt, 56 Tage', () => {
    const e = pruefeKiAntwort(ki, ANRUF).entwurf
    const v = baueVorabEingabe(e, 'Müller Bau GmbH')
    expect(v.fehlt).toEqual([])
    expect(v.eingabe).toMatchObject({ lengthM: 60, heightM: 10, eavesHeightM: 8, projectDurationDays: 56, trade: 'fassade', scaffoldType: 'rahmen', windZone: 1 })
  })
  it('listet jede Annahme und die nicht berücksichtigten Besonderheiten auf', () => {
    const e = pruefeKiAntwort(ki, ANRUF).entwurf
    const a = baueVorabEingabe(e, 'X').annahmen.join('\n')
    for (const t of ['Rahmengerüst', 'Belag: Stahl', 'Fassadenanker', 'Windzone 1', 'Umfang rundum', 'ohne Abzug für Einfahrt', 'Nicht berücksichtigt (nur als Hinweis): Einfahrt freihalten, Treppenaufgang']) expect(a).toContain(t)
  })
  it('Die Besonderheiten verändern die Eingabe nicht (keine erfundene Konstruktion)', () => {
    const mit = baueVorabEingabe(pruefeKiAntwort(ki, ANRUF).entwurf, 'X').eingabe
    const ohneText = ANRUF.replace(/An einer Seite[^.]*\./, '').replace(/Außerdem[^.]*\./, '')
    const ohne = baueVorabEingabe(pruefeKiAntwort(ki, ohneText).entwurf, 'X').eingabe
    expect(mit).toEqual(ohne)
  })
  it('Die feste Berechnung läuft damit durch und liefert Positionen und Preise', () => {
    const v = baueVorabEingabe(pruefeKiAntwort(ki, ANRUF).entwurf, 'X')
    const res = calculateScaffoldMaterial(v.eingabe!)
    expect(res.materialList.length).toBeGreaterThan(0)
    expect(res.totalCost).toBeGreaterThan(0)
    expect(res.suggestedPrice).toBeGreaterThan(res.totalCost)
  })
})
