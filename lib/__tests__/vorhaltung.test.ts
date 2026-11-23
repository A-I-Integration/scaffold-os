import { describe, it, expect } from 'vitest'
import {
  normalisiereVereinbarung, faelligeVorhaltung, vorhaltungStatus, kostenpflichtigAb, plusMonate, periodenPassen,
  pruefeVorhaltungBezug, vorhaltungStand, normalisierePerioden, istVorhaltungsRechnung, pruefeVorhaltePeriodenAenderung, type Vorhaltevereinbarung, type VorhaltePeriode,
} from '../vorhaltung'

const V = (o: Partial<Vorhaltevereinbarung> = {}): Vorhaltevereinbarung => ({ aktiv: true, beginn: '2026-03-02', freiTage: 28, intervall: 'woche', preis: 100, abrechnung: 'im_voraus', teilabbauten: [], ...o })
const P = (von: string, bis: string, o: Partial<VorhaltePeriode> = {}): VorhaltePeriode => ({ id: von, von, bis, intervalle: 1, netto: 100, rechnungId: 'r', ...o })

describe('Vorhaltung nach Vertragsbedingungen', () => {
  it('kostenlose Vorhaltezeit: vorher nichts fällig, kostenpflichtig ab Beginn + Frist', () => {
    expect(kostenpflichtigAb(V())).toBe('2026-03-30')
    expect(faelligeVorhaltung(V(), [], '2026-03-29')).toBeNull()
    expect(vorhaltungStatus(V(), [], '2026-03-29').phase).toBe('frei')
  })
  it('im Voraus: angefangenes Intervall zählt voll; nachträglich erst nach Ablauf', () => {
    const f = faelligeVorhaltung(V(), [], '2026-04-02')!
    expect(f).toMatchObject({ von: '2026-03-30', bis: '2026-04-06', netto: 100 })
    expect(f.positionen).toEqual([{ bezeichnung: expect.stringContaining('30.03.2026 bis 05.04.2026'), menge: 1, einheit: 'Wo.', einzelpreis: 100, art: 'miete' }])
    expect(faelligeVorhaltung(V({ abrechnung: 'nachtraeglich' }), [], '2026-04-05')).toBeNull()
    expect(faelligeVorhaltung(V({ abrechnung: 'nachtraeglich' }), [], '2026-04-07')).toMatchObject({ von: '2026-03-30', bis: '2026-04-06', netto: 100 })
    expect(faelligeVorhaltung(V(), [], '2026-04-06')).toMatchObject({ bis: '2026-04-13', netto: 200 })
  })
  it('bereits berechnete Zeiträume werden nicht noch einmal berechnet (kumuliert)', () => {
    const bisher = [P('2026-03-30', '2026-04-13', { intervalle: 2, netto: 200 })]
    expect(faelligeVorhaltung(V(), bisher, '2026-04-12')).toBeNull()
    expect(faelligeVorhaltung(V(), bisher, '2026-04-20')).toMatchObject({ von: '2026-04-13', bis: '2026-04-27', netto: 200 })
  })
  it('Monatsintervall mit Monatsende', () => {
    expect(plusMonate('2026-01-31', 1)).toBe('2026-02-28')
    const f = faelligeVorhaltung(V({ intervall: 'monat', freiTage: 0, beginn: '2026-01-31', preis: 800 }), [], '2026-03-10')!
    expect(f.intervalle.map((i) => [i.von, i.bis])).toEqual([['2026-01-31', '2026-02-28'], ['2026-02-28', '2026-03-31']])
    expect(f.positionen[0]).toMatchObject({ menge: 2, einheit: 'Monat', einzelpreis: 800 })
  })
  it('Teilabbau senkt den Preis ab dem Datum (Restbestand), getrennte Positionen', () => {
    const v = V({ freiTage: 0, beginn: '2026-03-02', teilabbauten: [{ datum: '2026-03-16', verbleibendProzent: 60 }] })
    const f = faelligeVorhaltung(v, [], '2026-03-25')!
    expect(f.positionen.map((p) => [p.menge, p.einzelpreis])).toEqual([[2, 100], [2, 60]])
    expect(f.positionen[1].bezeichnung).toContain('60 % Restbestand')
    expect(f.netto).toBe(320)
  })
  it('vollständiger Abbau beendet die Vorhaltung; das angefangene Intervall zählt voll', () => {
    const v = V({ freiTage: 0, abbauDatum: '2026-03-18' })
    expect(faelligeVorhaltung(v, [], '2026-06-01')).toMatchObject({ von: '2026-03-02', bis: '2026-03-23', netto: 300 })
    const nach = [P('2026-03-02', '2026-03-23', { intervalle: 3, netto: 300 })]
    expect(faelligeVorhaltung(v, nach, '2026-06-01')).toBeNull()
    expect(vorhaltungStatus(v, nach, '2026-06-01').phase).toBe('abgebaut')
  })
  it('Hinweise: freie Zeit läuft aus; fehlende Angaben; nichts ohne aktive Vereinbarung', () => {
    expect(vorhaltungStatus(V(), [], '2026-03-25').hinweise[0]).toMatch(/endet in 5 Tagen/)
    expect(vorhaltungStatus(V(), [], '2026-03-18').hinweise[0]).toMatch(/endet in 12 Tagen/)
    expect(vorhaltungStatus(V({ preis: 0 }), [], '2026-04-10').hinweise[0]).toMatch(/Preis je Intervall/)
    expect(faelligeVorhaltung(V({ aktiv: false }), [], '2026-09-01')).toBeNull()
    expect(faelligeVorhaltung(V({ preis: 0 }), [], '2026-09-01')).toBeNull()
  })
  it('geänderte Bedingungen nach Abrechnung: nichts wird automatisch fortgeschrieben', () => {
    const bisher = [P('2026-03-30', '2026-04-13', { intervalle: 2, netto: 200 })]
    const geaendert = V({ freiTage: 30 })
    expect(periodenPassen(geaendert, bisher)).toBe(false)
    expect(faelligeVorhaltung(geaendert, bisher, '2026-05-30')).toBeNull()
    expect(vorhaltungStatus(geaendert, bisher, '2026-05-30').hinweise.join(' ')).toMatch(/passen nicht mehr/)
  })
  it('normalisiert defensiv und erkennt Vorhaltungs-Rechnungen', () => {
    expect(normalisiereVereinbarung({ aktiv: true, beginn: 'kaputt', freiTage: -5, preis: 'x' })).toMatchObject({ beginn: '', freiTage: 0, preis: 0, intervall: 'woche' })
    expect(normalisiereVereinbarung(null)).toBeNull()
    expect(istVorhaltungsRechnung({ positions: [{ art: 'miete' }] })).toBe(true)
    expect(istVorhaltungsRechnung({ positions: [{ art: 'miete' }, { art: 'geruest' }] })).toBe(false)
    expect(istVorhaltungsRechnung({ positions: [] })).toBe(false)
  })
})

describe('Serverprüfung Vorhaltung', () => {
  const heute = '2026-04-02'
  const basis = () => {
    const v = V(); const f = faelligeVorhaltung(v, [], heute)!
    return { vereinbarungRoh: v, periodenRoh: [], von: f.von, bis: f.bis, stand: vorhaltungStand(v, []), positionen: f.positionen, heute }
  }
  it('akzeptiert genau den fälligen Zeitraum', () => { expect(pruefeVorhaltungBezug(basis()).ok).toBe(true) })
  it('lehnt falsche Menge, falschen Preis, falschen Zeitraum, geänderte Bedingungen und Doppelabrechnung ab', () => {
    const b = basis()
    expect(pruefeVorhaltungBezug({ ...b, positionen: [{ menge: 5, einheit: 'Wo.', einzelpreis: 100 }] })).toMatchObject({ ok: false, code: 'VORHALTUNG_ABWEICHUNG' })
    expect(pruefeVorhaltungBezug({ ...b, positionen: [{ menge: 2, einheit: 'Wo.', einzelpreis: 90 }] })).toMatchObject({ ok: false, code: 'VORHALTUNG_ABWEICHUNG' })
    expect(pruefeVorhaltungBezug({ ...b, bis: '2026-05-01' })).toMatchObject({ ok: false, code: 'VORHALTUNG_ZEITRAUM' })
    expect(pruefeVorhaltungBezug({ ...b, vereinbarungRoh: V({ preis: 120 }) })).toMatchObject({ ok: false, code: 'VORHALTUNG_GEAENDERT' })
    const perioden = [P(b.von, b.bis, { intervalle: 2, netto: 200 })]
    expect(pruefeVorhaltungBezug({ ...b, periodenRoh: perioden, stand: vorhaltungStand(V(), perioden) })).toMatchObject({ ok: false, code: 'VORHALTUNG_NICHTS_FAELLIG' })
  })
  it('Perioden nur über die Rechnung änderbar', () => {
    const p = [P('2026-03-30', '2026-04-13')]
    expect(pruefeVorhaltePeriodenAenderung(p, p)).toBeNull()
    expect(pruefeVorhaltePeriodenAenderung(p, [])).toMatch(/nicht geändert/)
    expect(pruefeVorhaltePeriodenAenderung([], p)).not.toBeNull()
    expect(normalisierePerioden('x')).toEqual([])
  })
})

import { kontrolleBaustelle } from '../abrechnung-pruefung'
import { berechneAuftragsstand } from '../auftragsstand'
describe('Vorhaltung gehört nicht zum Auftragswert', () => {
  const r = (o: any) => ({ id: 'x', invoice_number: 'RE-1', invoice_type: 'standard', status: 'offen', invoice_date: '2026-01-01', net_amount: 0, gross_amount: 0, paid_amount: 0, ...o })
  const rechnungen = [r({ invoice_type: 'schluss', net_amount: 1000, gross_amount: 1190 }), r({ id: 'v', invoice_number: 'RE-2', net_amount: 500, gross_amount: 595, positions: [{ art: 'miete' }] })]
  it('Kontrollanzeige: getrennt ausgewiesen, keine falsche Überabrechnung, offen/bezahlt zählt aber mit', () => {
    const k = kontrolleBaustelle({ angebotNetto: 1000, nachtraegeBestaetigt: 0, nachtraegeAngefragt: 0, rechnungen })
    expect(k).toMatchObject({ abgerechnet: 1000, vorhaltung: 500, offenBrutto: 1785 })
    expect(k.abweichungen).toEqual([])
  })
  it('Auftragsstand: Vorhaltung nicht in „abgerechnet“, aber in offen', () => {
    const s = berechneAuftragsstand({ angebotNetto: 1000, nachtraege: [], rechnungen: rechnungen as any })
    expect(s).toMatchObject({ abgerechnet: 1000, restZuAbrechnen: 0, vorhaltungNetto: 500, offenBrutto: 1785 })
  })
})
