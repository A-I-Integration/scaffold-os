import { describe, it, expect } from 'vitest'
import { berechneAuftragsstand, bezahltBrutto, sortiereRechnungen } from '../auftragsstand'

const r = (o: Partial<any>) => ({ id: 'x', invoice_number: 'RE-1', invoice_type: 'abschlag', status: 'offen', invoice_date: '2026-10-01', due_date: '2026-10-15', net_amount: 700, gross_amount: 833, paid_amount: 0, ...o })

describe('auftragsstand', () => {
  it('70/30: Abschlag + Schluss (nach Abzug) ergibt den Auftragswert', () => {
    const s = berechneAuftragsstand({ angebotNetto: 1000, nachtraege: [], rechnungen: [r({}), r({ id: 'y', invoice_number: 'RE-2', invoice_type: 'schluss', net_amount: 300, gross_amount: 357 })], heute: '2026-10-05' })
    expect(s.auftragswert).toBe(1000); expect(s.abgerechnet).toBe(1000); expect(s.restZuAbrechnen).toBe(0); expect(s.prozentAbgerechnet).toBe(100)
  })
  it('nur 70 % abgerechnet', () => {
    const s = berechneAuftragsstand({ angebotNetto: 1000, nachtraege: [], rechnungen: [r({})], heute: '2026-10-05' })
    expect(s.restZuAbrechnen).toBe(300); expect(s.prozentAbgerechnet).toBe(70)
  })
  it('bestätigte Nachträge erhöhen den Auftragswert, offene nicht', () => {
    const s = berechneAuftragsstand({ angebotNetto: 1000, nachtraege: [{ betrag: 200, status: 'bestaetigt' }, { betrag: 500, status: 'offen' }, { betrag: 90, status: 'abgelehnt' }], rechnungen: [r({})], heute: '2026-10-05' })
    expect(s.auftragswert).toBe(1200); expect(s.nachtraegeOffen).toBe(500); expect(s.restZuAbrechnen).toBe(500)
  })
  it('stornierte zählen nicht, Gutschrift mindert', () => {
    const s = berechneAuftragsstand({ angebotNetto: 1000, nachtraege: [], rechnungen: [r({ status: 'storniert' }), r({ id: 'g', invoice_type: 'gutschrift', net_amount: -100, gross_amount: -119 }), r({ id: 'z', net_amount: 1000, gross_amount: 1190 })], heute: '2026-10-05' })
    expect(s.abgerechnet).toBe(900); expect(s.anzahlGueltig).toBe(2)
  })
  it('bezahlt, offen, überfällig brutto', () => {
    const s = berechneAuftragsstand({ angebotNetto: 1000, nachtraege: [], rechnungen: [r({ status: 'bezahlt', gross_amount: 833 }), r({ id: 'b', net_amount: 300, gross_amount: 357, paid_amount: 57, due_date: '2026-10-01' })], heute: '2026-10-05' })
    expect(s.bezahlt).toBe(890); expect(s.offenBrutto).toBe(300); expect(s.ueberfaellig).toBe(300)
  })
  it('ohne Auftragswert kein Prozent, Rest 0', () => {
    const s = berechneAuftragsstand({ angebotNetto: 0, nachtraege: [], rechnungen: [r({})], heute: '2026-10-05' })
    expect(s.prozentAbgerechnet).toBeNull(); expect(s.restZuAbrechnen).toBe(0)
  })
  it('überabgerechnet: Rest nie negativ', () => expect(berechneAuftragsstand({ angebotNetto: 500, nachtraege: [], rechnungen: [r({})], heute: '2026-10-05' }).restZuAbrechnen).toBe(0))
  it('bezahltBrutto Teilzahlung und Obergrenze', () => { expect(bezahltBrutto(r({ paid_amount: 100 }) as any)).toBe(100); expect(bezahltBrutto(r({ paid_amount: 9999 }) as any)).toBe(833) })
  it('sortiert nach Datum', () => expect(sortiereRechnungen([{ invoice_date: '2026-10-05', invoice_number: 'B' }, { invoice_date: '2026-10-01', invoice_number: 'A' }]).map(x => x.invoice_number)).toEqual(['A', 'B']))
})
