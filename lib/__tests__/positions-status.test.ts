import { describe, it, expect } from 'vitest'
import { neuesZwischenaufmassJePosition, markiereAbgerechnet, type Zwischenaufmass, type ZaPositionEingabe } from '../zwischenaufmass'
import {
  baueBereichsStand, fuegeEreignisHinzu, normalisierePositionsEreignisse, pruefePositionsEreignisseAenderung, abgebautMenge,
  type PositionsEreignis, type EreignisEingabe,
} from '../positions-status'

// Beispiel aus der Vorgabe: Dachgerüst 10.000 € (100 m² × 100 €) und Fassadengerüst 20.000 € (200 m² × 100 €), Erstabrechnung 65 %.
const DACH = 'Dachgerüst', FASSADE = 'Fassadengerüst'
const eingabe = (dach: number, fassade: number): ZaPositionEingabe[] => [
  { bezeichnung: DACH, einheit: 'm²', einzelpreis: 100, menge: dach, vertragsmenge: 100 },
  { bezeichnung: FASSADE, einheit: 'm²', einzelpreis: 100, menge: fassade, vertragsmenge: 200 },
]
const erfasse = (liste: Zwischenaufmass[], dach: number, fassade: number, id: string, stichtag: string, notiz = '') => {
  const r = neuesZwischenaufmassJePosition(liste, { stichtag, positionen: eingabe(dach, fassade), notiz }, id)
  if (!r.ok) throw new Error(r.fehler)
  return [...liste, r.eintrag]
}
const ab = (l: Zwischenaufmass[], id: string) => markiereAbgerechnet(l, id, { id: 'r-' + id, nummer: 'RE-' + id }, '2026-10-10')
const keyVon = (l: Zwischenaufmass[], name: string) => l[0].positionen!.find((p) => p.bezeichnung === name)!.key
const HEUTE = '2026-12-31'
const ereignis = (liste: PositionsEreignis[], l: Zwischenaufmass[], e: EreignisEingabe, id: string, heute = HEUTE) => {
  const r = fuegeEreignisHinzu(liste, l, e, id, heute, new Date('2026-12-11T10:00:00Z'))
  if (!r.ok) throw new Error(r.fehler)
  return r.liste
}
const zeile = (l: Zwischenaufmass[], ev: PositionsEreignis[], name: string) => baueBereichsStand(l, ev, HEUTE).find((r) => r.bezeichnung === name)!

describe('Bereichsstand: Leistung, Abrechnung, noch abrechenbar', () => {
  it('Erstabrechnung 65 %: beide Bereiche 65 % geleistet und abgerechnet, Auftragswerte 10.000 / 20.000', () => {
    const l = ab(erfasse([], 65, 130, 'a', '2026-10-05'), 'a')
    const d = zeile(l, [], DACH), f = zeile(l, [], FASSADE)
    expect(d).toMatchObject({ auftragswert: 10000, leistungProzent: 65, abgerechnetProzent: 65, offenAusAufmass: 0, offenZumVertrag: 3500, status: 'steht' })
    expect(f).toMatchObject({ auftragswert: 20000, leistungProzent: 65, abgerechnetProzent: 65, offenZumVertrag: 7000 })
  })
  it('Dach abgebaut: Hinweis, das Aufmaß auf den Endstand zu setzen; Fassade bleibt unberührt', () => {
    let l = ab(erfasse([], 65, 130, 'a', '2026-10-05'), 'a')
    const ev = ereignis([], l, { key: keyVon(l, DACH), art: 'abbau', datum: '2026-12-10', vollstaendig: true }, 'e1')
    const d = zeile(l, ev, DACH)
    expect(d).toMatchObject({ status: 'abgebaut', restM: 0, letzterAbbau: '2026-12-10' })
    expect(d.hinweise.join(' ')).toContain('Aufmaß auf den Endstand aktualisieren')
    expect(zeile(l, ev, FASSADE)).toMatchObject({ status: 'steht', restM: 200, hinweise: [] })
  })
  it('nach Endaufmaß Dach 100 %: 3.500 € abrechenbar, Fassade 0 €; später Fassade 7.000 €', () => {
    let l = ab(erfasse([], 65, 130, 'a', '2026-10-05'), 'a')
    l = erfasse(l, 100, 130, 'b', '2026-12-10')
    expect(zeile(l, [], DACH).offenAusAufmass).toBe(3500)
    expect(zeile(l, [], FASSADE).offenAusAufmass).toBe(0)
    l = ab(l, 'b')
    expect(zeile(l, [], DACH)).toMatchObject({ abgerechnetProzent: 100, offenAusAufmass: 0, offenZumVertrag: 0 })
    expect(zeile(l, [], FASSADE)).toMatchObject({ abgerechnetProzent: 65, offenZumVertrag: 7000 })
    l = erfasse(l, 100, 200, 'c', '2027-01-20')
    expect(zeile(l, [], FASSADE).offenAusAufmass).toBe(7000)
    expect(zeile(l, [], DACH).offenAusAufmass).toBe(0)
  })
  it('ohne Vertragsmenge: keine Prozentwerte, aber Beträge aus dem Aufmaß', () => {
    const r = neuesZwischenaufmassJePosition([], { stichtag: '2026-10-05', positionen: [{ bezeichnung: 'Gerüst', einheit: 'm²', einzelpreis: 10, menge: 50 }] }, 'a')
    if (!r.ok) throw new Error(r.fehler)
    expect(zeile([r.eintrag], [], 'Gerüst')).toMatchObject({ vereinbart: 0, leistungProzent: null, abgerechnetProzent: null, auftragswert: null, offenZumVertrag: null, offenAusAufmass: 500 })
  })
})

describe('Ereignisse je Position', () => {
  const l = ab(erfasse([], 65, 130, 'a', '2026-10-05'), 'a')
  const dach = keyVon(l, DACH)
  it('Abmeldung, Freigabe und Abbau werden getrennt geführt', () => {
    let ev = ereignis([], l, { key: dach, art: 'abmeldung', datum: '2026-12-05', ansprechpartner: 'Herr Meier', nachweis: 'Mail 12' }, 'e1')
    ev = ereignis(ev, l, { key: dach, art: 'freigabe', datum: '2026-12-07' }, 'e2')
    ev = ereignis(ev, l, { key: dach, art: 'abbau', datum: '2026-12-10', vollstaendig: true, nachweis: 'Protokoll 7' }, 'e3')
    expect(zeile(l, ev, DACH)).toMatchObject({ abmeldung: '2026-12-05', freigabe: '2026-12-07', letzterAbbau: '2026-12-10', status: 'abgebaut' })
    expect(ev[0]).toMatchObject({ ansprechpartner: 'Herr Meier', nachweis: 'Mail 12' })
  })
  it('Teilabbau nach Menge: 40 von 100 m² → teilweise abgebaut, Rest 60 m²; weitere 60 → abgebaut', () => {
    let ev = ereignis([], l, { key: dach, art: 'abbau', datum: '2026-12-01', menge: 40 }, 'e1')
    expect(zeile(l, ev, DACH)).toMatchObject({ status: 'teilabgebaut', abgebautM: 40, restM: 60 })
    ev = ereignis(ev, l, { key: dach, art: 'abbau', datum: '2026-12-10', menge: 60 }, 'e2')
    expect(zeile(l, ev, DACH)).toMatchObject({ status: 'abgebaut', restM: 0 })
  })
  it('mehr abbauen als vorhanden wird abgelehnt', () => {
    const ev = ereignis([], l, { key: dach, art: 'abbau', datum: '2026-12-01', menge: 80 }, 'e1')
    const r = fuegeEreignisHinzu(ev, l, { key: dach, art: 'abbau', datum: '2026-12-02', menge: 30 }, 'e2', HEUTE)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.fehler).toContain('nur 100,00 m²')
  })
  it('nach vollständigem Abbau kein weiterer Abbau', () => {
    const ev = ereignis([], l, { key: dach, art: 'abbau', datum: '2026-12-01', vollstaendig: true }, 'e1')
    const r = fuegeEreignisHinzu(ev, l, { key: dach, art: 'abbau', datum: '2026-12-02', menge: 5 }, 'e2', HEUTE)
    expect(r.ok).toBe(false); if (!r.ok) expect(r.fehler).toContain('bereits vollständig abgebaut')
  })
  it('Prüfungen: Zukunft nur als geplanter Abbau, Menge nötig, unbekannte Position, falsche Felder', () => {
    const f = (e: EreignisEingabe) => { const r = fuegeEreignisHinzu([], l, e, 'x', '2026-12-10'); return r.ok ? null : r.fehler }
    expect(f({ key: dach, art: 'abbau', datum: '2026-12-20', vollstaendig: true })).toContain('Zukunft')
    expect(fuegeEreignisHinzu([], l, { key: dach, art: 'geplanter_abbau', datum: '2026-12-20' }, 'x', '2026-12-10').ok).toBe(true)
    expect(f({ key: dach, art: 'abbau', datum: '2026-12-01' })).toContain('abgebaute Menge')
    expect(f({ key: 'gibt-es-nicht', art: 'abmeldung', datum: '2026-12-01' })).toContain('gibt es im Aufmaß nicht')
    expect(f({ key: dach, art: 'abmeldung', datum: '2026-12-01', menge: 5 })).toContain('nur beim tatsächlichen Abbau')
    expect(f({ key: dach, art: 'abmeldung', datum: '01.12.2026' })).toContain('Datum')
  })
  it('doppelt abgeschickt (gleiche ID) legt nichts zweimal an', () => {
    const ev = ereignis([], l, { key: dach, art: 'abmeldung', datum: '2026-12-05' }, 'e1')
    expect(ereignis(ev, l, { key: dach, art: 'abmeldung', datum: '2026-12-05' }, 'e1')).toHaveLength(1)
  })
  it('Hinweise: Abmeldung nach Abbau, geplanter Abbau überfällig', () => {
    let ev = ereignis([], l, { key: dach, art: 'abbau', datum: '2026-12-01', vollstaendig: true }, 'e1')
    ev = ereignis(ev, l, { key: dach, art: 'abmeldung', datum: '2026-12-09' }, 'e2')
    expect(zeile(l, ev, DACH).hinweise.join(' ')).toContain('Abmeldung')
    const ev2 = ereignis([], l, { key: keyVon(l, FASSADE), art: 'geplanter_abbau', datum: '2026-11-01' }, 'e3')
    expect(zeile(l, ev2, FASSADE).hinweise.join(' ')).toContain('liegt in der Vergangenheit')
  })
  it('abgebautMenge summiert nur Abbau-Ereignisse der Position', () => {
    const ev = ereignis(ereignis([], l, { key: dach, art: 'abbau', datum: '2026-12-01', menge: 10 }, 'e1'), l, { key: dach, art: 'abmeldung', datum: '2026-12-02' }, 'e2')
    expect(abgebautMenge(ev, dach)).toEqual({ menge: 10, vollstaendig: false })
  })
})

describe('Server: Verlauf nur anfügen', () => {
  const l = ab(erfasse([], 65, 130, 'a', '2026-10-05'), 'a')
  const dach = keyVon(l, DACH)
  const alt = ereignis([], l, { key: dach, art: 'abmeldung', datum: '2026-12-05' }, 'e1')
  it('neues Ereignis anfügen ist ok', () => {
    const neu = ereignis(alt, l, { key: dach, art: 'freigabe', datum: '2026-12-07' }, 'e2')
    expect(pruefePositionsEreignisseAenderung(alt, neu)).toBeNull()
  })
  it('Löschen und Ändern werden abgelehnt', () => {
    expect(pruefePositionsEreignisseAenderung(alt, [])).toContain('nicht gelöscht')
    expect(pruefePositionsEreignisseAenderung(alt, [{ ...alt[0], datum: '2026-12-06' }])).toContain('nicht geändert')
  })
  it('ungültige Einträge und Nicht-Listen werden abgelehnt', () => {
    expect(pruefePositionsEreignisseAenderung(alt, [...alt, { id: 'x', key: dach, art: 'unsinn', datum: '2026-12-01' }])).toContain('ungültig')
    expect(pruefePositionsEreignisseAenderung(alt, 'text')).toContain('ungültig')
  })
  it('Normalisierung verwirft Menge bei Nicht-Abbau und kaputte Daten', () => {
    const n = normalisierePositionsEreignisse([{ id: 'a', key: 'k', art: 'freigabe', datum: '2026-12-01', menge: 5, vollstaendig: true }, { id: 'b', key: 'k', art: 'abbau', datum: 'x' }])
    expect(n).toHaveLength(1); expect(n[0].menge).toBeUndefined(); expect(n[0].vollstaendig).toBeUndefined()
  })
})
