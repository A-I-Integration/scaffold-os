import { describe, it, expect } from 'vitest'
import {
  normalisiereVereinbarung, fehlendeAngaben, faelligeVorhaltung, vorhaltungStatus, wirksameVereinbarung, pruefeVorhaltungVereinbarungAenderung,
  type Vorhaltevereinbarung,
} from '../vorhaltung'

// Schritt 7: Abmeldung durch den Kunden, Freigabe zum Abbau und tatsächlicher Abbau sind getrennte Ereignisse; das maßgebliche Datum wählt die Vereinbarung.
const basis = (extra: Partial<Vorhaltevereinbarung> = {}): Vorhaltevereinbarung => ({
  aktiv: true, beginn: '2026-10-01', freiTage: 0, intervall: 'woche', preis: 100, abrechnung: 'nachtraeglich', teilabbauten: [], ...extra,
})
const teil = { datum: '2026-10-22', abmeldungDatum: '2026-10-08', freigabeDatum: '2026-10-15', verbleibendProzent: 50, preisModus: 'anteilig' as const }

describe('Ereignisse normalisieren', () => {
  it('behält Abmeldung, Freigabe, Bereich, Verantwortlichen und Nachweis; verwirft ungültige Daten', () => {
    const v = normalisiereVereinbarung({ ...basis(), uebergabeDatum: '2026-10-01', abbauAbmeldung: '2026-10-20', abbauFreigabe: 'kaputt', abbauVerantwortlich: ' Max M. ', abbauNachweis: 'Protokoll 12',
      teilabbauten: [{ ...teil, bereich: ' Nordfassade ', verantwortlich: 'Lisa', nachweis: 'Foto 3', freigabeDatum: '31.12.' }] })!
    expect(v.uebergabeDatum).toBe('2026-10-01')
    expect(v.abbauAbmeldung).toBe('2026-10-20'); expect(v.abbauFreigabe).toBeUndefined()
    expect(v.abbauVerantwortlich).toBe('Max M.'); expect(v.abbauNachweis).toBe('Protokoll 12')
    expect(v.teilabbauten[0]).toMatchObject({ datum: '2026-10-22', abmeldungDatum: '2026-10-08', bereich: 'Nordfassade', verantwortlich: 'Lisa', nachweis: 'Foto 3' })
    expect(v.teilabbauten[0].freigabeDatum).toBeUndefined()
  })
  it('ohne stichtagModus bleibt alles wie bisher (tatsächlicher Abbau)', () => {
    const v = normalisiereVereinbarung(basis({ teilabbauten: [teil] }))!
    expect(v.stichtagModus).toBeUndefined()
    expect(wirksameVereinbarung(v)).toBe(v)
  })
})

describe('Maßgebliches Datum je Auftrag', () => {
  const rest = (v: Vorhaltevereinbarung, heute = '2026-11-05') => faelligeVorhaltung(v, [], heute)!.intervalle.map((i) => i.faktorProzent)
  it('tatsächlicher Abbau (Standard): Reduzierung ab 22.10.', () => {
    expect(rest(basis({ teilabbauten: [teil] }))).toEqual([100, 100, 100, 50, 50])
  })
  it('Abmeldung: Reduzierung ab 08.10. (zwei Intervalle früher)', () => {
    expect(rest(basis({ stichtagModus: 'abmeldung', teilabbauten: [teil] }))).toEqual([100, 50, 50, 50, 50])
  })
  it('Freigabe: Reduzierung ab 15.10.', () => {
    expect(rest(basis({ stichtagModus: 'freigabe', teilabbauten: [teil] }))).toEqual([100, 100, 50, 50, 50])
  })
  it('vollständiger Abbau: Abmeldung beendet die Vorhaltung früher als der tatsächliche Abbau', () => {
    const v = basis({ abbauDatum: '2026-10-29', abbauAbmeldung: '2026-10-15' })
    expect(faelligeVorhaltung(v, [], '2026-12-31')!.intervalle).toHaveLength(4)
    expect(faelligeVorhaltung({ ...v, stichtagModus: 'abmeldung' }, [], '2026-12-31')!.intervalle).toHaveLength(2)
  })
  it('fehlt das maßgebliche Datum, wird nicht abgerechnet und es wird gesagt, was fehlt', () => {
    const v = basis({ stichtagModus: 'abmeldung', teilabbauten: [{ ...teil, abmeldungDatum: undefined }], abbauDatum: '2026-10-29' })
    const fehlt = fehlendeAngaben(v)
    expect(fehlt.join(' ')).toContain('Abmeldung durch den Kunden beim Teilabbau am 22.10.2026')
    expect(fehlt.join(' ')).toContain('vollständigen Abbau am 29.10.2026')
    expect(faelligeVorhaltung(v, [], '2026-12-31')).toBeNull()
  })
  it('das gespeicherte Original bleibt unverändert (tatsächlicher Abbau wird dokumentiert)', () => {
    const v = basis({ stichtagModus: 'abmeldung', teilabbauten: [teil] })
    const w = wirksameVereinbarung(v)
    expect(w.teilabbauten[0].datum).toBe('2026-10-08'); expect(v.teilabbauten[0].datum).toBe('2026-10-22')
  })
})

describe('Hinweise und Schutz berechneter Zeiträume', () => {
  it('Hinweis, wenn Abmeldung nach dem tatsächlichen Abbau liegt, und Hinweis zum maßgeblichen Datum', () => {
    const v = basis({ stichtagModus: 'abmeldung', abbauDatum: '2026-10-10', abbauAbmeldung: '2026-10-20' })
    const h = vorhaltungStatus(v, [], '2026-12-31').hinweise.join(' ')
    expect(h).toContain('liegt nach dem tatsächlichen Abbau'); expect(h).toContain('Maßgeblich für die Abrechnung: Abmeldung durch den Kunden')
  })
  it('nach berechneten Zeiträumen darf der Stichtag nicht so umgestellt werden, dass sie sich ändern', () => {
    const alt = basis({ teilabbauten: [teil] })
    const perioden = [{ id: 'p', von: '2026-10-01', bis: '2026-11-05', intervalle: 5, netto: 450, rechnungId: 'r1' }]
    const fehler = pruefeVorhaltungVereinbarungAenderung(alt, { ...alt, stichtagModus: 'abmeldung' }, perioden)
    expect(fehler).toContain('würde bereits berechnete Zeiträume verändern')
  })
  it('reine Dokumentation (Verantwortlicher, Nachweis, Übergabe) bleibt auch nach Abrechnung änderbar', () => {
    const alt = basis({ teilabbauten: [teil] })
    const perioden = [{ id: 'p', von: '2026-10-01', bis: '2026-11-05', intervalle: 5, netto: 450, rechnungId: 'r1' }]
    const neu = { ...alt, uebergabeDatum: '2026-10-01', teilabbauten: [{ ...teil, verantwortlich: 'Lisa', nachweis: 'Protokoll 7', bereich: 'Nord' }] }
    expect(pruefeVorhaltungVereinbarungAenderung(alt, neu, perioden)).toBeNull()
  })
})
