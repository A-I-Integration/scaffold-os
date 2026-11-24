import { describe, it, expect } from 'vitest'
import { berechneSpesen, satzAm, auszahlungsMonat, endbetrag, type Satz } from '../spesen'

const S = (regelwerk: string, schluessel: string, wert: number, gueltig_ab = '2021-04-01'): Satz => ({ regelwerk, schluessel, wert, gueltig_ab })
const saetze: Satz[] = [
  S('tarif', 'verpflegung_heimfahrt', 3.5), S('tarif', 'verpflegung_schwelle_stunden', 10), S('tarif', 'ausloesung_voll', 24), S('tarif', 'ausloesung_an_abreise', 12),
  S('steuer', 'pauschale_ueber_8h', 14), S('steuer', 'pauschale_schwelle_stunden', 8), S('steuer', 'pauschale_24h', 28), S('steuer', 'pauschale_an_abreise', 14),
  S('steuer', 'kuerzung_fruehstueck_prozent', 20), S('steuer', 'kuerzung_mittag_prozent', 40), S('steuer', 'kuerzung_abend_prozent', 40),
]
const rechne = (o: Record<string, unknown>) => { const e = berechneSpesen({ datum: '2026-11-10', einsatzart: 'heimfahrt', abwesenheitStunden: 9, ...o } as never, saetze); if (!e.ok) throw new Error(e.fehler); return e }

describe('Spesen nach Tarif Gerüstbau (§ 7 RTV) und steuerlicher Pauschale', () => {
  it('Heimfahrt: 3,50 € erst bei mehr als 10 Stunden; steuerlich 14 € bei mehr als 8 Stunden', () => {
    expect(rechne({ abwesenheitStunden: 10 }).tarif.betrag).toBe(0)
    expect(rechne({ abwesenheitStunden: 10.25 }).tarif.betrag).toBe(3.5)
    expect(rechne({ abwesenheitStunden: 8 }).steuer.betrag).toBe(0)
    expect(rechne({ abwesenheitStunden: 9 }).steuer.betrag).toBe(14)
    expect(rechne({ abwesenheitStunden: 9 }).tarif.betrag).toBe(0)
  })
  it('Auswärts: 24 € voll, 12 € An-/Abreise; steuerlich 28 € / 14 €', () => {
    expect(rechne({ einsatzart: 'auswaerts_voll' }).tarif.betrag).toBe(24)
    expect(rechne({ einsatzart: 'auswaerts_voll' }).steuer.betrag).toBe(28)
    for (const a of ['auswaerts_anreise', 'auswaerts_abreise']) { expect(rechne({ einsatzart: a }).tarif.betrag).toBe(12); expect(rechne({ einsatzart: a }).steuer.betrag).toBe(14) }
  })
  it('gestellte Mahlzeiten kürzen die Auslösung nach den steuerlichen Pauschalen, nie unter 0', () => {
    expect(rechne({ einsatzart: 'auswaerts_voll', fruehstueck: true }).tarif.betrag).toBe(18.4)
    expect(rechne({ einsatzart: 'auswaerts_voll', fruehstueck: true, mittag: true }).tarif.betrag).toBe(7.2)
    expect(rechne({ einsatzart: 'auswaerts_voll', fruehstueck: true, mittag: true, abend: true }).tarif.betrag).toBe(0)
    expect(rechne({ einsatzart: 'auswaerts_anreise', mittag: true, abend: true }).tarif.betrag).toBe(0)
    expect(rechne({ abwesenheitStunden: 11, mittag: true }).tarif.betrag).toBe(3.5)
  })
  it('Fortbildung: keine Zulagen', () => {
    const e = rechne({ einsatzart: 'auswaerts_voll', fortbildung: true })
    expect(e.tarif.betrag).toBe(0); expect(e.steuer.betrag).toBe(0); expect(e.tarif.begruendung[0]).toContain('Fortbildung')
  })
  it('jede Berechnung ist begründet und nennt Nicht-Geprüftes', () => {
    const e = rechne({ einsatzart: 'auswaerts_voll' })
    expect(e.tarif.begruendung.join(' ')).toContain('§ 7 Nr. 4.2.2'); expect(e.hinweise.join(' ')).toContain('65 km')
  })
  it('weist Ungültiges und fehlende Sätze ab', () => {
    expect(berechneSpesen({ datum: '2026-11-10', einsatzart: 'x', abwesenheitStunden: 9 }, saetze).ok).toBe(false)
    expect(berechneSpesen({ datum: '2026-11-10', einsatzart: 'heimfahrt', abwesenheitStunden: 25 }, saetze).ok).toBe(false)
    const r = berechneSpesen({ datum: '2026-11-10', einsatzart: 'heimfahrt', abwesenheitStunden: 9 }, saetze.filter(s => s.schluessel !== 'ausloesung_voll'))
    expect(r.ok).toBe(false); if (!r.ok) expect(r.fehler).toContain('ausloesung_voll')
  })
  it('Sätze gelten ab Datum: neue Fassung wirkt nur für spätere Tage', () => {
    const neu = [...saetze, S('tarif', 'ausloesung_voll', 26, '2027-01-01')]
    expect(satzAm(neu, 'tarif', 'ausloesung_voll', '2026-12-31')).toBe(24)
    expect(satzAm(neu, 'tarif', 'ausloesung_voll', '2027-01-01')).toBe(26)
    expect(satzAm(neu, 'tarif', 'ausloesung_voll', '2020-01-01')).toBeNull()
    expect(berechneSpesen({ datum: '2027-02-01', einsatzart: 'auswaerts_voll', abwesenheitStunden: 24 }, neu)).toMatchObject({ ok: true, tarif: { betrag: 26 } })
  })
  it('Auszahlungsmonat und manueller Vorrang', () => {
    expect(auszahlungsMonat('2026-11', 1)).toBe('2026-12'); expect(auszahlungsMonat('2026-12', 1)).toBe('2027-01'); expect(auszahlungsMonat('2026-11', 0)).toBe('2026-11')
    expect(endbetrag({ vorschlag_tarif: 24, betrag_manuell: null })).toBe(24); expect(endbetrag({ vorschlag_tarif: 24, betrag_manuell: 0 })).toBe(0)
  })
})
