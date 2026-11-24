import { describe, it, expect } from 'vitest'
import { aufmassStand, pruefeAufmassBezug, freiePositionenMitAufmassName, pruefeAufmassAenderung } from '../aufmass-integritaet'
import { neuesZwischenaufmassJePosition, normalisiereZwischenaufmasse, baueTeilleistungsPositionen, type Zwischenaufmass } from '../zwischenaufmass'

const P = (bezeichnung: string, menge: number, einzelpreis = 10, einheit = 'm²') => ({ bezeichnung, einheit, einzelpreis, menge })
const erst = (liste: Zwischenaufmass[], pos: ReturnType<typeof P>[], id: string, notiz = '') => {
  const r = neuesZwischenaufmassJePosition(liste, { stichtag: '2026-03-01', positionen: pos, notiz }, id)
  if (!r.ok) throw new Error(r.fehler)
  return [...liste, r.eintrag]
}
const roh = (l: Zwischenaufmass[]) => JSON.parse(JSON.stringify(l))
const bezug = (l: Zwischenaufmass[], id: string, positionen?: any[], stand?: string, art = 'abschlag') => {
  const z = l.find((x) => x.id === id)!
  return pruefeAufmassBezug({ rohListe: roh(l), zaId: id, stand: stand ?? aufmassStand(z), positionen: positionen ?? baueTeilleistungsPositionen(z, l).positionen, rechnungsart: art })
}

describe('Serverprüfung: Abrechnung nach Zwischenaufmaß', () => {
  it('akzeptiert genau die offene Differenz', () => {
    const l = erst(erst([], [P('A', 100)], 'a').map((z) => ({ ...z, rechnungId: 'r1', rechnungNr: 'RE-1' })), [P('A', 160)], 'b')
    expect(bezug(l, 'b').ok).toBe(true)
  })
  it('Doppelabrechnung derselben Position: bereits abgerechnetes Zwischenaufmaß wird abgelehnt', () => {
    const l = erst([], [P('A', 100)], 'a').map((z) => ({ ...z, rechnungId: 'r1', rechnungNr: 'RE-1' }))
    const r = bezug(l, 'a', [{ bezeichnung: 'x', menge: 100, einheit: 'm²', einzelpreis: 10 }])
    expect(r).toMatchObject({ ok: false, fehler: { code: 'AUFMASS_BEREITS_ABGERECHNET' } })
  })
  it('Aufmaß nach dem Öffnen des Dialogs geändert: Stand passt nicht mehr', () => {
    const l = erst([], [P('A', 100)], 'a')
    const stand = aufmassStand(l[0])
    const geaendert = [{ ...l[0], positionen: [{ ...l[0].positionen![0], menge: 120 }] }]
    expect(pruefeAufmassBezug({ rohListe: roh(geaendert), zaId: 'a', stand, positionen: baueTeilleistungsPositionen(l[0], l).positionen, rechnungsart: 'abschlag' })).toMatchObject({ ok: false, fehler: { code: 'AUFMASS_GEAENDERT' } })
  })
  it('zu hohe Menge oder anderer Preis in den Rechnungspositionen: Abweichung', () => {
    const l = erst([], [P('A', 100)], 'a')
    expect(bezug(l, 'a', [{ bezeichnung: 'x', menge: 150, einheit: 'm²', einzelpreis: 10 }])).toMatchObject({ ok: false, fehler: { code: 'AUFMASS_ABWEICHUNG' } })
    expect(bezug(l, 'a', [{ bezeichnung: 'x', menge: 100, einheit: 'm²', einzelpreis: 99 }])).toMatchObject({ ok: false, fehler: { code: 'AUFMASS_ABWEICHUNG' } })
    expect(bezug(l, 'a', [...baueTeilleistungsPositionen(l[0], l).positionen, { bezeichnung: 'extra', menge: 1, einheit: 'Stk.', einzelpreis: 5 }])).toMatchObject({ ok: false })
  })
  it('nur als Abschlag oder Schlussrechnung (Standardrechnung nicht), unbekanntes Aufmaß wird abgelehnt', () => {
    const l = erst([], [P('A', 100)], 'a')
    expect(bezug(l, 'a', undefined, undefined, 'standard')).toMatchObject({ ok: false, fehler: { code: 'AUFMASS_NUR_ABSCHLAG' } })
    expect(pruefeAufmassBezug({ rohListe: roh(l), zaId: 'zzz', stand: 'x', positionen: [], rechnungsart: 'abschlag' })).toMatchObject({ ok: false, fehler: { code: 'AUFMASS_NICHT_GEFUNDEN' } })
  })
  it('altes Aufmaß nur mit Gesamtfläche (ohne Positionen) bleibt abrechenbar, Menge fest, Preis aus der Rechnung', () => {
    const alt = normalisiereZwischenaufmasse([{ id: 'x', nr: 1, stichtag: '2026-01-01', flaecheM2: 80, notiz: '', erstelltAm: '' }])
    const ok = pruefeAufmassBezug({ rohListe: [{ id: 'x', nr: 1, stichtag: '2026-01-01', flaecheM2: 80, notiz: '', erstelltAm: '' }], zaId: 'x', stand: aufmassStand(alt[0]), positionen: [{ bezeichnung: 'T', menge: 80, einheit: 'm²', einzelpreis: 8.5 }], rechnungsart: 'abschlag' })
    expect(ok.ok).toBe(true)
    const zuViel = pruefeAufmassBezug({ rohListe: [{ id: 'x', nr: 1, stichtag: '2026-01-01', flaecheM2: 80 }], zaId: 'x', stand: aufmassStand(alt[0]), positionen: [{ bezeichnung: 'T', menge: 90, einheit: 'm²', einzelpreis: 8.5 }], rechnungsart: 'abschlag' })
    expect(zuViel.ok).toBe(false)
  })
})

describe('Freie Zusatzpositionen', () => {
  it('gleichnamige freie Position wird erkannt, andere Positionen nicht', () => {
    const l = erst([], [P('Gerüst Süd', 100)], 'a')
    expect(freiePositionenMitAufmassName(roh(l), [{ bezeichnung: ' gerüst  süd ', einheit: 'm²' }])).toEqual(['Gerüst Süd'])
    expect(freiePositionenMitAufmassName(roh(l), [{ bezeichnung: 'Statik', einheit: 'Pauschale' }])).toEqual([])
    expect(freiePositionenMitAufmassName(undefined, [{ bezeichnung: 'x', einheit: 'm²' }])).toEqual([])
  })
})

describe('Schutz abgerechneter Zwischenaufmaße', () => {
  const abger = () => erst([], [P('A', 100)], 'a').map((z) => ({ ...z, rechnungId: 'r1', rechnungNr: 'RE-1', abgerechnetAm: '2026-03-02' }))
  it('Löschen eines abgerechneten Aufmaßes wird blockiert', () => {
    expect(pruefeAufmassAenderung(roh(abger()), [])).toMatch(/nicht gelöscht/)
  })
  it('Korrektur einer abgerechneten Menge im selben Aufmaß wird blockiert, als NEUES Aufmaß mit Begründung geht es', () => {
    const alt = abger()
    const veraendert = roh(alt); veraendert[0].positionen[0].menge = 50
    expect(pruefeAufmassAenderung(roh(alt), veraendert)).toMatch(/nicht geändert/)
    expect(pruefeAufmassAenderung(roh(alt), roh(erst(alt, [P('A', 60)], 'b', 'Rückbau')))).toBeNull()
  })
  it('Rechnung selbst zuordnen oder Reservierung setzen ist über die normale Route nicht möglich', () => {
    const l = erst([], [P('A', 100)], 'a')
    const selbst = roh(l); selbst[0].rechnungId = 'fremd'
    expect(pruefeAufmassAenderung(roh(l), selbst)).toMatch(/kann hier nicht eingetragen/)
    const res = roh(l); res[0].reserviertAm = '2026-03-02T10:00:00Z'
    expect(pruefeAufmassAenderung(roh(l), res)).not.toBeNull()
  })
  it('Reservierte Aufmaße sind gesperrt; ein veralteter Browser-Stand ohne Reservierung überschreibt sie nicht', () => {
    const reserviert = roh(erst([], [P('A', 100)], 'a')); reserviert[0].reserviertAm = '2026-03-02T10:00:00Z'; reserviert[0].reserviertToken = 't'
    const ohne = roh(normalisiereZwischenaufmasse(reserviert))
    expect(pruefeAufmassAenderung(reserviert, ohne)).toMatch(/gerade abgerechnet/)
  })
  it('normales Erfassen, Löschen offener und unveränderte Rückgabe abgerechneter Aufmaße bleiben erlaubt (auch altes Format)', () => {
    const alt = abger()
    expect(pruefeAufmassAenderung(roh(alt), roh(normalisiereZwischenaufmasse(roh(alt))))).toBeNull()
    const offen = erst([], [P('A', 5)], 'o')
    expect(pruefeAufmassAenderung(roh(offen), [])).toBeNull()
    expect(pruefeAufmassAenderung([{ id: 'x', nr: 1, stichtag: '2026-01-01', flaecheM2: 80, rechnungId: 'r', rechnungNr: 'RE-1' }], [{ id: 'x', nr: 1, stichtag: '2026-01-01', flaecheM2: 80, rechnungId: 'r', rechnungNr: 'RE-1', notiz: '', erstelltAm: '' }])).toBeNull()
  })
})

import { readFileSync } from 'node:fs'
describe('Dialog und Server sind verdrahtet', () => {
  it('der Dialog schickt den Aufmaß-Bezug mit und markiert nicht mehr selbst im Browser', () => {
    const d = readFileSync('components/SchlussrechnungDialog.tsx', 'utf8')
    expect(d).toMatch(/aufmass: zaModus && zaAuswahl \? \{ za_id: zaAuswahl\.id, stand: aufmassStand\(zaAuswahl\) \}/)
    expect(d).not.toMatch(/markiereAbgerechnet/)
  })
  it('Rechnungs-Route reserviert vor dem Anlegen und gibt bei Fehler frei', () => {
    const s = readFileSync('app/api/invoices/route.ts', 'utf8')
    expect(s.indexOf("aktion: 'reservieren'")).toBeGreaterThan(0)
    expect(s.indexOf("aktion: 'reservieren'")).toBeLessThan(s.indexOf("'rechnung_anlegen_zugeordnet' : rpcName"))
    expect(s).toMatch(/p_art: aufmassRes \? 'aufmass' : 'vorhaltung'/)
    expect(s).toMatch(/await freigebenBeiFehler\(\)/)
  })
})
