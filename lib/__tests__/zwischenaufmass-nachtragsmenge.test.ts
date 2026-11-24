import { describe, it, expect } from 'vitest'
import {
  neuesZwischenaufmassJePosition, zaZeilen, markiereAbgerechnet, baueTeilleistungsPositionen, baueSchlussaufmassPositionen,
  nachtraegeUeberAufmass, normalisiereZwischenaufmasse, type Zwischenaufmass, type ZaPositionEingabe,
} from '../zwischenaufmass'
import { pruefeAufmassAenderung, aufmassStand } from '../aufmass-integritaet'

// Schritt 6: Nachtragsmenge je Position (genehmigte Zusatzmenge, getrennt von der Vertragsmenge)
const P = (menge: number, extra: Partial<ZaPositionEingabe> = {}): ZaPositionEingabe => ({ bezeichnung: 'Fassadengerüst', einheit: 'm²', einzelpreis: 10, menge, ...extra })
const erfasse = (liste: Zwischenaufmass[], pos: ZaPositionEingabe[], id: string, notiz = '') => {
  const r = neuesZwischenaufmassJePosition(liste, { stichtag: '2026-03-01', positionen: pos, notiz }, id)
  if (!r.ok) throw new Error(r.fehler)
  return [...liste, r.eintrag]
}
const fehler = (liste: Zwischenaufmass[], pos: ZaPositionEingabe[], notiz = '') => {
  const r = neuesZwischenaufmassJePosition(liste, { stichtag: '2026-03-01', positionen: pos, notiz }, 'x')
  return r.ok ? null : r.fehler
}
const ab = (l: Zwischenaufmass[], id: string) => markiereAbgerechnet(l, id, { id: 'r-' + id, nummer: 'RE-1' }, '2026-03-02')
const NACHTRAG = { nachtragMenge: 200, nachtragId: 'n1' }

describe('Nachtragsmenge', () => {
  it('wird gespeichert und bei Folgeständen übernommen', () => {
    const l = erfasse(erfasse([], [P(500, { vertragsmenge: 1000, ...NACHTRAG })], 'a'), [P(700)], 'b')
    expect(l[1].positionen![0]).toMatchObject({ vertragsmenge: 1000, nachtragMenge: 200, nachtragId: 'n1' })
  })
  it('erweitert die vereinbarte Menge: 1.100 bei 1.000 + 200 → keine Mehrmenge', () => {
    const l = erfasse([], [P(1100, { vertragsmenge: 1000, ...NACHTRAG })], 'a')
    expect(zaZeilen(l[0], l)[0]).toMatchObject({ mehrmenge: 0, neuMehrmenge: 0 })
    expect(baueTeilleistungsPositionen(l[0], l).hinweise).toEqual([])
  })
  it('darüber hinaus bleibt es eine Mehrmenge, mit Hinweis auf Vertrag + Nachtrag', () => {
    const l = erfasse([], [P(1300, { vertragsmenge: 1000, ...NACHTRAG })], 'a')
    expect(zaZeilen(l[0], l)[0]).toMatchObject({ mehrmenge: 100, neuMehrmenge: 100 })
    expect(baueTeilleistungsPositionen(l[0], l).hinweise.join(' ')).toContain('Vertrag 1.000,00 + Nachtrag 200,00')
  })
  it('ohne Nachtragsmenge unverändert: Mehrmenge gegen die Vertragsmenge', () => {
    const l = erfasse([], [P(1100, { vertragsmenge: 1000 })], 'a')
    expect(zaZeilen(l[0], l)[0].mehrmenge).toBe(100)
  })
  it('Nachtragsmenge ohne Nachtrag oder ohne Vertragsmenge wird abgelehnt', () => {
    expect(fehler([], [P(10, { vertragsmenge: 100, nachtragMenge: 50 })])).toContain('Nachtrag auswählen')
    expect(fehler([], [P(10, { nachtragMenge: 50, nachtragId: 'n1' })])).toContain('keine Vertragsmenge')
    expect(fehler([], [P(10, { vertragsmenge: 100, nachtragMenge: -1, nachtragId: 'n1' })])).toContain('ungültig')
  })
  it('Änderung oder Entfernen einer bestehenden Nachtragsmenge braucht eine Notiz', () => {
    const l = erfasse([], [P(500, { vertragsmenge: 1000, ...NACHTRAG })], 'a')
    expect(fehler(l, [P(600, { nachtragMenge: 300, nachtragId: 'n1' })])).toContain('Nachtragsmenge')
    expect(fehler(l, [P(600, { nachtragMenge: 0 })])).toContain('Nachtragsmenge')
    expect(fehler(l, [P(600, { nachtragMenge: 300, nachtragId: 'n1' })], 'Nachtrag erweitert')).toBeNull()
  })
  it('Schlussaufmaß: keine Mehrmenge-Warnung für die genehmigte Menge', () => {
    let l = erfasse([], [P(800, { vertragsmenge: 1000, ...NACHTRAG })], 'a'); l = ab(l, 'a')
    l = erfasse(l, [P(1150)], 'b')
    const r = baueSchlussaufmassPositionen(l[1], l)
    expect(r.hinweise.filter((h) => h.includes('Mehrmenge'))).toEqual([])
    expect(r.gesamtNetto).toBe(11500)
  })
  it('Nachträge über Aufmaß werden erkannt', () => {
    const l = erfasse([], [P(500, { vertragsmenge: 1000, ...NACHTRAG })], 'a')
    expect([...nachtraegeUeberAufmass(l)]).toEqual(['n1'])
    expect(nachtraegeUeberAufmass(erfasse([], [P(5)], 'b')).size).toBe(0)
  })
  it('Fingerabdruck ändert sich mit der Nachtragsmenge', () => {
    const a = erfasse([], [P(500, { vertragsmenge: 1000, nachtragMenge: 200, nachtragId: 'n1' })], 'a')
    const b = erfasse([], [P(500, { vertragsmenge: 1000, nachtragMenge: 300, nachtragId: 'n1' })], 'a')
    expect(aufmassStand(a[0])).not.toBe(aufmassStand(b[0]))
  })
  it('Normalisierung verwirft Nachtragsmenge ohne Nachtrag-ID', () => {
    const [z] = normalisiereZwischenaufmasse([{ id: 'a', nr: 1, stichtag: '2026-03-01', flaecheM2: 1, positionen: [{ key: 'k', bezeichnung: 'X', einheit: 'm²', einzelpreis: 1, menge: 1, vertragsmenge: 5, nachtragMenge: 3 }] }])
    expect(z.positionen![0].nachtragMenge).toBeUndefined()
  })
})

describe('Server: Nachtrag muss bestätigt sein', () => {
  const roh = (l: Zwischenaufmass[]) => JSON.parse(JSON.stringify(l))
  const nachtrag = (status: string) => [{ id: 'n1', nr: 2, datum: '2026-02-01', titel: 'Anbau', grund: '', betrag: 1000, fotos: [], status, erstelltAm: '' }]
  const neu = erfasse([], [P(500, { vertragsmenge: 1000, ...NACHTRAG })], 'a')
  it('bestätigt: ok', () => expect(pruefeAufmassAenderung([], roh(neu), nachtrag('bestaetigt'))).toBeNull())
  it('offen: abgelehnt', () => expect(pruefeAufmassAenderung([], roh(neu), nachtrag('offen'))).toContain('noch nicht vom Kunden bestätigt'))
  it('unbekannter Nachtrag: abgelehnt', () => expect(pruefeAufmassAenderung([], roh(neu), [])).toContain('existiert nicht'))
})

import { baueAufmassBeleg } from '../zwischenaufmass-pdf'
describe('Aufmaß-Beleg (PDF-Daten)', () => {
  it('deckt die Nachtragsmenge ab und nennt bei Überschreitung Vertrag + Nachtrag', () => {
    const ok = erfasse([], [P(1100, { vertragsmenge: 1000, ...NACHTRAG })], 'a')
    expect(baueAufmassBeleg(ok[0], ok, 'kumuliert').hinweise.join(' ')).not.toContain('Mehrmenge')
    const mehr = erfasse([], [P(1300, { vertragsmenge: 1000, ...NACHTRAG })], 'a')
    const b = baueAufmassBeleg(mehr[0], mehr, 'kumuliert')
    expect(b.zeilen[0]).toMatchObject({ vertrag: 1000, nachtrag: 200, mehrmenge: 100 })
    expect(b.hinweise.join(' ')).toContain('Vertrag 1.000,00 + Nachtrag 200,00')
  })
})
